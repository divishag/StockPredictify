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
