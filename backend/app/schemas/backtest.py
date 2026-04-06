from __future__ import annotations

from pydantic import BaseModel, Field, model_validator, field_validator


class BacktestRequest(BaseModel):
    symbol: str | None = Field(default=None, min_length=1)
    datasetFile: str | None = Field(default=None, min_length=1)
    initialCash: float = Field(default=100000.0, gt=0)
    trainRatio: float = Field(default=0.8, gt=0.5, lt=0.99)
    windowSize: int | None = Field(default=None, ge=10, le=365)
    rsiWindow: int = Field(default=14, ge=2, le=100)
    lowerBound: float = Field(default=30.0, gt=0, lt=100)
    upperBound: float = Field(default=70.0, gt=0, lt=100)
    minConsecutivePredictions: int = Field(default=3, ge=1, le=10)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str | None) -> str | None:
        if value is None:
            return None

        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("If provided, symbol must be non-empty.")
        return normalized

    @field_validator("datasetFile")
    @classmethod
    def normalize_dataset_file(cls, value: str | None) -> str | None:
        if value is None:
            return None

        cleaned = value.strip()
        if not cleaned:
            raise ValueError("If provided, datasetFile must be non-empty.")
        return cleaned

    @model_validator(mode="after")
    def validate_bounds(self) -> "BacktestRequest":
        if self.lowerBound >= self.upperBound:
            raise ValueError("lowerBound must be smaller than upperBound.")
        return self


class BacktestMetrics(BaseModel):
    initialCash: float
    finalEquity: float
    totalReturnPct: float
    buyHoldReturnPct: float
    maxDrawdownPct: float
    tradeCount: int
    winningTrades: int
    winRatePct: float
    predictionCount: int
    directionalAccuracyPct: float
    mae: float
    rmse: float
    mape: float


class BacktestPredictionPoint(BaseModel):
    date: str
    currentClose: float
    actualNextClose: float
    predictedNextClose: float
    rsi: float | None
    signal: str
    predictedDirection: str
    actualDirection: str
    directionCorrect: bool
    bullishStreak: int
    bearishStreak: int
    position: str


class BacktestChartPoint(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class BacktestTradeEvent(BaseModel):
    tradeId: int
    action: str
    date: str
    price: float
    shares: float
    pnl: float | None = None


class BacktestEquityPoint(BaseModel):
    date: str
    equity: float


class BacktestRunResponse(BaseModel):
    id: int | None = None
    backtestAt: str | None = None
    status: str
    symbol: str
    datasetFile: str
    modelFile: str
    modelPath: str
    parameters: dict
    metrics: BacktestMetrics
    predictions: list[BacktestPredictionPoint]
    chartData: list[BacktestChartPoint]
    trades: list[BacktestTradeEvent]
    equityCurve: list[BacktestEquityPoint]


class BacktestHistoryItem(BaseModel):
    id: int
    symbol: str
    modelFile: str | None = None
    datasetFile: str | None = None
    totalReturnPct: float | None = None
    finalEquity: float | None = None
    maxDrawdownPct: float | None = None
    tradeCount: int | None = None
    backtestAt: str


class BacktestHistoryListResponse(BaseModel):
    items: list[BacktestHistoryItem]
