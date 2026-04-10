from __future__ import annotations

import json
from datetime import datetime

from psycopg.rows import dict_row

from app.services.dataset import _connect_db


def _parse_iso_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _compute_cagr_from_payload(payload: dict) -> float:
    metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {}

    initial_cash = metrics.get("initialCash")
    final_equity = metrics.get("finalEquity")
    try:
        start_equity = float(initial_cash)
        end_equity = float(final_equity)
    except (TypeError, ValueError):
        return 0.0

    if start_equity <= 0 or end_equity <= 0:
        return 0.0

    equity_curve = payload.get("equityCurve") if isinstance(payload.get("equityCurve"), list) else []
    if not equity_curve:
        return 0.0

    start_date = _parse_iso_datetime((equity_curve[0] or {}).get("date") if isinstance(equity_curve[0], dict) else None)
    end_date = _parse_iso_datetime((equity_curve[-1] or {}).get("date") if isinstance(equity_curve[-1], dict) else None)
    if not start_date or not end_date:
        return 0.0

    years = (end_date - start_date).days / 365.25
    if years <= 0:
        return 0.0

    cagr = (end_equity / start_equity) ** (1.0 / years) - 1.0
    if cagr != cagr or cagr in (float("inf"), float("-inf")):
        return 0.0

    return round(cagr * 100.0, 4)


def _to_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def init_backtests_table() -> None:
    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_runs (
                    id BIGSERIAL PRIMARY KEY,
                    symbol VARCHAR(16) NOT NULL,
                    model_file TEXT,
                    dataset_file TEXT,
                    parameters JSONB NOT NULL,
                    total_return_pct DOUBLE PRECISION,
                    final_equity DOUBLE PRECISION,
                    max_drawdown_pct DOUBLE PRECISION,
                    trade_count INTEGER,
                    result_json JSONB NOT NULL,
                    backtest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_backtest_runs_backtest_at
                ON backtest_runs (backtest_at DESC);
                """
            )
        conn.commit()


def save_backtest_run(result: dict) -> dict:
    symbol = str(result.get("symbol") or "").strip().upper()
    if not symbol:
        raise RuntimeError("Backtest result is missing symbol and cannot be stored.")

    metrics = result.get("metrics") if isinstance(result.get("metrics"), dict) else {}
    parameters = result.get("parameters") if isinstance(result.get("parameters"), dict) else {}

    # Ensure expected backtest inputs are persisted in the dedicated parameters JSONB field.
    persisted_parameters = {
        "initialCash": parameters.get("initialCash", metrics.get("initialCash")),
        "rsiWindow": parameters.get("rsiWindow"),
        "minConsecutivePredictions": parameters.get("minConsecutivePredictions"),
        "lowerBound": parameters.get("lowerBound"),
        "upperBound": parameters.get("upperBound"),
        **parameters,
    }

    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO backtest_runs (
                    symbol,
                    model_file,
                    dataset_file,
                    parameters,
                    total_return_pct,
                    final_equity,
                    max_drawdown_pct,
                    trade_count,
                    result_json,
                    backtest_at
                )
                VALUES (
                    %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s::jsonb, NOW()
                )
                RETURNING id, backtest_at;
                """,
                (
                    symbol,
                    result.get("modelFile"),
                    result.get("datasetFile"),
                    json.dumps(persisted_parameters),
                    metrics.get("totalReturnPct"),
                    metrics.get("finalEquity"),
                    metrics.get("maxDrawdownPct"),
                    metrics.get("tradeCount"),
                    json.dumps(result),
                ),
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        raise RuntimeError("Backtest run could not be stored.")

    return {
        "id": int(row["id"]),
        "backtestAt": row["backtest_at"].isoformat() if row.get("backtest_at") else None,
    }


def list_backtest_runs(limit: int = 200) -> list[dict]:
    size = max(1, min(int(limit), 1000))

    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    symbol,
                    model_file,
                    dataset_file,
                    parameters,
                    total_return_pct,
                    final_equity,
                    max_drawdown_pct,
                    trade_count,
                    backtest_at
                FROM backtest_runs
                ORDER BY backtest_at DESC, id DESC
                LIMIT %s;
                """,
                (size,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": int(row["id"]),
            "symbol": row.get("symbol"),
            "modelFile": row.get("model_file"),
            "datasetFile": row.get("dataset_file"),
            "initialCash": _to_float((row.get("parameters") or {}).get("initialCash")),
            "rsiWindow": _to_int((row.get("parameters") or {}).get("rsiWindow")),
            "minConsecutivePredictions": _to_int((row.get("parameters") or {}).get("minConsecutivePredictions")),
            "lowerBound": _to_float((row.get("parameters") or {}).get("lowerBound")),
            "upperBound": _to_float((row.get("parameters") or {}).get("upperBound")),
            "totalReturnPct": float(row["total_return_pct"]) if row.get("total_return_pct") is not None else None,
            "finalEquity": float(row["final_equity"]) if row.get("final_equity") is not None else None,
            "maxDrawdownPct": float(row["max_drawdown_pct"]) if row.get("max_drawdown_pct") is not None else None,
            "tradeCount": int(row["trade_count"]) if row.get("trade_count") is not None else None,
            "backtestAt": row["backtest_at"].isoformat() if row.get("backtest_at") else None,
        }
        for row in rows
    ]


def get_backtest_run(backtest_id: int) -> dict | None:
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    backtest_at,
                    parameters,
                    result_json
                FROM backtest_runs
                WHERE id = %s
                LIMIT 1;
                """,
                (int(backtest_id),),
            )
            row = cur.fetchone()

    if not row:
        return None

    payload = row.get("result_json") or {}
    if not isinstance(payload, dict):
        raise RuntimeError("Stored backtest payload is invalid.")

    stored_parameters = row.get("parameters") if isinstance(row.get("parameters"), dict) else {}
    payload_parameters = payload.get("parameters") if isinstance(payload.get("parameters"), dict) else {}
    payload["parameters"] = {
        **stored_parameters,
        **payload_parameters,
    }

    if "initialCash" not in payload["parameters"]:
        metrics = payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {}
        if metrics.get("initialCash") is not None:
            payload["parameters"]["initialCash"] = metrics.get("initialCash")

    metrics = payload.get("metrics")
    if isinstance(metrics, dict) and "cagrPct" not in metrics:
        metrics["cagrPct"] = _compute_cagr_from_payload(payload)

    payload["id"] = int(row["id"])
    payload["backtestAt"] = row["backtest_at"].isoformat() if row.get("backtest_at") else None
    return payload


def delete_backtest_run(backtest_id: int) -> bool:
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM backtest_runs
                WHERE id = %s
                RETURNING id;
                """,
                (int(backtest_id),),
            )
            row = cur.fetchone()
        conn.commit()

    return bool(row and row.get("id") is not None)
