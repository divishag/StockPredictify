import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

def fetch_stock_data(ticker: str, period: str = "1y") -> pd.DataFrame:
    """
    Fetches historical price data for the specified ticker.
    Automatically appends .NS for Indian markets.
    """
    if '.' not in ticker:
        ticker = f"{ticker}.NS"
        
    stock = yf.Ticker(ticker)
    df = stock.history(period=period)
    return df

def fetch_stock_news(ticker: str) -> list[dict]:
    """
    Fetches recent news headlines for the specified ticker.
    Returns a list of dicts with 'title', 'publisher', 'link'.
    """
    if '.' not in ticker:
        ticker = f"{ticker}.NS"
        
    stock = yf.Ticker(ticker)
    news = stock.news
    return news if news else []

def fetch_macro_data(macro_ticker: str = "^BSESN", period: str = "1mo") -> dict:
    """
    Fetches data for a macro indicator like the Sensex (^BSESN) or Nifty IT (^CNXIT).
    """
    try:
        index = yf.Ticker(macro_ticker)
        df = index.history(period=period)
        if df.empty or len(df) < 2:
            return {"current": 0, "change_pct": 0, "status": "unavailable"}
        
        # Resolve series ambiguity by forcing scalar floats
        current_price = float(df['Close'].iloc[-1])
        start_price = float(df['Close'].iloc[0])
        change_pct = ((current_price - start_price) / start_price) * 100
        
        return {
            "current": round(current_price, 2),
            "change_pct": round(change_pct, 2),
            "status": "available"
        }
    except Exception as e:
        print(f"Error fetching macro data for {macro_ticker}: {e}")
        return {"current": 0, "change_pct": 0, "status": "error"}
