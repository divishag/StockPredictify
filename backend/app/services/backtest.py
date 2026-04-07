from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from app.services.dataset import DATA_DIR
from app.services.lstm import list_trained_models, scale_data

FEATURE_COLUMNS = ["Open", "High", "Low", "Close", "Volume"]
DEFAULT_WINDOW_SIZE = 60
MAX_PREDICTION_POINTS = 500


def _crosses_above(series: pd.Series, idx: int, threshold: float) -> bool:
    if idx <= 0:
        return False

    previous = series.iloc[idx - 1]
    current = series.iloc[idx]
    if pd.isna(previous) or pd.isna(current):
        return False

    return bool(previous <= threshold and current > threshold)


def _crosses_below(series: pd.Series, idx: int, threshold: float) -> bool:
    if idx <= 0:
        return False

    previous = series.iloc[idx - 1]
    current = series.iloc[idx]
    if pd.isna(previous) or pd.isna(current):
        return False

    return bool(previous >= threshold and current < threshold)


def _compute_rsi(close: pd.Series, window: int) -> pd.Series:
    delta = close.diff()
    gains = delta.clip(lower=0)
    losses = -delta.clip(upper=0)

    avg_gain = gains.ewm(alpha=1 / max(1, window), min_periods=window, adjust=False).mean()
    avg_loss = losses.ewm(alpha=1 / max(1, window), min_periods=window, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


def _read_ohlcv_data(file_path: Path) -> pd.DataFrame:
    if not file_path.exists():
        raise FileNotFoundError(f"Dataset file was not found: {file_path}")

    try:
        frame = pd.read_csv(file_path, skiprows=[1, 2])
    except Exception:  # noqa: BLE001
        frame = pd.read_csv(file_path)

    if frame.empty:
        raise RuntimeError("Dataset is empty.")

    if "Date" not in frame.columns:
        first_column = frame.columns[0]
        frame = frame.rename(columns={first_column: "Date"})

    required = ["Date", *FEATURE_COLUMNS]
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise RuntimeError(f"Dataset file is missing required columns: {', '.join(missing)}")

    prepared = frame[required].copy()
    prepared["Date"] = pd.to_datetime(prepared["Date"], errors="coerce")
    for column in FEATURE_COLUMNS:
        prepared[column] = pd.to_numeric(prepared[column], errors="coerce")

    prepared = prepared.dropna().sort_values("Date")
    if prepared.empty:
        raise RuntimeError("No valid OHLCV rows are available after cleaning dataset values.")

    prepared = prepared.drop_duplicates(subset=["Date"], keep="last")
    return prepared.set_index("Date")


def _resolve_active_model() -> dict:
    models_payload = list_trained_models()
    active_model_file = str(models_payload.get("activeModel") or "").strip()
    items = models_payload.get("items") or []

    if not active_model_file:
        raise RuntimeError("No active model is set. Activate a trained model before backtesting.")

    model_record = None
    for item in items:
        if str(item.get("modelFile") or "") == active_model_file:
            model_record = item
            break

    if not model_record:
        raise RuntimeError("Active model metadata could not be found.")

    model_path = Path(str(model_record.get("path") or "").strip())
    if not model_path.exists():
        raise FileNotFoundError(f"Active model file does not exist on disk: {model_path}")

    return {
        "modelFile": active_model_file,
        "modelPath": str(model_path.resolve()),
        "symbol": str(model_record.get("symbol") or "").strip().upper(),
        "datasetFile": str(model_record.get("datasetFile") or "").strip(),
        "windowSize": model_record.get("windowSize"),
        "epochs": model_record.get("epochs"),
        "batchSize": model_record.get("batchSize"),
        "featuresUsed": model_record.get("featuresUsed"),
        "datasetStartDate": model_record.get("datasetStartDate"),
        "datasetEndDate": model_record.get("datasetEndDate"),
        "trainRatio": model_record.get("trainRatio"),
        "trainSize": model_record.get("trainSize"),
        "testSize": model_record.get("testSize"),
    }


def _resolve_dataset_file(symbol: str, dataset_file: str | None, model_dataset_file: str | None) -> Path:
    requested_file = (dataset_file or model_dataset_file or "").strip()

    if requested_file:
        file_path = DATA_DIR / requested_file
        if file_path.exists():
            return file_path
        raise FileNotFoundError(f"Dataset file '{requested_file}' was not found in data directory.")

    symbol_prefix = f"{symbol.upper()}_"
    candidates = [path for path in DATA_DIR.glob("*.csv") if path.name.upper().startswith(symbol_prefix)]
    if not candidates:
        raise FileNotFoundError(f"No dataset CSV found for symbol '{symbol}'.")

    candidates.sort(key=lambda path: path.stat().st_mtime)
    return candidates[-1]


def _derive_model_window(model, fallback: int | None) -> int:
    input_shape = getattr(model, "input_shape", None)
    if isinstance(input_shape, (list, tuple)) and len(input_shape) >= 3:
        try:
            model_window = int(input_shape[1])
            if model_window > 0:
                return model_window
        except Exception:  # noqa: BLE001
            pass

    if fallback and int(fallback) > 0:
        return int(fallback)

    return DEFAULT_WINDOW_SIZE


def _compute_regression_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    if len(actual) == 0:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0}

    diff = actual - predicted
    mae = float(np.mean(np.abs(diff)))
    rmse = float(np.sqrt(np.mean(np.square(diff))))

    denominator = np.where(actual == 0, np.nan, actual)
    mape = float(np.nanmean(np.abs(diff / denominator)) * 100)
    if np.isnan(mape):
        mape = 0.0

    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
    }


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def _compute_cagr_pct(start_equity: float, end_equity: float, start_date: pd.Timestamp, end_date: pd.Timestamp) -> float:
    if start_equity <= 0 or end_equity <= 0:
        return 0.0

    days = float((end_date - start_date).days)
    if days <= 0:
        return 0.0

    years = days / 365.25
    if years <= 0:
        return 0.0

    cagr = (end_equity / start_equity) ** (1.0 / years) - 1.0
    if np.isnan(cagr) or np.isinf(cagr):
        return 0.0

    return float(cagr * 100.0)


def run_backtest_strategy(payload: dict) -> dict:
    try:
        from keras.models import load_model
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("Keras is required for backtesting with the active LSTM model.") from exc

    model_info = _resolve_active_model()
    requested_symbol = str(payload.get("symbol") or "").strip().upper()
    symbol = requested_symbol or model_info["symbol"]
    if not symbol:
        raise RuntimeError("Symbol is required and could not be inferred from the active model metadata.")

    dataset_file_override = payload.get("datasetFile")
    dataset_path = _resolve_dataset_file(symbol, dataset_file_override, model_info.get("datasetFile"))

    data = _read_ohlcv_data(dataset_path)
    model = load_model(model_info["modelPath"])

    configured_window = payload.get("windowSize")
    if configured_window is not None:
        configured_window = int(configured_window)

    default_window = model_info.get("windowSize")
    if default_window is not None:
        default_window = int(default_window)

    model_window = _derive_model_window(model, default_window)
    if configured_window and configured_window != model_window:
        raise ValueError(
            f"windowSize={configured_window} does not match active model expected window size {model_window}."
        )

    window_size = configured_window or model_window

    rsi_window = int(payload["rsiWindow"])
    lower_bound = float(payload["lowerBound"])
    upper_bound = float(payload["upperBound"])
    min_consecutive = int(payload["minConsecutivePredictions"])
    train_ratio = float(payload["trainRatio"])
    initial_cash = float(payload["initialCash"])

    minimum_rows = max(window_size + 2, rsi_window + 2)
    if len(data) < minimum_rows:
        raise RuntimeError(
            f"Dataset has {len(data)} rows. At least {minimum_rows} rows are required for backtesting."
        )

    split_index = int(len(data) * train_ratio)
    split_index = max(window_size + 1, min(split_index, len(data) - 1))

    train_frame = data.iloc[:split_index][FEATURE_COLUMNS]
    _, scaler = scale_data(train_frame)

    rsi_series = _compute_rsi(data["Close"], rsi_window)

    cash = initial_cash
    shares = 0.0
    entry_price: float | None = None
    entry_trade_id: int | None = None
    next_trade_id = 1
    bullish_streak = 0
    bearish_streak = 0

    close_values = data["Close"].to_numpy(dtype=float)
    dates = data.index.to_list()

    closed_trades: list[float] = []
    equity_curve: list[float] = [initial_cash]
    equity_points: list[dict] = [
        {
            "date": pd.Timestamp(dates[0]).isoformat(),
            "equity": _round(initial_cash, 2),
        }
    ]
    prediction_rows: list[dict] = []
    trade_events: list[dict] = []
    prediction_actuals: list[float] = []
    prediction_values: list[float] = []
    direction_correct = 0

    for idx in range(window_size - 1, len(data) - 1):
        current_close = float(close_values[idx])
        next_close = float(close_values[idx + 1])

        window = data.iloc[idx - window_size + 1 : idx + 1][FEATURE_COLUMNS]
        scaled_window = scaler.transform(window)
        x_input = scaled_window.reshape(1, window_size, len(FEATURE_COLUMNS))

        predicted_scaled = model.predict(x_input, verbose=0)
        predicted_scaled = np.asarray(predicted_scaled)
        if predicted_scaled.ndim != 2 or predicted_scaled.shape[1] != len(FEATURE_COLUMNS):
            raise RuntimeError(
                "Active model output shape is incompatible with expected OHLCV prediction format."
            )

        predicted = scaler.inverse_transform(predicted_scaled)
        predicted_next_close = float(predicted[0, 3])

        if predicted_next_close > current_close:
            bullish_streak += 1
            bearish_streak = 0
            predicted_direction = "up"
        else:
            bearish_streak += 1
            bullish_streak = 0
            predicted_direction = "down"

        actual_direction = "up" if next_close > current_close else "down"
        is_direction_correct = predicted_direction == actual_direction
        if is_direction_correct:
            direction_correct += 1

        signal = "hold"
        if shares > 0 and _crosses_above(rsi_series, idx, upper_bound) and bearish_streak >= min_consecutive:
            sold_shares = shares
            cash = shares * current_close
            trade_pnl = cash - ((entry_price or current_close) * shares)
            closed_trades.append(trade_pnl)
            shares = 0.0
            entry_price = None
            signal = "sell"
            trade_events.append(
                {
                    "tradeId": int(entry_trade_id or next_trade_id),
                    "action": "sell",
                    "date": pd.Timestamp(dates[idx]).isoformat(),
                    "price": _round(current_close),
                    "shares": _round(sold_shares, 6),
                    "pnl": _round(trade_pnl),
                }
            )
            entry_trade_id = None
        elif shares == 0 and _crosses_below(rsi_series, idx, lower_bound) and bullish_streak >= min_consecutive:
            shares = cash / current_close
            cash = 0.0
            entry_price = current_close
            signal = "buy"
            entry_trade_id = next_trade_id
            trade_events.append(
                {
                    "tradeId": int(entry_trade_id),
                    "action": "buy",
                    "date": pd.Timestamp(dates[idx]).isoformat(),
                    "price": _round(current_close),
                    "shares": _round(shares, 6),
                    "pnl": None,
                }
            )
            next_trade_id += 1

        current_equity = cash + shares * current_close
        equity_curve.append(current_equity)
        equity_points.append(
            {
                "date": pd.Timestamp(dates[idx]).isoformat(),
                "equity": _round(current_equity, 2),
            }
        )

        prediction_actuals.append(next_close)
        prediction_values.append(predicted_next_close)
        prediction_rows.append(
            {
                "date": pd.Timestamp(dates[idx]).isoformat(),
                "currentClose": _round(current_close),
                "actualNextClose": _round(next_close),
                "predictedNextClose": _round(predicted_next_close),
                "rsi": _round(float(rsi_series.iloc[idx])) if not pd.isna(rsi_series.iloc[idx]) else None,
                "signal": signal,
                "predictedDirection": predicted_direction,
                "actualDirection": actual_direction,
                "directionCorrect": is_direction_correct,
                "bullishStreak": int(bullish_streak),
                "bearishStreak": int(bearish_streak),
                "position": "long" if shares > 0 else "flat",
            }
        )

    final_close = float(close_values[-1])
    if shares > 0:
        sold_shares = shares
        cash = shares * final_close
        trade_pnl = cash - ((entry_price or final_close) * shares)
        closed_trades.append(trade_pnl)
        shares = 0.0
        trade_events.append(
            {
                "tradeId": int(entry_trade_id or next_trade_id),
                "action": "sell",
                "date": pd.Timestamp(dates[-1]).isoformat(),
                "price": _round(final_close),
                "shares": _round(sold_shares, 6),
                "pnl": _round(trade_pnl),
            }
        )
        entry_trade_id = None

    final_equity = cash
    equity_curve.append(final_equity)
    if equity_points and equity_points[-1]["date"] == pd.Timestamp(dates[-1]).isoformat():
        equity_points[-1]["equity"] = _round(final_equity, 2)
    else:
        equity_points.append(
            {
                "date": pd.Timestamp(dates[-1]).isoformat(),
                "equity": _round(final_equity, 2),
            }
        )

    equity_series = pd.Series(equity_curve, dtype=float)
    rolling_max = equity_series.cummax().replace(0, np.nan)
    drawdowns = (equity_series - rolling_max) / rolling_max
    max_drawdown_pct = abs(float(drawdowns.min(skipna=True) * 100)) if not drawdowns.empty else 0.0
    if np.isnan(max_drawdown_pct):
        max_drawdown_pct = 0.0

    trade_count = len(closed_trades)
    winning_trades = sum(1 for pnl in closed_trades if pnl > 0)
    win_rate_pct = (winning_trades / trade_count * 100) if trade_count else 0.0

    total_return_pct = ((final_equity - initial_cash) / initial_cash) * 100
    buy_hold_return_pct = ((final_close - float(close_values[0])) / float(close_values[0])) * 100
    backtest_start_date = pd.Timestamp(dates[0])
    backtest_end_date = pd.Timestamp(dates[-1])
    cagr_pct = _compute_cagr_pct(initial_cash, final_equity, backtest_start_date, backtest_end_date)

    actual_array = np.asarray(prediction_actuals, dtype=float)
    predicted_array = np.asarray(prediction_values, dtype=float)
    regression_metrics = _compute_regression_metrics(actual_array, predicted_array)

    prediction_count = len(prediction_rows)
    directional_accuracy_pct = (direction_correct / prediction_count * 100) if prediction_count else 0.0

    if len(prediction_rows) > MAX_PREDICTION_POINTS:
        prediction_rows = prediction_rows[-MAX_PREDICTION_POINTS:]

    chart_rows = [
        {
            "date": pd.Timestamp(index_value).isoformat(),
            "open": _round(float(row["Open"])),
            "high": _round(float(row["High"])),
            "low": _round(float(row["Low"])),
            "close": _round(float(row["Close"])),
            "volume": int(round(float(row["Volume"]))),
        }
        for index_value, row in data.iterrows()
    ]

    dataset_start_fallback = pd.Timestamp(data.index.min()).date().isoformat() if len(data.index) else None
    dataset_end_fallback = pd.Timestamp(data.index.max()).date().isoformat() if len(data.index) else None
    features_used = model_info.get("featuresUsed") or FEATURE_COLUMNS

    return {
        "status": "completed",
        "symbol": symbol,
        "datasetFile": dataset_path.name,
        "modelFile": model_info["modelFile"],
        "modelPath": model_info["modelPath"],
        "parameters": {
            "initialCash": initial_cash,
            "trainRatio": train_ratio,
            "windowSize": window_size,
            "rsiWindow": rsi_window,
            "lowerBound": lower_bound,
            "upperBound": upper_bound,
            "minConsecutivePredictions": min_consecutive,
        },
        "trainingContext": {
            "epochs": model_info.get("epochs"),
            "batchSize": model_info.get("batchSize"),
            "sequenceLength": model_info.get("windowSize") or window_size,
            "featuresUsed": list(features_used) if isinstance(features_used, list) else FEATURE_COLUMNS,
            "datasetStartDate": model_info.get("datasetStartDate") or dataset_start_fallback,
            "datasetEndDate": model_info.get("datasetEndDate") or dataset_end_fallback,
            "trainRatio": model_info.get("trainRatio"),
            "trainSize": model_info.get("trainSize"),
            "testSize": model_info.get("testSize"),
        },
        "metrics": {
            "initialCash": _round(initial_cash, 2),
            "finalEquity": _round(final_equity, 2),
            "totalReturnPct": _round(total_return_pct),
            "cagrPct": _round(cagr_pct),
            "buyHoldReturnPct": _round(buy_hold_return_pct),
            "maxDrawdownPct": _round(max_drawdown_pct),
            "tradeCount": int(trade_count),
            "winningTrades": int(winning_trades),
            "winRatePct": _round(win_rate_pct),
            "predictionCount": int(prediction_count),
            "directionalAccuracyPct": _round(directional_accuracy_pct),
            "mae": regression_metrics["mae"],
            "rmse": regression_metrics["rmse"],
            "mape": regression_metrics["mape"],
        },
        "predictions": prediction_rows,
        "chartData": chart_rows,
        "trades": trade_events,
        "equityCurve": equity_points,
    }
