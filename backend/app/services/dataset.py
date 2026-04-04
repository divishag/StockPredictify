import os
import time
from pathlib import Path

import pandas as pd
import psycopg
from psycopg.rows import dict_row
import yfinance as yf

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

MAX_DOWNLOAD_RETRIES = int(os.getenv("DATASET_DOWNLOAD_RETRIES", "3"))
RETRY_BASE_DELAY_SECONDS = float(os.getenv("DATASET_RETRY_BASE_DELAY", "1.5"))


class DatasetDownloadError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    user = os.getenv("PGUSER") or os.getenv("USER") or "postgres"
    password = os.getenv("PGPASSWORD")
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")

    if password:
        auth = f"{user}:{password}"
    else:
        auth = user

    # Prefer a project DB name, then fall back to the default postgres DB.
    return f"postgresql://{auth}@{host}:{port}/predictify"


def _connect_db(*, row_factory=None):
    explicit_url = os.getenv("DATABASE_URL")

    candidates = [explicit_url] if explicit_url else []
    if not explicit_url:
        base_local = _database_url()
        candidates.extend([base_local, base_local.rsplit("/", 1)[0] + "/postgres"])

    last_error: Exception | None = None
    for dsn in candidates:
        try:
            if row_factory is None:
                return psycopg.connect(dsn)
            return psycopg.connect(dsn, row_factory=row_factory)
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    attempted = ", ".join(candidates)
    raise RuntimeError(
        "Could not connect to PostgreSQL. "
        f"Tried: {attempted}. "
        "Set DATABASE_URL in backend/.env if your local DB uses different credentials. "
        f"Last error: {last_error}"
    )


def _is_rate_limited_error(message: str) -> bool:
    lowered = message.lower()
    return "rate limit" in lowered or "too many requests" in lowered or "yf_rate_limit" in lowered


def _download_with_retry(symbol: str, start_date: str):
    last_error: DatasetDownloadError | None = None

    for attempt in range(MAX_DOWNLOAD_RETRIES):
        try:
            shared_errors = getattr(yf.shared, "_ERRORS", None)
            if isinstance(shared_errors, dict):
                shared_errors.pop(symbol, None)

            frame = yf.download(
                symbol,
                start=start_date,
                progress=False,
                auto_adjust=False,
                threads=False,
            )
        except Exception as exc:  # noqa: BLE001
            raise DatasetDownloadError(
                "provider_exception",
                f"Data provider request failed for {symbol}: {str(exc)}",
            ) from exc

        if not frame.empty:
            return frame

        # yfinance may return empty frame and record a detailed provider error.
        provider_error = ""
        try:
            provider_error = str(getattr(yf.shared, "_ERRORS", {}).get(symbol, ""))
        except Exception:  # noqa: BLE001
            provider_error = ""

        if provider_error and _is_rate_limited_error(provider_error):
            last_error = DatasetDownloadError(
                "rate_limited",
                f"Rate limited by data provider for {symbol}: {provider_error}",
            )
            if attempt < MAX_DOWNLOAD_RETRIES - 1:
                time.sleep(RETRY_BASE_DELAY_SECONDS * (2**attempt))
                continue
            raise last_error

        if provider_error:
            raise DatasetDownloadError("provider_error", provider_error)

        raise DatasetDownloadError(
            "empty_data",
            f"No data returned for symbol '{symbol}' from start date '{start_date}'.",
        )

    if last_error:
        raise last_error

    raise DatasetDownloadError(
        "empty_data",
        f"No data returned for symbol '{symbol}' from start date '{start_date}'.",
    )


def init_dataset_table() -> None:
    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_dataset_downloads (
                    id BIGSERIAL PRIMARY KEY,
                    symbol VARCHAR(16) NOT NULL,
                    start_date DATE NOT NULL,
                    end_date DATE,
                    row_count INTEGER NOT NULL,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (symbol, start_date)
                );
                """
            )
        conn.commit()


def _upsert_download_record(
    symbol: str,
    start_date: str,
    end_date: str | None,
    row_count: int,
    file_name: str,
    file_path: str,
) -> None:
    with _connect_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO stock_dataset_downloads (
                    symbol,
                    start_date,
                    end_date,
                    row_count,
                    file_name,
                    file_path
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (symbol, start_date)
                DO UPDATE SET
                    end_date = EXCLUDED.end_date,
                    row_count = EXCLUDED.row_count,
                    file_name = EXCLUDED.file_name,
                    file_path = EXCLUDED.file_path,
                    updated_at = NOW();
                """,
                (symbol, start_date, end_date, row_count, file_name, file_path),
            )
        conn.commit()


def list_tracked_symbols() -> list[dict[str, str | int | None]]:
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    symbol,
                    COUNT(*)::INTEGER AS records,
                    COALESCE(SUM(row_count), 0)::INTEGER AS total_rows,
                    MAX(updated_at) AS latest_update
                FROM stock_dataset_downloads
                GROUP BY symbol
                ORDER BY symbol ASC;
                """
            )
            rows = cur.fetchall()

    return [
        {
            "symbol": row["symbol"],
            "records": int(row["records"]),
            "totalRows": int(row["total_rows"]),
            "latestUpdate": row["latest_update"].isoformat() if row["latest_update"] else None,
        }
        for row in rows
    ]


def get_symbol_data(symbol: str) -> list[dict[str, str | int | None]]:
    normalized = symbol.strip().upper()
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id,
                    symbol,
                    start_date,
                    end_date,
                    row_count,
                    file_name,
                    file_path,
                    created_at,
                    updated_at
                FROM stock_dataset_downloads
                WHERE symbol = %s
                ORDER BY start_date DESC;
                """,
                (normalized,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": int(row["id"]),
            "symbol": row["symbol"],
            "startDate": row["start_date"].isoformat() if row["start_date"] else None,
            "endDate": row["end_date"].isoformat() if row["end_date"] else None,
            "rows": int(row["row_count"]),
            "file": row["file_name"],
            "filePath": row["file_path"],
            "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        for row in rows
    ]


def get_symbol_preview(symbol: str, points: int | None = None) -> dict[str, str | int | float | list[dict[str, float | str]]]:
    normalized = symbol.strip().upper()

    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT file_path
                FROM stock_dataset_downloads
                WHERE symbol = %s
                ORDER BY updated_at DESC
                LIMIT 1;
                """,
                (normalized,),
            )
            row = cur.fetchone()

    if not row:
        raise RuntimeError(f"No tracked data found for symbol '{normalized}'.")

    file_path = Path(row["file_path"])
    if not file_path.exists():
        raise RuntimeError(f"Tracked file is missing for symbol '{normalized}'.")

    try:
        # yfinance CSVs can include metadata rows (Ticker/Date) when exported from multi-index frames.
        frame = pd.read_csv(file_path, skiprows=[1, 2])
    except Exception:  # noqa: BLE001
        frame = pd.read_csv(file_path)

    if frame.empty:
        return {
            "symbol": normalized,
            "points": [],
            "latestClose": None,
            "change": None,
            "changePercent": None,
        }

    date_column = "Date" if "Date" in frame.columns else frame.columns[0]
    open_column = "Open" if "Open" in frame.columns else None
    high_column = "High" if "High" in frame.columns else None
    low_column = "Low" if "Low" in frame.columns else None
    close_column = "Close" if "Close" in frame.columns else "Adj Close" if "Adj Close" in frame.columns else None

    if not open_column or not high_column or not low_column or not close_column:
        raise RuntimeError(f"Required OHLC columns were not found in tracked file for symbol '{normalized}'.")

    volume_column = "Volume" if "Volume" in frame.columns else None

    selected_columns = [date_column, open_column, high_column, low_column, close_column]
    if volume_column:
        selected_columns.append(volume_column)

    preview_frame = frame[selected_columns].dropna()
    if points and points > 0:
        preview_frame = preview_frame.tail(max(5, points))

    points_payload = [
        {
            "date": str(row_data[date_column]),
            "open": float(row_data[open_column]),
            "high": float(row_data[high_column]),
            "low": float(row_data[low_column]),
            "close": float(row_data[close_column]),
            "volume": int(row_data[volume_column]) if volume_column else 0,
        }
        for _, row_data in preview_frame.iterrows()
    ]

    if not points_payload:
        return {
            "symbol": normalized,
            "points": [],
            "latestClose": None,
            "change": None,
            "changePercent": None,
        }

    first_close = float(points_payload[0]["open"])
    latest_close = float(points_payload[-1]["close"])
    change = latest_close - first_close
    change_percent = (change / first_close * 100.0) if first_close else 0.0

    return {
        "symbol": normalized,
        "points": points_payload,
        "latestClose": latest_close,
        "change": round(change, 4),
        "changePercent": round(change_percent, 4),
    }


def delete_symbol_data(symbol: str) -> dict[str, int | str]:
    normalized = symbol.strip().upper()

    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT file_path FROM stock_dataset_downloads WHERE symbol = %s;",
                (normalized,),
            )
            rows = cur.fetchall()

            cur.execute(
                "DELETE FROM stock_dataset_downloads WHERE symbol = %s RETURNING id;",
                (normalized,),
            )
            deleted_records = len(cur.fetchall())
        conn.commit()

    deleted_files = 0
    for row in rows:
        file_path = Path(row["file_path"])
        if file_path.exists():
            file_path.unlink(missing_ok=True)
            deleted_files += 1

    return {
        "symbol": normalized,
        "deletedRecords": deleted_records,
        "deletedFiles": deleted_files,
    }


def download_dataset_data(symbols: list[str], start_date: str) -> dict:
    downloaded: list[dict[str, str | int]] = []
    failed: list[dict[str, str]] = []

    for symbol in symbols:
        output_path = DATA_DIR / f"{symbol}_{start_date}.csv"
        try:
            frame = _download_with_retry(symbol, start_date)

            frame.to_csv(output_path)

            end_date = frame.index.max().date().isoformat() if len(frame.index) > 0 else None
            rows_count = int(len(frame.index))

            _upsert_download_record(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                row_count=rows_count,
                file_name=output_path.name,
                file_path=str(output_path.resolve()),
            )

            downloaded.append(
                {
                    "symbol": symbol,
                    "rows": rows_count,
                    "file": output_path.name,
                }
            )
        except DatasetDownloadError as exc:
            if output_path.exists():
                output_path.unlink(missing_ok=True)
            failed.append({"symbol": symbol, "code": exc.code, "reason": exc.message})
        except Exception as exc:  # noqa: BLE001
            if output_path.exists():
                output_path.unlink(missing_ok=True)
            failed.append({"symbol": symbol, "code": "internal_error", "reason": str(exc)})

    return {
        "downloaded": downloaded,
        "failed": failed,
        "dataDirectory": str(DATA_DIR),
    }
