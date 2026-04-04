import os
import json
from google import genai
from google.genai import types

def run_agent_debate(ticker: str, tech_data: dict, news_data: list, macro_data: dict) -> dict:
    """
    Simulates a debate between the Technical, News Sentiment, and Macro agents
    using Google Gemini. Returns the final unified Market Signal and rationale.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or api_key == "your_gemini_api_key_here":
        # Fallback if no API key is provided
        return {
            "market_signal": tech_data.get("signal", "HOLD"),
            "ai_reasoning": f"Analysis for {ticker}: RSI is {tech_data.get('rsi', 0)}. Sensex is at {macro_data.get('current', 0)}. Price is {tech_data.get('current_price', 0)}, {"above" if tech_data.get('current_price', 0) > tech_data.get('ema_20', 0) else "below"} the EMA-20 trendline. (Live AI requires GEMINI_API_KEY)."
        }

    client = genai.Client(api_key=api_key)
    
    # Prepare the context
    headlines = [n.get("title") for n in news_data[:5]] if news_data else ["No recent news available."]
    
    system_instruction = (
        "You are the Head Analyst of a stock strategy firm. You are moderating a debate between three "
        "specialized sub-agents: Technical Analyst, News Sentiment Analyst, and Macroeconomic Analyst. "
        "Review their findings and provide a final conclusion on whether to BUY, SELL, or HOLD the stock. "
        "Return a JSON object containing:\n"
        "1. 'market_signal': The final consensus (must be exactly 'BUY', 'SELL', or 'HOLD', or 'NEUTRAL').\n"
        "2. 'ai_reasoning': A precise, elegant 2-3 sentence summary explaining the rationale and economy context, similar to:\n"
        f"\"Analysis for {ticker}: RSI is X. Sensex is at Y. Price is Z, below/above the EMA-20 trendline...\""
    )

    prompt = (
        f"Debate Context for {ticker}:\n\n"
        f"Technical Analyst says: signal={tech_data.get('signal')}, "
        f"RSI={tech_data.get('rsi')}, EMA-20={tech_data.get('ema_20')}, Price={tech_data.get('current_price')}. "
        f"Reasoning: {tech_data.get('reason')}\n\n"
        f"News Sentiment Analyst says: Here are the latest headlines: {headlines}\n\n"
        f"Macro Analyst says: Sensex (^BSESN) is current at {macro_data.get('current')} with a 1-month change of {macro_data.get('change_pct')}%\n\n"
        "Analyze these conflicting or agreeing signals, resolve the debate, and return the final JSON."
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2
            ),
        )
        result = json.loads(response.text)
        return {
            "market_signal": result.get("market_signal", "HOLD").upper(),
            "ai_reasoning": result.get("ai_reasoning", "Analysis completed.")
        }
    except Exception as e:
        print(f"Failed to run agent debate via Gemini: {e}")
        return {
            "market_signal": tech_data.get("signal", "NEUTRAL"),
            "ai_reasoning": f"Fallback Analysis for {ticker}: RSI is {tech_data.get('rsi', 0)}. Price is {tech_data.get('current_price', 0)}."
        }
