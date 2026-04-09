from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
import json
from pathlib import Path
import time

import numpy as np
import pandas as pd
from psycopg.rows import dict_row

from app.services.dataset import DATA_DIR, _connect_db

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
MODEL_REGISTRY_PATH = MODELS_DIR / "model_registry.json"
ACTIVE_MODEL_PATH = MODELS_DIR / "active_model.txt"

DEFAULT_EPOCHS = 5
DEFAULT_BATCH_SIZE = 2
DEFAULT_WINDOW_SIZE = 60
FEATURE_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]
DEFAULT_TRAIN_RATIO = 0.8


def _load_legacy_model_registry() -> list[dict]:
    if not MODEL_REGISTRY_PATH.exists():
        return []

    try:
        raw = json.loads(MODEL_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []

    if not isinstance(raw, list):
        return []

    entries: list[dict] = []
    for item in raw:
        if isinstance(item, dict) and isinstance(item.get("modelFile"), str):
            entries.append(item)

    return entries


def _read_legacy_active_model() -> str | None:
    if not ACTIVE_MODEL_PATH.exists():
        return None

    try:
        active = ACTIVE_MODEL_PATH.read_text(encoding="utf-8").strip()
    except OSError:
        return None

    return active or None


def _parse_legacy_timestamp(value: str | None, fallback_file: Path) -> datetime:
    if value:
        cleaned = str(value).strip().replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(cleaned)
        except ValueError:
            pass

    return datetime.fromtimestamp(fallback_file.stat().st_mtime)


def _infer_symbol_from_model_file(model_file: str) -> str:
    stem = Path(model_file).stem
    normalized = stem.replace("saved_model_", "", 1)
    return normalized.split("_", 1)[0].upper()


def _set_active_model_in_tx(cur, model_file: str) -> None:
    cur.execute("SELECT id FROM trained_models WHERE model_file = %s;", (model_file,))
    row = cur.fetchone()
    if not row:
        raise RuntimeError(f"Model '{model_file}' does not exist.")

    cur.execute("UPDATE trained_models SET is_active = FALSE, updated_at = NOW() WHERE is_active = TRUE;")
    cur.execute(
        "UPDATE trained_models SET is_active = TRUE, updated_at = NOW() WHERE model_file = %s;",
        (model_file,),
    )


def _get_row_value(row, key: str, idx: int = 0) -> str | None:
    if row is None:
        return None

    if isinstance(row, dict):
        value = row.get(key)
        return str(value) if value is not None else None

    try:
        value = row[idx]
    except Exception:  # noqa: BLE001
        value = None

    return str(value) if value is not None else None


def _ensure_any_active_model(cur) -> str | None:
    cur.execute("SELECT model_file FROM trained_models WHERE is_active = TRUE LIMIT 1;")
    active_row = cur.fetchone()
    if active_row:
        return _get_row_value(active_row, "model_file")

    cur.execute("SELECT model_file FROM trained_models ORDER BY trained_at DESC, id DESC LIMIT 1;")
    fallback = cur.fetchone()
    if not fallback:
        return None

    chosen = _get_row_value(fallback, "model_file")
    if not chosen:
        return None

    _set_active_model_in_tx(cur, chosen)
    return chosen


def init_trained_models_table() -> None:
    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS trained_models (
                    id BIGSERIAL PRIMARY KEY,
                    model_name TEXT NOT NULL,
                    symbol VARCHAR(16) NOT NULL,
                    model_file TEXT NOT NULL UNIQUE,
                    model_path TEXT NOT NULL,
                    dataset_file TEXT,
                    training_params JSONB NOT NULL,
                    trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    is_active BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_trained_models_single_active
                ON trained_models ((1))
                WHERE is_active = TRUE;
                """
            )

            cur.execute("SELECT model_file FROM trained_models;")
            existing_files = {str(row[0]) for row in cur.fetchall()}
            legacy_registry = {
                str(item["modelFile"]): item
                for item in _load_legacy_model_registry()
                if isinstance(item.get("modelFile"), str)
            }

            for file_path in MODELS_DIR.glob("*.keras"):
                if file_path.name in existing_files:
                    continue

                metadata = legacy_registry.get(file_path.name, {})
                params_payload = {
                    "epochs": metadata.get("epochs"),
                    "batchSize": metadata.get("batchSize"),
                    "windowSize": metadata.get("windowSize"),
                }
                cur.execute(
                    """
                    INSERT INTO trained_models (
                        model_name,
                        symbol,
                        model_file,
                        model_path,
                        dataset_file,
                        training_params,
                        trained_at,
                        is_active
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, FALSE)
                    ON CONFLICT (model_file) DO NOTHING;
                    """,
                    (
                        file_path.stem,
                        str(metadata.get("symbol") or _infer_symbol_from_model_file(file_path.name)).upper(),
                        file_path.name,
                        str(file_path.resolve()),
                        metadata.get("datasetFile"),
                        json.dumps(params_payload),
                        _parse_legacy_timestamp(metadata.get("trainedAt"), file_path),
                    ),
                )

            requested_active = _read_legacy_active_model()
            if requested_active:
                cur.execute(
                    "SELECT model_file FROM trained_models WHERE model_file = %s LIMIT 1;",
                    (requested_active,),
                )
                row = cur.fetchone()
                if row:
                    _set_active_model_in_tx(cur, requested_active)
                else:
                    _ensure_any_active_model(cur)
            else:
                _ensure_any_active_model(cur)

        conn.commit()


def list_trained_models() -> dict[str, list[dict] | str | None]:
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            active_model = _ensure_any_active_model(cur)
            cur.execute(
                """
                SELECT
                    model_name,
                    symbol,
                    model_file,
                    model_path,
                    dataset_file,
                    training_params,
                    trained_at,
                    is_active
                FROM trained_models
                ORDER BY trained_at DESC, id DESC;
                """
            )
            rows = cur.fetchall()
        conn.commit()

    items: list[dict] = []
    for row in rows:
        params = row.get("training_params") or {}
        items.append(
            {
                "modelName": row.get("model_name"),
                "modelFile": row.get("model_file"),
                "symbol": row.get("symbol"),
                "modelType": params.get("modelType") or "lstm",
                "epochs": params.get("epochs"),
                "batchSize": params.get("batchSize"),
                "windowSize": params.get("windowSize"),
                "featuresUsed": params.get("featuresUsed") or FEATURE_COLUMNS,
                "datasetStartDate": params.get("datasetStartDate"),
                "datasetEndDate": params.get("datasetEndDate"),
                "trainRatio": params.get("trainRatio"),
                "trainSize": params.get("trainSize"),
                "testSize": params.get("testSize"),
                "datasetFile": row.get("dataset_file"),
                "trainedAt": row["trained_at"].isoformat() if row.get("trained_at") else None,
                "path": row.get("model_path"),
                "isActive": bool(row.get("is_active")),
            }
        )

    return {"items": items, "activeModel": active_model}


def set_active_trained_model(model_file: str) -> dict:
    model_name = model_file.strip()
    if not model_name:
        raise RuntimeError("Model file is required.")

    with _connect_db() as conn:
        with conn.cursor() as cur:
            _set_active_model_in_tx(cur, model_name)
        conn.commit()

    return {
        "activeModel": model_name,
        "message": f"Model '{model_name}' is now active.",
    }


def delete_trained_model(model_file: str) -> dict:
    model_name = model_file.strip()
    if not model_name:
        raise RuntimeError("Model file is required.")

    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM trained_models
                WHERE model_file = %s
                RETURNING model_path, is_active;
                """,
                (model_name,),
            )
            deleted_row = cur.fetchone()
            if not deleted_row:
                raise RuntimeError(f"Model '{model_name}' does not exist.")

            if deleted_row.get("is_active"):
                active_model = _ensure_any_active_model(cur)
            else:
                cur.execute("SELECT model_file FROM trained_models WHERE is_active = TRUE LIMIT 1;")
                active = cur.fetchone()
                active_model = str(active["model_file"]) if active else None
        conn.commit()

    path = Path(str(deleted_row.get("model_path") or MODELS_DIR / model_name))
    if path.exists():
        path.unlink(missing_ok=True)

    return {
        "deleted": model_name,
        "activeModel": active_model,
        "message": f"Model '{model_name}' deleted successfully.",
    }


def list_downloaded_stock_symbols() -> list[str]:
    symbols: set[str] = set()

    for csv_file in DATA_DIR.glob("*.csv"):
        stem = csv_file.stem
        if "_" in stem:
            symbol = stem.rsplit("_", 1)[0].strip().upper()
        else:
            symbol = stem.strip().upper()

        if symbol:
            symbols.add(symbol)

    return sorted(symbols)


def _extract_start_date(file_path: Path) -> datetime | None:
    stem = file_path.stem
    if "_" not in stem:
        return None

    date_str = stem.rsplit("_", 1)[1]
    try:
        return datetime.fromisoformat(date_str)
    except ValueError:
        return None


def _find_latest_symbol_file(symbol: str) -> Path:
    normalized = symbol.strip().upper()
    matches = [path for path in DATA_DIR.glob("*.csv") if path.stem.rsplit("_", 1)[0].upper() == normalized]

    if not matches:
        raise RuntimeError(f"No downloaded dataset CSV found for symbol '{normalized}'.")

    def sort_key(path: Path) -> tuple[float, float]:
        date_value = _extract_start_date(path)
        date_timestamp = date_value.timestamp() if date_value else 0.0
        return (date_timestamp, path.stat().st_mtime)

    return sorted(matches, key=sort_key)[-1]


def load_data(filepath: Path) -> pd.DataFrame:
    try:
        df = pd.read_csv(filepath, skiprows=[1, 2])
    except Exception:  # noqa: BLE001
        df = pd.read_csv(filepath)

    required = FEATURE_COLUMNS
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise RuntimeError(f"Dataset file is missing required columns: {', '.join(missing)}")

    return df[required].dropna()


def _extract_dataset_date_range(filepath: Path) -> tuple[str | None, str | None]:
    try:
        frame = pd.read_csv(filepath, skiprows=[1, 2])
    except Exception:  # noqa: BLE001
        frame = pd.read_csv(filepath)

    if frame.empty:
        return (None, None)

    if "Date" not in frame.columns:
        first_column = frame.columns[0]
        frame = frame.rename(columns={first_column: "Date"})

    if "Date" not in frame.columns:
        return (None, None)

    dates = pd.to_datetime(frame["Date"], errors="coerce").dropna().sort_values()
    if dates.empty:
        return (None, None)

    return (
        pd.Timestamp(dates.iloc[0]).date().isoformat(),
        pd.Timestamp(dates.iloc[-1]).date().isoformat(),
    )


def split_data(dataset: pd.DataFrame, train_ratio: float = 0.8) -> tuple[pd.DataFrame, pd.DataFrame]:
    training_data_size = round(len(dataset) * train_ratio)
    train_data = dataset[:training_data_size]
    test_data = dataset[training_data_size:]
    return train_data, test_data


def scale_data(train_data: pd.DataFrame) -> tuple[np.ndarray, object]:
    try:
        from sklearn.preprocessing import MinMaxScaler
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "scikit-learn is not installed. Install training dependencies before using Train Model."
        ) from exc

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_train = scaler.fit_transform(train_data)
    return scaled_train, scaler


def build_sequences(
    scaled_data: np.ndarray,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> tuple[np.ndarray, np.ndarray]:
    x, y = [], []
    for i in range(window_size, len(scaled_data)):
        x.append(scaled_data[i - window_size : i])
        y.append(scaled_data[i])

    return np.array(x), np.array(y)


def build_model(timesteps: int, features: int):
    try:
        from keras.layers import LSTM, Dense
        from keras.models import Sequential
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Keras is not installed. Install training dependencies before using Train Model."
        ) from exc

    model = Sequential()
    model.add(LSTM(units=150, return_sequences=True, input_shape=(timesteps, features)))
    model.add(LSTM(units=150))
    model.add(Dense(units=features))
    return model


def train_model(
    model,
    x_train: np.ndarray,
    y_train: np.ndarray,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    epoch_progress_callback: Callable[[int, int, int], None] | None = None,
):
    try:
        from keras.callbacks import Callback
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Keras callbacks are unavailable. Install training dependencies before using Train Model."
        ) from exc

    class EpochProgressCallback(Callback):
        def __init__(self, total_epochs: int, progress_cb: Callable[[int, int, int], None] | None):
            super().__init__()
            self.total_epochs = max(1, int(total_epochs))
            self.progress_cb = progress_cb
            self.start_time = time.perf_counter()

        def on_epoch_end(self, epoch, logs=None):  # noqa: ANN001, D401
            if not self.progress_cb:
                return

            current_epoch = int(epoch) + 1
            elapsed_ms = int((time.perf_counter() - self.start_time) * 1000)
            self.progress_cb(current_epoch, self.total_epochs, elapsed_ms)

    model.compile(loss="mean_squared_error", optimizer="adam")
    model.fit(
        x=x_train,
        y=y_train,
        epochs=epochs,
        batch_size=batch_size,
        verbose=False,
        callbacks=[EpochProgressCallback(epochs, epoch_progress_callback)],
    )
    return model


def prepare_test_input(
    dataset: pd.DataFrame,
    test_data: pd.DataFrame,
    scaler: object,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> np.ndarray:
    inputs = dataset[len(dataset) - len(test_data) - window_size :].values
    return scaler.transform(inputs)


def predict(
    model,
    inputs_data: np.ndarray,
    scaler: object,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> np.ndarray:
    x_test = []
    for i in range(window_size, inputs_data.shape[0]):
        x_test.append(inputs_data[i - window_size : i])

    x_test = np.array(x_test)
    predictions = model.predict(x_test, verbose=0)
    return scaler.inverse_transform(predictions)


def evaluate_predictions(test_data: pd.DataFrame) -> dict[str, float]:
    try:
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "scikit-learn is not installed. Install training dependencies before using Train Model."
        ) from exc

    actual = test_data["Close"].values
    predicted = test_data["Predictions"].values

    mae = float(mean_absolute_error(actual, predicted))
    rmse = float(np.sqrt(mean_squared_error(actual, predicted)))
    mape = float(np.mean(np.abs((actual - predicted) / actual)) * 100)
    r2 = float(r2_score(actual, predicted))
    accuracy = max(0.0, 100.0 - mape)

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
        "r2": round(r2, 4),
        "accuracy": round(float(accuracy), 4),
    }


def train_model_for_symbol(
    symbol: str,
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    window_size: int = DEFAULT_WINDOW_SIZE,
    progress_callback: Callable[[str, str, dict | None], None] | None = None,
) -> dict[str, str | int | dict[str, float]]:
    def mark(step_key: str, event: str, meta: dict | None = None) -> None:
        if progress_callback:
            progress_callback(step_key, event, meta)

    mark("load_dataset", "start")
    normalized = symbol.strip().upper()
    file_path = _find_latest_symbol_file(normalized)
    dataset_start_date, dataset_end_date = _extract_dataset_date_range(file_path)

    dataset = load_data(file_path)
    mark("load_dataset", "complete")

    if len(dataset) <= window_size * 2:
        raise RuntimeError("Dataset is too small for LSTM training. Please download more historical rows.")

    mark("split_data", "start")
    train_data, test_data = split_data(dataset, train_ratio=DEFAULT_TRAIN_RATIO)
    mark("split_data", "complete")

    mark("scale_features", "start")
    scaled_train, scaler = scale_data(train_data)
    mark("scale_features", "complete")

    mark("build_sequences", "start")
    x_train, y_train = build_sequences(scaled_train, window_size=window_size)
    mark("build_sequences", "complete")

    if len(x_train) == 0:
        raise RuntimeError("Not enough data to build training sequences.")

    mark("build_model", "start")
    model = build_model(timesteps=x_train.shape[1], features=x_train.shape[2])
    mark("build_model", "complete")

    mark("train_model", "start")
    model = train_model(
        model,
        x_train,
        y_train,
        epochs=epochs,
        batch_size=batch_size,
        epoch_progress_callback=lambda current_epoch, total_epochs, elapsed_ms: mark(
            "train_model",
            "progress",
            {
                "currentEpoch": int(current_epoch),
                "totalEpochs": int(total_epochs),
                "progressPct": int((current_epoch / max(1, total_epochs)) * 100),
                "elapsedMs": int(elapsed_ms),
            },
        ),
    )
    mark("train_model", "complete")

    inputs_data = prepare_test_input(dataset, test_data, scaler, window_size=window_size)
    predictions = predict(model, inputs_data, scaler, window_size=window_size)

    test_with_predictions = test_data.copy()
    test_with_predictions["Predictions"] = predictions[:, 3]
    metrics = evaluate_predictions(test_with_predictions)

    mark("save_model", "start")
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    model_file_name = f"saved_model_{normalized}_{timestamp}.keras"
    model_path = MODELS_DIR / model_file_name
    model.save(model_path)

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE trained_models SET is_active = FALSE, updated_at = NOW() WHERE is_active = TRUE;")
            cur.execute(
                """
                INSERT INTO trained_models (
                    model_name,
                    symbol,
                    model_file,
                    model_path,
                    dataset_file,
                    training_params,
                    trained_at,
                    is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW(), TRUE)
                ON CONFLICT (model_file)
                DO UPDATE SET
                    model_name = EXCLUDED.model_name,
                    symbol = EXCLUDED.symbol,
                    model_path = EXCLUDED.model_path,
                    dataset_file = EXCLUDED.dataset_file,
                    training_params = EXCLUDED.training_params,
                    trained_at = EXCLUDED.trained_at,
                    is_active = TRUE,
                    updated_at = NOW();
                """,
                (
                    f"{normalized} LSTM {timestamp}",
                    normalized,
                    model_file_name,
                    str(model_path.resolve()),
                    file_path.name,
                    json.dumps(
                        {
                            "modelType": "lstm",
                            "epochs": int(epochs),
                            "batchSize": int(batch_size),
                            "windowSize": int(window_size),
                            "sequenceLength": int(window_size),
                            "featuresUsed": FEATURE_COLUMNS,
                            "datasetStartDate": dataset_start_date,
                            "datasetEndDate": dataset_end_date,
                            "trainRatio": float(DEFAULT_TRAIN_RATIO),
                            "trainSize": int(len(train_data)),
                            "testSize": int(len(test_data)),
                        }
                    ),
                ),
            )
        conn.commit()
    mark("save_model", "complete")

    return {
        "symbol": normalized,
        "modelType": "lstm",
        "epochs": int(epochs),
        "batchSize": int(batch_size),
        "windowSize": int(window_size),
        "datasetFile": file_path.name,
        "modelFile": model_file_name,
        "message": "Training completed and model saved successfully.",
        "metrics": metrics,
    }


def build_tcn_model(timesteps: int, features: int):
    try:
        from keras.layers import Add, Activation, Conv1D, Dense, Dropout, Input, Lambda
        from keras.models import Model
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Keras is not installed. Install training dependencies before using Train Model."
        ) from exc

    def tcn_residual_block(
        x,
        *,
        filters: int,
        kernel_size: int,
        dilation_rate: int,
        dropout_rate: float,
    ):
        prev_x = x
        y = Conv1D(
            filters,
            kernel_size,
            dilation_rate=dilation_rate,
            padding="causal",
            activation="relu",
        )(x)
        y = Dropout(dropout_rate)(y)
        y = Conv1D(
            filters,
            kernel_size,
            dilation_rate=dilation_rate,
            padding="causal",
        )(y)

        if prev_x.shape[-1] is None or int(prev_x.shape[-1]) != filters:
            prev_x = Conv1D(filters, kernel_size=1, padding="same")(prev_x)

        y = Add()([prev_x, y])
        return Activation("relu")(y)

    inputs = Input(shape=(timesteps, features))
    x = inputs
    for dilation_rate in [1, 2, 4, 8, 16]:
        x = tcn_residual_block(
            x,
            filters=64,
            kernel_size=3,
            dilation_rate=dilation_rate,
            dropout_rate=0.1,
        )

    x = Lambda(lambda t: t[:, -1, :])(x)
    outputs = Dense(units=features)(x)
    return Model(inputs=inputs, outputs=outputs)


def train_tcn_model_for_symbol(
    symbol: str,
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    window_size: int = DEFAULT_WINDOW_SIZE,
    progress_callback: Callable[[str, str, dict | None], None] | None = None,
) -> dict[str, str | int | dict[str, float]]:
    def mark(step_key: str, event: str, meta: dict | None = None) -> None:
        if progress_callback:
            progress_callback(step_key, event, meta)

    mark("load_dataset", "start")
    normalized = symbol.strip().upper()
    file_path = _find_latest_symbol_file(normalized)
    dataset_start_date, dataset_end_date = _extract_dataset_date_range(file_path)

    dataset = load_data(file_path)
    mark("load_dataset", "complete")

    if len(dataset) <= window_size * 2:
        raise RuntimeError("Dataset is too small for TCN training. Please download more historical rows.")

    mark("split_data", "start")
    train_data, test_data = split_data(dataset, train_ratio=DEFAULT_TRAIN_RATIO)
    mark("split_data", "complete")

    mark("scale_features", "start")
    scaled_train, scaler = scale_data(train_data)
    mark("scale_features", "complete")

    mark("build_sequences", "start")
    x_train, y_train = build_sequences(scaled_train, window_size=window_size)
    mark("build_sequences", "complete")

    if len(x_train) == 0:
        raise RuntimeError("Not enough data to build training sequences.")

    mark("build_model", "start")
    model = build_tcn_model(timesteps=x_train.shape[1], features=x_train.shape[2])
    mark("build_model", "complete")

    mark("train_model", "start")
    model = train_model(
        model,
        x_train,
        y_train,
        epochs=epochs,
        batch_size=batch_size,
        epoch_progress_callback=lambda current_epoch, total_epochs, elapsed_ms: mark(
            "train_model",
            "progress",
            {
                "currentEpoch": int(current_epoch),
                "totalEpochs": int(total_epochs),
                "progressPct": int((current_epoch / max(1, total_epochs)) * 100),
                "elapsedMs": int(elapsed_ms),
            },
        ),
    )
    mark("train_model", "complete")

    inputs_data = prepare_test_input(dataset, test_data, scaler, window_size=window_size)
    predictions = predict(model, inputs_data, scaler, window_size=window_size)

    test_with_predictions = test_data.copy()
    test_with_predictions["Predictions"] = predictions[:, 3]
    metrics = evaluate_predictions(test_with_predictions)

    mark("save_model", "start")
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    model_file_name = f"saved_model_{normalized}_TCN_{timestamp}.keras"
    model_path = MODELS_DIR / model_file_name
    model.save(model_path)

    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE trained_models SET is_active = FALSE, updated_at = NOW() WHERE is_active = TRUE;")
            cur.execute(
                """
                INSERT INTO trained_models (
                    model_name,
                    symbol,
                    model_file,
                    model_path,
                    dataset_file,
                    training_params,
                    trained_at,
                    is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW(), TRUE)
                ON CONFLICT (model_file)
                DO UPDATE SET
                    model_name = EXCLUDED.model_name,
                    symbol = EXCLUDED.symbol,
                    model_path = EXCLUDED.model_path,
                    dataset_file = EXCLUDED.dataset_file,
                    training_params = EXCLUDED.training_params,
                    trained_at = EXCLUDED.trained_at,
                    is_active = TRUE,
                    updated_at = NOW();
                """,
                (
                    f"{normalized} TCN {timestamp}",
                    normalized,
                    model_file_name,
                    str(model_path.resolve()),
                    file_path.name,
                    json.dumps(
                        {
                            "modelType": "tcn",
                            "epochs": int(epochs),
                            "batchSize": int(batch_size),
                            "windowSize": int(window_size),
                            "sequenceLength": int(window_size),
                            "featuresUsed": FEATURE_COLUMNS,
                            "datasetStartDate": dataset_start_date,
                            "datasetEndDate": dataset_end_date,
                            "trainRatio": float(DEFAULT_TRAIN_RATIO),
                            "trainSize": int(len(train_data)),
                            "testSize": int(len(test_data)),
                        }
                    ),
                ),
            )
        conn.commit()
    mark("save_model", "complete")

    return {
        "symbol": normalized,
        "modelType": "tcn",
        "epochs": int(epochs),
        "batchSize": int(batch_size),
        "windowSize": int(window_size),
        "datasetFile": file_path.name,
        "modelFile": model_file_name,
        "message": "Training completed and model saved successfully.",
        "metrics": metrics,
    }