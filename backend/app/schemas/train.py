"""Schemas for LSTM model training requests and responses."""
from pydantic import BaseModel, Field


class TrainModelRequest(BaseModel):
    """Request schema for LSTM model training."""

    symbol: str = Field(..., min_length=1, description="Stock symbol (e.g., AAPL_2016-01-01)")
    window_size: int = Field(
        default=60, ge=10, le=500, description="Lookback window size for sequences"
    )
    epochs: int = Field(
        default=5, ge=1, le=100, description="Number of training epochs"
    )
    batch_size: int = Field(
        default=2, ge=1, le=64, description="Batch size for training"
    )
    num_units: int = Field(
        default=150, ge=50, le=500, description="Number of units in LSTM layers"
    )


class PredictionPoint(BaseModel):
    """Single prediction data point."""

    date: str
    actual: float
    predicted: float


class MetricsResponse(BaseModel):
    """Model evaluation metrics."""

    mae: float
    rmse: float
    mape: float
    r2: float


class TrainModelResponse(BaseModel):
    """Response schema for completed LSTM training."""

    status: str
    symbol: str
    model_path: str
    metrics: MetricsResponse
    predictions: list[PredictionPoint]
    train_size: int
    test_size: int
    parameters: dict


class AvailableDatasetsResponse(BaseModel):
    """List of available datasets for training."""

    datasets: list[str]
