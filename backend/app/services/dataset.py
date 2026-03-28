from pathlib import Path

import yfinance as yf

BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def download_dataset_data(symbols: list[str], start_date: str) -> dict:
    downloaded: list[dict[str, str | int]] = []
    failed: list[dict[str, str]] = []

    for symbol in symbols:
        try:
            frame = yf.download(
                symbol,
                start=start_date,
                progress=False,
                auto_adjust=False,
                threads=False,
            )

            if frame.empty:
                failed.append({"symbol": symbol, "reason": "No data returned for symbol/date."})
                continue

            output_path = DATA_DIR / f"{symbol}_{start_date}.csv"
            frame.to_csv(output_path)

            downloaded.append(
                {
                    "symbol": symbol,
                    "rows": int(len(frame.index)),
                    "file": output_path.name,
                }
            )
        except Exception as exc:  # noqa: BLE001
            failed.append({"symbol": symbol, "reason": str(exc)})

    return {
        "downloaded": downloaded,
        "failed": failed,
        "dataDirectory": str(DATA_DIR),
    }
