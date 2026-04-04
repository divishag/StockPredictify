"""Routes for LSTM model training."""
from fastapi import APIRouter, HTTPException

from app.schemas import (
    AvailableDatasetsResponse,
    TrainModelRequest,
    TrainModelResponse,
)
from app.services import list_available_datasets, train_lstm_model

router = APIRouter(prefix="/api/train", tags=["train"])


@router.get("/datasets")
def get_available_datasets() -> AvailableDatasetsResponse:
    """Get list of available datasets for training."""
    try:
        datasets = list_available_datasets()
        return AvailableDatasetsResponse(datasets=datasets)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing datasets: {str(e)}")


@router.post("/model")
def train_model(payload: TrainModelRequest) -> TrainModelResponse:
    """Train LSTM model on selected stock data with specified parameters."""
    try:
        result = train_lstm_model(
            symbol=payload.symbol,
            window_size=payload.window_size,
            epochs=payload.epochs,
            batch_size=payload.batch_size,
            num_units=payload.num_units,
        )
        return TrainModelResponse(**result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Dataset not found: {str(e)}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameters: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")
