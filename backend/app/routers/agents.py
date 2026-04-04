from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.agents.data_fetcher import fetch_stock_data, fetch_stock_news, fetch_macro_data
from app.services.agents.analysts import analyze_technical
from app.services.agents.debater import run_agent_debate

agents_router = APIRouter(prefix="/api/agents", tags=["agents"])

class AgentDebateRequest(BaseModel):
    symbol: str

@agents_router.post("/debate")
def run_debate(request: AgentDebateRequest):
    ticker = request.symbol
    if not ticker:
        raise HTTPException(status_code=400, detail="Symbol is required")
    
    # 1. Fetch Data
    try:
        # historical data for technicals
        price_df = fetch_stock_data(ticker, period="6mo")
        # news for sentiment
        news = fetch_stock_news(ticker)
        # macro index data
        macro = fetch_macro_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching data: {str(e)}")

    if price_df.empty:
         raise HTTPException(status_code=404, detail=f"No price data found for {ticker}")

    # 2. Extract Data for chart payload
    chart_data = []
    try:
        # Get last 60 days for frontend charting
        sliced_df = price_df.tail(60).copy()
        
        # Make a quick EMA 20 over the whole dataset but slice the output so it matches the chart length
        import ta
        ema_indicator = ta.trend.EMAIndicator(close=price_df['Close'], window=20)
        price_df['ema_20'] = ema_indicator.ema_indicator()
        
        sliced_df = price_df.tail(60)
        for index, row in sliced_df.iterrows():
            ema_val = row['ema_20'] if not pd.isna(row['ema_20']) else row['Close']
            chart_data.append({
                "time": index.strftime('%Y-%m-%d'),
                "value": round(row['Close'], 2),
                "ema20": round(ema_val, 2)
            })
    except Exception as e:
        print("Error formatting chart data", e)
        # fallback if indexing fails
        pass

    import pandas as pd

    # 3. Analyze Technicals
    tech_data = analyze_technical(price_df)

    # 4. Run the Agent Debate (LLM)
    debate_result = run_agent_debate(ticker, tech_data, news, macro)

    return {
        "symbol": ticker,
        "market_signal": debate_result.get("market_signal"),
        "ai_reasoning": debate_result.get("ai_reasoning"),
        "tech_data": tech_data,
        "macro_data": macro,
        "chart_data": chart_data
    }
