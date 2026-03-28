from fastapi import APIRouter, HTTPException

from app.schemas import DatasetDownloadRequest
from app.services import download_dataset_data

router = APIRouter(prefix="/api/dataset", tags=["dataset"])


@router.post("/download")
def download_dataset(payload: DatasetDownloadRequest) -> dict:
    result = download_dataset_data(payload.symbols, payload.startDate.isoformat())

    if not result["downloaded"]:
        raise HTTPException(
            status_code=502,
            detail={
                "message": "No datasets were downloaded.",
                "failed": result["failed"],
            },
        )

    return {
        "message": "Download completed.",
        "downloaded": result["downloaded"],
        "failed": result["failed"],
        "dataDirectory": result["dataDirectory"],
    }
