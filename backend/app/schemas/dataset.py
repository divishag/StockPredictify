from datetime import date

from pydantic import BaseModel, Field, field_validator


class DatasetDownloadRequest(BaseModel):
    symbols: list[str] = Field(..., min_length=1)
    startDate: date

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, symbols: list[str]) -> list[str]:
        normalized_symbols = []
        for symbol in symbols:
            cleaned = symbol.strip().upper()
            if cleaned:
                normalized_symbols.append(cleaned)

        if not normalized_symbols:
            raise ValueError("At least one valid stock symbol is required.")

        return normalized_symbols


class TrainModelRequest(BaseModel):
    symbol: str = Field(..., min_length=1)
    epochs: int = Field(default=5, ge=1, le=200)
    batchSize: int = Field(default=2, ge=1, le=128)
    windowSize: int = Field(default=60, ge=10, le=365)
    modelType: str = Field(default="lstm")

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, symbol: str) -> str:
        normalized = symbol.strip().upper()
        if not normalized:
            raise ValueError("A valid stock symbol is required.")
        return normalized

    @field_validator("modelType")
    @classmethod
    def normalize_model_type(cls, model_type: str) -> str:
        normalized = model_type.strip().lower()
        if normalized not in {"lstm", "tcn"}:
            raise ValueError("modelType must be either 'lstm' or 'tcn'.")
        return normalized
