const GroqAI = {
//giving prompt to groq ai
  _buildPrompt(ticker, stockData) {
    const { quote, profile, financials } = stockData;

    const mcap = profile.marketCap
      ? (profile.marketCap >= 1000
          ? `$${(profile.marketCap / 1000).toFixed(2)}T`
          : `$${profile.marketCap.toFixed(0)}B`)
      : 'N/A';

    const prompt = `
You are a professional quantitative stock analyst AI. Analyze the following real-time stock data and provide a structured investment analysis.

STOCK DATA:
- Ticker: ${ticker.toUpperCase()}
- Company: ${profile.name}
- Industry: ${profile.industry}
- Exchange: ${profile.exchange}
- Current Price: $${quote.price}
- Today's Change: ${quote.change >= 0 ? '+' : ''}$${quote.change} (${quote.changePct >= 0 ? '+' : ''}${quote.changePct}%)
- Open: $${quote.open}
- Day High: $${quote.high}
- Day Low: $${quote.low}
- Previous Close: $${quote.prevClose}
- 52-Week High: ${financials.high52w ? '$' + financials.high52w : 'N/A'}
- 52-Week Low: ${financials.low52w ? '$' + financials.low52w : 'N/A'}
- P/E Ratio: ${financials.pe ? financials.pe.toFixed(1) : 'N/A'}
- EPS (TTM): ${financials.eps ? '$' + financials.eps.toFixed(2) : 'N/A'}
- Market Cap: ${mcap}
- Beta: ${financials.beta ? financials.beta.toFixed(2) : 'N/A'}

Based on this data, provide a comprehensive analysis. You MUST respond with ONLY a valid JSON object — no markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "signal": "BULLISH" or "BEARISH" or "NEUTRAL",
  "signal_description": "One sentence explaining the signal",
  "bull_probability": <integer 0-100>,
  "bear_probability": <integer 0-100>,
  "risk_level": "LOW" or "MEDIUM" or "HIGH",
  "risk_score": <integer 0-100, where 100 = maximum risk>,
  "price_target_bear": <number, realistic bear case price in 30 days>,
  "price_target_base": <number, realistic base case price in 30 days>,
  "price_target_bull": <number, realistic bull case price in 30 days>,
  "key_signals": [
    "Signal point 1 (keep under 12 words)",
    "Signal point 2 (keep under 12 words)",
    "Signal point 3 (keep under 12 words)",
    "Signal point 4 (keep under 12 words)"
  ],
  "summary": "2-3 sentence overall summary of the stock outlook.",
  "technical_analysis": "2-3 sentences about price action, momentum, and chart patterns based on the price data.",
  "fundamental_analysis": "2-3 sentences about valuation, P/E, earnings, and financial health.",
  "risk_factors": "2-3 sentences about key risks and what could cause the stock to move against the signal.",
  "recommendation": "1-2 sentences of a clear, direct recommendation for an investor considering this stock."
}

Remember: bull_probability + bear_probability should roughly add to 100. Be realistic and data-driven.
    `.trim();

    return prompt;
  },

  async analyze(ticker, stockData) {
    const prompt = this._buildPrompt(ticker, stockData);

    const response = await fetch(CONFIG.GROQ_BASE, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${CONFIG.GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a professional quantitative stock analyst. Always respond with valid JSON only — no markdown code blocks, no text before or after the JSON object.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,   
        max_tokens:  1200,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content || '';

    const cleaned = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    let analysis;
    try {
      analysis = JSON.parse(cleaned);
    } catch (e) {
      console.error('Raw Groq response:', rawText);
      throw new Error('AI returned an unexpected format. Please try again.');
    }

    const required = ['signal', 'bull_probability', 'bear_probability', 'summary'];
    for (const field of required) {
      if (analysis[field] === undefined) {
        throw new Error(`AI response missing field: ${field}`);
      }
    }

    analysis.bull_probability = parseInt(analysis.bull_probability) || 50;
    analysis.bear_probability = parseInt(analysis.bear_probability) || 50;
    analysis.risk_score       = parseInt(analysis.risk_score)       || 50;

    return analysis;
  },

};
