import os
import time
from pathlib import Path

import pandas as pd
import psycopg
from psycopg.rows import dict_row
import yfinance as yf

try:
    from curl_cffi import requests as curl_requests
except Exception:  # noqa: BLE001
    curl_requests = None

BASE_DIR = Path(__file__).resolve().parents[2]

MAX_DOWNLOAD_RETRIES = int(os.getenv("DATASET_DOWNLOAD_RETRIES", "3"))
RETRY_BASE_DELAY_SECONDS = float(os.getenv("DATASET_RETRY_BASE_DELAY", "1.5"))


def _get_stock_data_dir() -> Path:
    """Get the configured stock data directory.
    
    Checks STOCK_DATA_BASE_PATH environment variable first, falls back to <project_root>/data.
    Supports ~ expansion for home directory.
    Creates directory if it doesn't exist.
    """
    custom_path = os.getenv("STOCK_DATA_BASE_PATH", "").strip()
    
    if custom_path:
        data_dir = Path(custom_path).expanduser().resolve()
    else:
        data_dir = BASE_DIR / "data"
    
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def _get_full_data_path(filename: str) -> Path:
    """Get full file path from base directory + filename.
    
    Security check: filename cannot contain path separators or start with '.'
    """
    if "/" in filename or "\\" in filename or filename.startswith("."):
        raise ValueError(f"Invalid filename: {filename}")
    
    return _get_stock_data_dir() / filename


# Initialize DATA_DIR using the new function
DATA_DIR = _get_stock_data_dir()


class DatasetDownloadError(RuntimeError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class _YFinanceCookieCompat:
    """Make curl_cffi cookies iterable as cookie objects for yfinance internals."""

    def __init__(self, cookies):
        self._cookies = cookies

    def __iter__(self):
        jar = getattr(self._cookies, "jar", None)
        if jar is not None:
            return iter(jar)
        return iter(self._cookies)

    def __bool__(self):
        return bool(self._cookies)

    def __getattr__(self, name):
        return getattr(self._cookies, name)


class _YFinanceResponseCompat:
    """Proxy response with yfinance-compatible cookies iterator semantics."""

    def __init__(self, response):
        self._response = response
        self.cookies = _YFinanceCookieCompat(response.cookies)

    def __getattr__(self, name):
        return getattr(self._response, name)


class _YFinanceCurlSessionAdapter:
    """Adapter that keeps curl_cffi session usage while normalizing response cookies."""

    def __init__(self, session):
        self._session = session
        self.cookies = session.cookies

    @staticmethod
    def _wrap_response(response):
        cookies = getattr(response, "cookies", None)
        if cookies is None:
            return response

        try:
            first_item = next(iter(cookies))
        except StopIteration:
            return response
        except Exception:  # noqa: BLE001
            return response

        if isinstance(first_item, str) and getattr(cookies, "jar", None) is not None:
            return _YFinanceResponseCompat(response)

        return response

    def get(self, *args, **kwargs):
        response = self._session.get(*args, **kwargs)
        return self._wrap_response(response)

    def post(self, *args, **kwargs):
        response = self._session.post(*args, **kwargs)
        return self._wrap_response(response)

    def close(self):
        return self._session.close()

    def __getattr__(self, name):
        return getattr(self._session, name)


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
    """Check if error message indicates rate limiting by the data provider."""
    lowered = message.lower()
    return "rate limit" in lowered or "too many requests" in lowered or "yf_rate_limit" in lowered


def _classify_exception_error(exc: Exception, symbol: str) -> tuple[str, str]:
    """Classify an exception and return (code, message) tuple."""
    exc_message = str(exc).strip()
    
    if _is_rate_limited_error(exc_message):
        return ("rate_limited", f"Rate limited by data provider for {symbol}: {exc_message}")
    
    if any(term in exc_message.lower() for term in ["connection", "timeout", "refused", "ssl", "certificate"]):
        return ("connection_error", f"Connection error for {symbol}: {exc_message}")
    
    return ("provider_exception", f"Data provider request failed for {symbol}: {exc_message}")


def _create_yfinance_session():
    """Create a session yfinance can use to reduce provider blocking.

    Prefer curl_cffi with Chrome impersonation when available, since that is the
    compatibility path suggested by yfinance maintainers and community reports.
    Fall back to yfinance's default session behavior if the package is missing.
    """
    if curl_requests is None:
        return None

    # yfinance caches cookie objects. If a previous run cached an incompatible
    # string cookie, clear it so new requests can fetch a compatible cookie.
    try:
        cookie_cache = yf.cache.get_cookie_cache()
        basic_cookie = cookie_cache.lookup("basic")
        cached_cookie = basic_cookie.get("cookie") if isinstance(basic_cookie, dict) else None
        if cached_cookie is not None and not hasattr(cached_cookie, "name"):
            cookie_cache.store("basic", None)
    except Exception:  # noqa: BLE001
        pass

    session = curl_requests.Session(impersonate="chrome")
    return _YFinanceCurlSessionAdapter(session)


def _download_with_retry(symbol: str, start_date: str):
    """Download data with retry logic for transient failures and rate limiting."""
    last_error: DatasetDownloadError | None = None
    session = _create_yfinance_session()

    try:
        for attempt in range(MAX_DOWNLOAD_RETRIES):
            try:
                # Clear any previous errors from yfinance shared state
                shared_errors = getattr(yf.shared, "_ERRORS", None)
                if isinstance(shared_errors, dict):
                    shared_errors.pop(symbol, None)

                frame = yf.download(
                    symbol,
                    start=start_date,
                    progress=False,
                    auto_adjust=False,
                    threads=False,
                    session=session,
                )
            except Exception as exc:  # noqa: BLE001
                # Classify the exception error type
                error_code, error_msg = _classify_exception_error(exc, symbol)
                last_error = DatasetDownloadError(error_code, error_msg)

                # Retry on transient errors and rate limits
                is_retryable = error_code in ("rate_limited", "connection_error")
                if is_retryable and attempt < MAX_DOWNLOAD_RETRIES - 1:
                    time.sleep(RETRY_BASE_DELAY_SECONDS * (2**attempt))
                    continue

                # Raise immediately for permanent errors or after max retries
                raise last_error

            if not frame.empty:
                return frame

            # yfinance returned empty frame; check detailed provider error from shared state
            provider_error = ""
            try:
                provider_error = str(getattr(yf.shared, "_ERRORS", {}).get(symbol, ""))
            except Exception:  # noqa: BLE001
                provider_error = ""

            if provider_error and _is_rate_limited_error(provider_error):
                # Rate limit error: retry with backoff
                last_error = DatasetDownloadError(
                    "rate_limited",
                    f"Rate limited by data provider for {symbol}: {provider_error}",
                )
                if attempt < MAX_DOWNLOAD_RETRIES - 1:
                    time.sleep(RETRY_BASE_DELAY_SECONDS * (2**attempt))
                    continue
                raise last_error

            if provider_error:
                # Other provider error (invalid symbol, no data, etc.)
                raise DatasetDownloadError("provider_error", provider_error)

            # No data returned without provider error
            raise DatasetDownloadError(
                "empty_data",
                f"No data returned for symbol '{symbol}' from start date '{start_date}'.",
            )

        # This should rarely be reached, but handle the case where all retries exhausted
        if last_error:
            raise last_error

        raise DatasetDownloadError(
            "empty_data",
            f"No data returned for symbol '{symbol}' from start date '{start_date}'.",
        )
    finally:
        if session is not None and hasattr(session, "close"):
            session.close()


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
    
    # Migrate any absolute paths to relative paths (filenames only)
    _migrate_file_paths_to_relative()


def _migrate_file_paths_to_relative() -> None:
    """Migrate existing absolute paths in file_path column to relative paths (filenames only).
    
    This handles records that were stored with absolute paths before introducing
    the _get_stock_data_dir() refactoring.
    """
    with _connect_db(row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Find all rows with absolute paths (contains /, \, or :)
            cur.execute(
                """
                SELECT id, file_path 
                FROM stock_dataset_downloads 
                WHERE file_path LIKE '/%' 
                   OR file_path LIKE '%\\%' 
                   OR file_path LIKE '%:%';
                """
            )
            rows = cur.fetchall()
            
            if not rows:
                return
            
            # Update each row with just the filename
            migrated = 0
            for row in rows:
                try:
                    old_path = row["file_path"]
                    new_path = Path(old_path).name  # Extract filename only
                    
                    cur.execute(
                        "UPDATE stock_dataset_downloads SET file_path = %s WHERE id = %s;",
                        (new_path, row["id"]),
                    )
                    migrated += 1
                except Exception:  # noqa: BLE001
                    # Skip rows that can't be migrated
                    pass
            
            conn.commit()
            
    if migrated > 0:
        print(f"Migrated {migrated} file paths from absolute to relative format")


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

    try:
        file_path = _get_full_data_path(row["file_path"])
    except ValueError:
        raise RuntimeError(f"Invalid file path stored for symbol '{normalized}'.")
    
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
        try:
            file_path = _get_full_data_path(row["file_path"])
            if file_path.exists():
                file_path.unlink(missing_ok=True)
                deleted_files += 1
        except ValueError:
            # Invalid filename stored in database, skip
            pass

    return {
        "symbol": normalized,
        "deletedRecords": deleted_records,
        "deletedFiles": deleted_files,
    }


def download_dataset_data(symbols: list[str], start_date: str) -> dict:
    downloaded: list[dict[str, str | int]] = []
    failed: list[dict[str, str]] = []

    for symbol in symbols:
        filename = f"{symbol}_{start_date}.csv"
        output_path = _get_full_data_path(filename)
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
                file_name=filename,
                file_path=filename,  # Store only the filename, not full path
            )

            downloaded.append(
                {
                    "symbol": symbol,
                    "rows": rows_count,
                    "file": filename,
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
        "dataDirectory": str(_get_stock_data_dir()),
    }
