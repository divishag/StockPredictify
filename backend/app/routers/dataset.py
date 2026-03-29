from fastapi import APIRouter, HTTPException

from app.schemas import DatasetDownloadRequest
from app.services import delete_symbol_data, download_dataset_data, get_symbol_data, get_symbol_preview, list_tracked_symbols

router = APIRouter(prefix="/api/dataset", tags=["dataset"])


@router.post("/download")
def download_dataset(payload: DatasetDownloadRequest) -> dict:
    result = download_dataset_data(payload.symbols, payload.startDate.isoformat())

    if not result["downloaded"]:
        all_rate_limited = bool(result["failed"]) and all(
            (
                "rate limit" in str(item.get("reason", "")).lower()
                or "too many requests" in str(item.get("reason", "")).lower()
            )
            for item in result["failed"]
        )

        status_code = 429 if all_rate_limited else 502
        message = (
            "Rate limited by data provider. Please wait 30-60 seconds and try again."
            if all_rate_limited
            else "No datasets were downloaded."
        )

        raise HTTPException(
            status_code=status_code,
            detail={
                "message": message,
                "failed": result["failed"],
            },
        )

    return {
        "message": "Download completed.",
        "downloaded": result["downloaded"],
        "failed": result["failed"],
        "dataDirectory": result["dataDirectory"],
    }


@router.get("/tracked")
def get_tracked_symbols() -> dict:
    return {"items": list_tracked_symbols()}


@router.get("/tracked/{symbol}")
def get_symbol_tracked_data(symbol: str) -> dict:
    items = get_symbol_data(symbol)
    if not items:
        raise HTTPException(status_code=404, detail={"message": f"No tracked data found for symbol '{symbol}'."})
    return {"symbol": symbol.strip().upper(), "items": items}


@router.get("/tracked/{symbol}/preview")
def get_symbol_tracked_preview(symbol: str) -> dict:
    try:
        return get_symbol_preview(symbol)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc


@router.delete("/tracked/{symbol}")
def delete_symbol_tracked_data(symbol: str) -> dict:
    result = delete_symbol_data(symbol)
    if result["deletedRecords"] == 0:
        raise HTTPException(status_code=404, detail={"message": f"No tracked data found for symbol '{symbol}'."})
    return result
