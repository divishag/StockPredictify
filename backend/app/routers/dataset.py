from fastapi import APIRouter, HTTPException
import threading
import time
from uuid import uuid4

from app.schemas import DatasetDownloadRequest, TrainModelRequest
from app.services import (
    delete_symbol_data,
    download_dataset_data,
    get_symbol_data,
    get_symbol_preview,
    list_tracked_symbols,
)
from app.services.lstm import (
    delete_trained_model,
    list_downloaded_stock_symbols,
    list_trained_models,
    set_active_trained_model,
    train_model_for_symbol,
)

router = APIRouter(prefix="/api/dataset", tags=["dataset"])

TRAIN_PROGRESS_STEPS = [
    ("load_dataset", "Loading dataset..."),
    ("split_data", "Splitting train and test data..."),
    ("scale_features", "Scaling features..."),
    ("build_sequences", "Building sequences..."),
    ("build_model", "Building LSTM model..."),
    ("train_model", "Training model..."),
    ("save_model", "Saving trained model..."),
]
TRAIN_JOBS: dict[str, dict] = {}
TRAIN_JOBS_LOCK = threading.Lock()


def _initial_step_state() -> list[dict]:
    return [
        {
            "key": key,
            "label": label,
            "status": "pending",
            "startedAt": None,
            "completedAt": None,
            "durationMs": None,
            "progressPct": 0,
            "currentEpoch": None,
            "totalEpochs": None,
            "elapsedMs": None,
        }
        for key, label in TRAIN_PROGRESS_STEPS
    ]


def _update_job_step(job_id: str, step_key: str, event: str, meta: dict | None = None) -> None:
    with TRAIN_JOBS_LOCK:
        job = TRAIN_JOBS.get(job_id)
        if not job:
            return

        now = time.time()
        for step in job["steps"]:
            if step["key"] != step_key:
                continue

            if event == "start":
                if step["status"] == "pending":
                    step["status"] = "in_progress"
                    step["startedAt"] = now
            elif event == "complete":
                if step["startedAt"] is None:
                    step["startedAt"] = now
                step["status"] = "completed"
                step["completedAt"] = now
                step["durationMs"] = int((step["completedAt"] - step["startedAt"]) * 1000)
                step["progressPct"] = 100
            elif event == "failed":
                if step["startedAt"] is None:
                    step["startedAt"] = now
                step["status"] = "failed"
                step["completedAt"] = now
                step["durationMs"] = int((step["completedAt"] - step["startedAt"]) * 1000)
            elif event == "progress":
                if step["status"] == "pending":
                    step["status"] = "in_progress"
                    step["startedAt"] = step["startedAt"] or now

                if meta:
                    progress = meta.get("progressPct")
                    current_epoch = meta.get("currentEpoch")
                    total_epochs = meta.get("totalEpochs")
                    elapsed_ms = meta.get("elapsedMs")

                    if isinstance(progress, (int, float)):
                        step["progressPct"] = max(0, min(100, int(progress)))
                    if isinstance(current_epoch, (int, float)):
                        step["currentEpoch"] = int(current_epoch)
                    if isinstance(total_epochs, (int, float)):
                        step["totalEpochs"] = int(total_epochs)
                    if isinstance(elapsed_ms, (int, float)):
                        step["elapsedMs"] = int(elapsed_ms)

        job["updatedAt"] = now


def _serialize_job(job: dict) -> dict:
    def ts(value: float | None) -> str | None:
        if value is None:
            return None
        return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(value)) + "Z"

    return {
        "jobId": job["jobId"],
        "status": job["status"],
        "createdAt": ts(job.get("createdAt")),
        "updatedAt": ts(job.get("updatedAt")),
        "steps": [
            {
                **step,
                "startedAt": ts(step.get("startedAt")),
                "completedAt": ts(step.get("completedAt")),
            }
            for step in job.get("steps", [])
        ],
        "result": job.get("result"),
        "error": job.get("error"),
    }


def _run_training_job(job_id: str, payload: TrainModelRequest) -> None:
    try:
        result = train_model_for_symbol(
            payload.symbol,
            epochs=payload.epochs,
            batch_size=payload.batchSize,
            window_size=payload.windowSize,
            progress_callback=lambda step_key, event, meta=None: _update_job_step(job_id, step_key, event, meta),
        )
        with TRAIN_JOBS_LOCK:
            job = TRAIN_JOBS.get(job_id)
            if job:
                job["status"] = "completed"
                job["result"] = result
                job["updatedAt"] = time.time()
    except Exception as exc:  # noqa: BLE001
        failed_step_key = None
        with TRAIN_JOBS_LOCK:
            job = TRAIN_JOBS.get(job_id)
            if job:
                for step in job["steps"]:
                    if step["status"] == "in_progress":
                        failed_step_key = step["key"]
                        break

        if failed_step_key:
            _update_job_step(job_id, failed_step_key, "failed")

        with TRAIN_JOBS_LOCK:
            job = TRAIN_JOBS.get(job_id)
            if job:
                job["status"] = "failed"
                job["error"] = {"message": str(exc)}
                job["updatedAt"] = time.time()


@router.post("/download")
def download_dataset(payload: DatasetDownloadRequest) -> dict:
    result = download_dataset_data(payload.symbols, payload.startDate.isoformat())

    if not result["downloaded"]:
        all_rate_limited = bool(result["failed"]) and all(
            str(item.get("code", "")) == "rate_limited"
            for item in result["failed"]
        )

        status_code = 429 if all_rate_limited else 502
        if all_rate_limited:
            message = "Rate limited by data provider. Please wait 30-60 seconds and try again."
        else:
            first_reason = ""
            if result["failed"]:
                first_reason = str(result["failed"][0].get("reason", "")).strip()
            message = first_reason or "No datasets were downloaded due to an unknown provider error."

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


@router.get("/training/stocks")
def get_training_stocks() -> dict:
    symbols = list_downloaded_stock_symbols()
    return {"items": symbols}


@router.post("/training/train")
def train_selected_stock(payload: TrainModelRequest) -> dict:
    job_id = str(uuid4())
    now = time.time()
    with TRAIN_JOBS_LOCK:
        TRAIN_JOBS[job_id] = {
            "jobId": job_id,
            "status": "running",
            "createdAt": now,
            "updatedAt": now,
            "steps": _initial_step_state(),
            "result": None,
            "error": None,
        }

    worker = threading.Thread(target=_run_training_job, args=(job_id, payload), daemon=True)
    worker.start()
    return {"jobId": job_id, "status": "running"}


@router.get("/training/train/{job_id}")
def get_training_job(job_id: str) -> dict:
    with TRAIN_JOBS_LOCK:
        job = TRAIN_JOBS.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail={"message": f"Training job '{job_id}' was not found."})

    return _serialize_job(job)


@router.get("/training/models")
def get_trained_models() -> dict:
    return list_trained_models()


@router.post("/training/models/{model_file}/activate")
def activate_trained_model(model_file: str) -> dict:
    try:
        return set_active_trained_model(model_file)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc


@router.delete("/training/models/{model_file}")
def remove_trained_model(model_file: str) -> dict:
    try:
        return delete_trained_model(model_file)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
