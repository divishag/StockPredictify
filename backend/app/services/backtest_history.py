from __future__ import annotations

import json

from psycopg.rows import dict_row

from app.services.dataset import _connect_db


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

    metrics = result.get("metrics") or {}

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
                    json.dumps(result.get("parameters") or {}),
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
