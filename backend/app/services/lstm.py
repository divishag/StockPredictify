from __future__ import annotations

from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from app.services.dataset import DATA_DIR

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_EPOCHS = 5
DEFAULT_BATCH_SIZE = 2
DEFAULT_WINDOW_SIZE = 60


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

    required = ["Open", "High", "Low", "Close", "Volume"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise RuntimeError(f"Dataset file is missing required columns: {', '.join(missing)}")

    return df[required].dropna()


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
):
    model.compile(loss="mean_squared_error", optimizer="adam")
    model.fit(x=x_train, y=y_train, epochs=epochs, batch_size=batch_size, verbose=False)
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

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
        "r2": round(r2, 4),
    }


def train_model_for_symbol(
    symbol: str,
    *,
    epochs: int = DEFAULT_EPOCHS,
    batch_size: int = DEFAULT_BATCH_SIZE,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> dict[str, str | int | dict[str, float]]:
    normalized = symbol.strip().upper()
    file_path = _find_latest_symbol_file(normalized)

    dataset = load_data(file_path)
    if len(dataset) <= window_size * 2:
        raise RuntimeError("Dataset is too small for LSTM training. Please download more historical rows.")

    train_data, test_data = split_data(dataset)
    scaled_train, scaler = scale_data(train_data)

    x_train, y_train = build_sequences(scaled_train, window_size=window_size)
    if len(x_train) == 0:
        raise RuntimeError("Not enough data to build training sequences.")

    model = build_model(timesteps=x_train.shape[1], features=x_train.shape[2])
    model = train_model(model, x_train, y_train, epochs=epochs, batch_size=batch_size)

    inputs_data = prepare_test_input(dataset, test_data, scaler, window_size=window_size)
    predictions = predict(model, inputs_data, scaler, window_size=window_size)

    test_with_predictions = test_data.copy()
    test_with_predictions["Predictions"] = predictions[:, 3]
    metrics = evaluate_predictions(test_with_predictions)

    model_file_name = f"saved_model_{normalized}.keras"
    model_path = MODELS_DIR / model_file_name
    model.save(model_path)

    return {
        "symbol": normalized,
        "epochs": int(epochs),
        "batchSize": int(batch_size),
        "windowSize": int(window_size),
        "datasetFile": file_path.name,
        "modelFile": model_file_name,
        "message": "Training completed and model saved successfully.",
        "metrics": metrics,
    }