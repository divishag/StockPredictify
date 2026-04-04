import pandas as pd
import ta

def analyze_technical(df: pd.DataFrame) -> dict:
    """
    Computes RSI (14-day) and EMA-20 on the stock DataFrame.
    Returns the current values and a technical signal (Buy, Sell, Hold).
    """
    if df.empty or len(df) < 25:
        return {"signal": "NEUTRAL", "rsi": 0, "ema_20": 0, "current_price": 0, "note": "Insufficient data"}
    
    # Calculate RSI
    rsi_indicator = ta.momentum.RSIIndicator(close=df['Close'], window=14)
    df['rsi'] = rsi_indicator.rsi()
    
    # Calculate EMA 20
    ema_indicator = ta.trend.EMAIndicator(close=df['Close'], window=20)
    df['ema_20'] = ema_indicator.ema_indicator()
    
    current_price = round(df['Close'].iloc[-1], 2)
    current_rsi = round(df['rsi'].iloc[-1], 2)
    current_ema = round(df['ema_20'].iloc[-1], 2)
    
    signal = "HOLD"
    reason = "Price and momentum are neutral."
    
    # Simple logic
    if current_rsi < 30 and current_price > current_ema:
        signal = "BUY"
        reason = "Oversold RSI and price above EMA-20 trendline indicates a strong entry."
    elif current_rsi > 70 and current_price < current_ema:
        signal = "SELL"
        reason = "Overbought RSI and price breaking below EMA-20 indicates weakness."
    elif current_price > current_ema:
        signal = "BUY"
        reason = "Price is holding above the EMA-20 trendline indicating bullish trend."
    elif current_price < current_ema:
        signal = "SELL"
        reason = "Price is below the EMA-20 trendline indicating bearish trend."
        
    return {
        "signal": signal,
        "rsi": current_rsi,
        "ema_20": current_ema,
        "current_price": current_price,
        "reason": reason
    }
