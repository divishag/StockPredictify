from fastapi import APIRouter, HTTPException

from app.schemas import BacktestHistoryListResponse, BacktestRequest, BacktestRunResponse
from app.services.backtest import run_backtest_strategy
from app.services.backtest_history import delete_backtest_run, get_backtest_run, list_backtest_runs, save_backtest_run

router = APIRouter(tags=["backtests"])


@router.get("/backtests", response_model=BacktestHistoryListResponse)
def get_backtests() -> BacktestHistoryListResponse:
    try:
        items = list_backtest_runs()
        return BacktestHistoryListResponse(items=items)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"message": f"Failed to fetch backtests: {str(exc)}"}) from exc


@router.get("/backtests/{backtest_id}", response_model=BacktestRunResponse)
def get_backtest_details(backtest_id: int) -> BacktestRunResponse:
    if backtest_id <= 0:
        raise HTTPException(status_code=400, detail={"message": "backtest_id must be a positive integer."})

    try:
        payload = get_backtest_run(backtest_id)
        if not payload:
            raise HTTPException(status_code=404, detail={"message": f"Backtest '{backtest_id}' was not found."})
        return BacktestRunResponse(**payload)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"message": f"Failed to fetch backtest details: {str(exc)}"}) from exc


@router.post("/backtests", response_model=BacktestRunResponse)
def run_and_store_backtest(payload: BacktestRequest) -> BacktestRunResponse:
    try:
        result = run_backtest_strategy(payload.model_dump())
        stored = save_backtest_run(result)
        result["id"] = stored["id"]
        result["backtestAt"] = stored["backtestAt"]
        return BacktestRunResponse(**result)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"message": f"Backtest failed: {str(exc)}"}) from exc


@router.delete("/backtests/{backtest_id}")
def delete_backtest(backtest_id: int) -> dict:
    if backtest_id <= 0:
        raise HTTPException(status_code=400, detail={"message": "backtest_id must be a positive integer."})

    try:
        deleted = delete_backtest_run(backtest_id)
        if not deleted:
            raise HTTPException(status_code=404, detail={"message": f"Backtest '{backtest_id}' was not found."})

        return {
            "id": int(backtest_id),
            "message": "Backtest deleted successfully.",
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail={"message": f"Failed to delete backtest: {str(exc)}"}) from exc
