import streamlit as st
import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
import plotly.graph_objects as go
from datetime import datetime, timedelta

st.set_page_config(page_title="Stock Strategy Agent", layout="wide")

def fetch_data(ticker, period="1y"):
    """Fetch 1 year of daily data, appending .NS for NSE stocks if necessary."""
    if not ticker.endswith(".NS") and not ticker.startswith("^"):
        ticker += ".NS"
    data = yf.download(ticker, period=period, progress=False)
    
    # yfinance sometimes returns MultiIndex columns. Flatten them
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = [col[0] for col in data.columns]
    
    if not data.empty:
        # Convert to numeric to prevent Series ambiguity errors
        data = data.apply(pd.to_numeric, errors='coerce')
    return data

st.title("📈 Stock Strategy Agent (NSE)")
st.markdown("Analyze NSE stocks with AI-driven reasoning and comparative market performance.")

ticker = st.text_input("Enter NSE Ticker Symbol (e.g., INFY, TCS, RELIANCE)", "INFY").upper()

if ticker:
    with st.spinner(f"Fetching data for {ticker}..."):
        stock_data = fetch_data(ticker)
        sensex = fetch_data("^BSESN")
        nifty_it = fetch_data("^CNXIT")
        
        if stock_data.empty:
            st.error(f"Could not fetch data for {ticker}. Please ensure it's a valid symbol.")
        else:
            # Force close prices to 1D array to handle Series ambiguity errors definitively
            close_prices = np.asarray(stock_data['Close']).flatten()
            close_series = pd.Series(close_prices, index=stock_data.index)
            
            # Use pandas_ta
            stock_data['RSI_14'] = ta.rsi(close_series, length=14)
            stock_data['EMA_20'] = ta.ema(close_series, length=20)
            
            # Latest indicators
            latest_close = close_prices[-1]
            latest_rsi = stock_data['RSI_14'].iloc[-1]
            latest_ema = stock_data['EMA_20'].iloc[-1]
            
            try:
                curr_date = stock_data.index[-1].strftime("%Y-%m-%d")
            except:
                curr_date = "Latest Data"
            
            # AI Reasoning Logic
            signal = "HOLD/NEUTRAL"
            color = "white"
            if pd.isna(latest_rsi):
                reasoning = "Not enough data to calculate indicators."
            else:
                if latest_rsi < 35:
                    signal = "STRONG BUY"
                    color = "green"
                elif latest_rsi > 70:
                    signal = "CAUTION/SELL"
                    color = "red"
                    
                trend_reason = "an UPTREND" if latest_close > latest_ema else "a DOWNTREND"
                
                reasoning = f"""
**Analysis for Date:** {curr_date}

- **Current Price:** ₹{latest_close:.2f}
- **EMA (20):** ₹{latest_ema:.2f} -> Stock is in {trend_reason} relative to its short-term moving average.
- **RSI (14):** {latest_rsi:.2f} -> Indicator is {"Oversold (Buy Territory)" if latest_rsi < 35 else "Overbought (Sell Territory)" if latest_rsi > 70 else "Neutral Territory"}.

> **AI Conclusion:** 
> Given the RSI value of {latest_rsi:.2f}, the system recommends a **{signal}** strategy. 
                """
            
            col1, col2 = st.columns([1, 2])
            
            with col1:
                st.subheader(f"Signal: :{color}[{signal}]")
                st.info(reasoning)
                
                st.subheader("Market Comparison (1-Year)")
                st.markdown("Normalized to 100 for baseline comparison.")
                
                comp_fig = go.Figure()
                
                def add_normalized_trace(fig, df, name, line_color):
                    if not df.empty:
                        prices = np.asarray(df['Close']).flatten()
                        # Find the first non-NaN price
                        valid_mask = ~np.isnan(prices)
                        if valid_mask.any():
                            first_valid = prices[valid_mask][0]
                            normalized = (prices / first_valid) * 100
                            fig.add_trace(go.Scatter(x=df.index, y=normalized, name=name, line=dict(color=line_color, width=1.5)))

                add_normalized_trace(comp_fig, stock_data, ticker, "blue")
                add_normalized_trace(comp_fig, sensex, "Sensex (^BSESN)", "orange")
                add_normalized_trace(comp_fig, nifty_it, "Nifty IT (^CNXIT)", "cyan")
                
                comp_fig.update_layout(
                    height=300, 
                    margin=dict(l=0, r=0, t=30, b=0), 
                    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
                )
                st.plotly_chart(comp_fig, use_container_width=True)

            with col2:
                st.subheader(f"{ticker} - Dynamic Chart")
                
                fig = go.Figure()
                # Cast to 1D objects directly within Plotly trace
                fig.add_trace(go.Candlestick(
                    x=stock_data.index,
                    open=np.asarray(stock_data['Open']).flatten(),
                    high=np.asarray(stock_data['High']).flatten(),
                    low=np.asarray(stock_data['Low']).flatten(),
                    close=np.asarray(stock_data['Close']).flatten(),
                    name="Price"
                ))
                
                fig.add_trace(go.Scatter(
                    x=stock_data.index,
                    y=np.asarray(stock_data['EMA_20']).flatten(),
                    name="EMA (20)",
                    line=dict(color='orange', width=2)
                ))
                
                fig.update_layout(
                    xaxis_rangeslider_visible=False,
                    height=600,
                    margin=dict(l=0, r=0, t=30, b=0),
                    yaxis_title="Price (₹)",
                    template="plotly_dark"
                )
                st.plotly_chart(fig, use_container_width=True)
                
# Advanced Feature Placeholder (TCN)
def tcn_predict_next_day(features_10_days: np.ndarray) -> str:
    """
    Temporal Convolutional Network Placeholder.
    Requires a (10, N) array denoting the last 10 days of features.
    Predicts next day's price trend.
    """
    # In a real scenario: model_tcn.predict(features_10_days)
    return "UPWARD (Demonstration Stub)"

st.markdown("---")
st.markdown("### Advanced AI Engine (TCN)")
st.caption("Temporal Convolutional Network predicting next day's trend based on 10-day lookback features.")

if st.button("Run Deep Learning Prediction"):
    with st.spinner("Analyzing temporal sequences..."):
        # Using dummy zeroes arrays to simulate input
        dummy_input = np.zeros((10, 5))
        pred = tcn_predict_next_day(dummy_input)
        st.success(f"**TCN Prediction:** The expected trend for the next trading day is **{pred}**.")
