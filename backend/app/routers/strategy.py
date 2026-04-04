from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
import time

strategy_router = APIRouter(prefix="/api/strategy", tags=["strategy"])

class TCNPredictionResponse(BaseModel):
    symbol: str
    prediction: str
    lookback_days: int

def fetch_yfinance_data_safe(ticker: str, period="1y", retries=3):
    """Fetch yfinance data with basic retry logic to avoid rate limits."""
    if not ticker.endswith(".NS") and not ticker.startswith("^"):
        ticker += ".NS"
        
    for attempt in range(retries):
        try:
            data = yf.download(ticker, period=period, progress=False)
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = [col[0] for col in data.columns]
                
            if not data.empty:
                data = data.apply(pd.to_numeric, errors='coerce')
            return data
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
            else:
                print(f"Failed fetching {ticker}. Error: {e}")
                return pd.DataFrame()
    return pd.DataFrame()

def tcn_predict_next_day(features_10_days: np.ndarray) -> str:
    """
    Temporal Convolutional Network Placeholder.
    Requires a (10, N) array denoting the last 10 days of features.
    Predicts next day's price trend.
    """
    return "UPWARD (Placeholder logic)"

@strategy_router.get("/{symbol}")
def get_strategy_analysis(symbol: str):
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol is required")
        
    # Fetch Data
    stock_data = fetch_yfinance_data_safe(symbol)
    
    if stock_data.empty:
        raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")
        
    # Get Market indices
    sensex = fetch_yfinance_data_safe("^BSESN")
    nifty_it = fetch_yfinance_data_safe("^CNXIT")
    
    # Calculate indicators
    close_prices = np.asarray(stock_data['Close']).flatten()
    close_series = pd.Series(close_prices, index=stock_data.index)
    
    stock_data['RSI_14'] = ta.rsi(close_series, length=14)
    stock_data['EMA_20'] = ta.ema(close_series, length=20)
    
    # Flatten everything for JSON serialization
    dates_str = [d.strftime("%Y-%m-%d") for d in stock_data.index]
    
    # Pre-calculate normalized series for front-end charting
    def normalize(arr):
        arr_flat = np.asarray(arr).flatten()
        valid = arr_flat[~np.isnan(arr_flat)]
        if len(valid) == 0:
            return arr_flat.tolist()
        return ((arr_flat / valid[0]) * 100).tolist()
    
    stock_norm = normalize(stock_data['Close'])
    sensex_norm = normalize(sensex['Close']) if not sensex.empty else []
    nifty_it_norm = normalize(nifty_it['Close']) if not nifty_it.empty else []
    
    latest_close = float(close_prices[-1])
    try:
        latest_rsi = float(stock_data['RSI_14'].iloc[-1])
        latest_ema = float(stock_data['EMA_20'].iloc[-1])
    except:
        latest_rsi = 50.0 # Default Neutral
        latest_ema = latest_close
        
    # AI Logic
    signal = "HOLD/NEUTRAL"
    if not pd.isna(latest_rsi):
        if latest_rsi < 35:
            signal = "STRONG BUY"
        elif latest_rsi > 70:
            signal = "CAUTION/SELL"
            
    trend_reason = "an UPTREND" if latest_close > latest_ema else "a DOWNTREND"
    
    # Format Reasoning
    curr_date = dates_str[-1] if dates_str else "Latest"
    rsi_desc = "Oversold (Buy Territory)" if latest_rsi < 35 else "Overbought (Sell Territory)" if latest_rsi > 70 else "Neutral Territory"
    
    reasoning = f"Analysis for Date: {curr_date}\n\n- Current Price: ₹{latest_close:.2f}\n- EMA (20): ₹{latest_ema:.2f} -> Stock is in {trend_reason} relative to its short-term moving average.\n- RSI (14): {latest_rsi:.2f} -> Indicator is {rsi_desc}.\n\nAI Conclusion: Given the RSI value of {latest_rsi:.2f}, the system recommends a {signal} strategy."
    
    # Build chart data
    chart_data = {
        "dates": dates_str,
        "open": np.asarray(stock_data['Open']).flatten().tolist(),
        "high": np.asarray(stock_data['High']).flatten().tolist(),
        "low": np.asarray(stock_data['Low']).flatten().tolist(),
        "close": close_prices.tolist(),
        "ema_20": np.asarray(stock_data['EMA_20']).flatten().tolist(),
        "rsi_14": np.asarray(stock_data['RSI_14']).flatten().tolist(),
        "comparisons": {
            "stock_normalized": stock_norm,
            "sensex_normalized": sensex_norm,
            "nifty_it_normalized": nifty_it_norm
        }
    }
    
    # Advanced feature placeholder
    dummy_input = np.zeros((10, 5))
    tcn_prediction = tcn_predict_next_day(dummy_input)

    return {
        "symbol": symbol,
        "signal": signal,
        "ai_reasoning": reasoning,
        "latest_metrics": {
            "close": latest_close,
            "rsi_14": latest_rsi,
            "ema_20": latest_ema
        },
        "advanced_tcn_prediction": {
            "prediction": tcn_prediction,
            "lookback_days": 10
        },
        "chart_data": chart_data
    }
