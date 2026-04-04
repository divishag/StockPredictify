from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.lstm import forecast_future

prediction_router = APIRouter(prefix="/api/predict", tags=["prediction"])

class PredictRequest(BaseModel):
    symbol: str
    days: int = 7

@prediction_router.post("/")
def run_prediction(request: PredictRequest):
    ticker = request.symbol
    if not ticker:
        raise HTTPException(status_code=400, detail="Symbol is required")
        
    try:
        forecast_result = forecast_future(symbol=ticker, days_ahead=request.days)
        return {"status": "success", "data": forecast_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
