# StockAI — Market Intelligence

An experimental AI tool that analyzes market trends and stock signals.It provides real-time market data and AI-generated investment insights using Groq's Llama 3.3 70B model.

![StockAI](https://img.shields.io/badge/StockAI-v1.0-00d4ff?style=for-the-badge)
![HTML](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

---

## What is StockAI?

StockAI is a real-time stock analysis web app that combines live market data with AI-generated insights. Enter any stock ticker and get a full analysis — buy/sell signals, price targets, risk scoring, and a detailed written breakdown powered by Llama 3.3.

---

## Features

- **Real-time stock data** — live price, open, high, low, 52-week range, market cap, P/E ratio
- **Interactive charts** — live Chart.js line charts with 1D / 1W / 1M / 3M period switching
- **AI-generated analysis** — full written analysis from Groq (Llama 3.3 70B)
- **Buy/Sell signal** — BULLISH / BEARISH / NEUTRAL with confidence score
- **Probability bars** — bull vs bear probability percentage
- **Price targets** — bear case / base case / bull case for 30 days
- **Risk scoring** — LOW / MEDIUM / HIGH with visual risk meter
- **Key signals** — 4 AI-detected technical and fundamental signals
- **8 quick-select stocks** — AAPL, NVDA, TSLA, MSFT, GOOGL, AMZN, META, NFLX
- **Dark futuristic UI** — glassmorphism cards, neon cyan accents, fully responsive

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| HTML5 | Page structure |
| CSS3 | Styling, animations, glassmorphism |
| Vanilla JavaScript | Logic, API calls, DOM manipulation |
| Chart.js | Interactive stock price charts |
| Yahoo Finance API | Real-time stock data (no key needed) |
| Groq API (Llama 3.3 70B) | AI-generated stock analysis |
| corsproxy.io | CORS proxy for Yahoo Finance |

---

## Project Structure

```
StockAI/
│
├── index.html                  # Landing page
├── analyze.template.html       # Analyzer page (rename to analyze.html)
│
├── css/
│   ├── css-base.css            # Design tokens, reset, typography
│   ├── dark-theme.css          # Dark theme, navbar, background
│   ├── animations.css          # Scroll reveal, fadeUp animations
│   ├── stock-card.css          # Stock preview card styles
│   ├── ui-polish.css           # Responsive breakpoints, polish
│   └── analyze.css             # Analyzer page styles
│
└── js/
    ├── javascript.js           # Landing page charts and scroll effects
    ├── finnhub.js              # Yahoo Finance API integration
    ├── groq.js                 # Groq AI API integration
    ├── chart-analyzer.js       # Live analyzer chart
    └── analyze.js              # Main analyzer controller
```

---

## Setup & Usage

### 1. Clone the repo
```bash
git clone https://github.com/sakshammhere/StockAI-Intelligence.git
cd StockAI-Intelligence
```

### 2. Get a free Groq API key

### 3. Run & Open in browser

---

## How It Works

```
User enters ticker (e.g. AAPL)
        ↓
Yahoo Finance API fetches:
├── Current price, open, high, low
├── Company name, exchange, market cap
├── P/E ratio, EPS, 52-week high/low
└── Historical price data for chart
        ↓
UI renders price card, chart, metrics instantly
        ↓
Groq API (Llama 3.3 70B) receives all stock data
└── Returns structured JSON analysis:
    ├── BULLISH / BEARISH / NEUTRAL signal
    ├── Bull/Bear probability %
    ├── Risk level + score
    ├── 30-day price targets (bear/base/bull)
    ├── 4 key technical/fundamental signals
    └── Written sections: summary, technical, fundamental, risks, recommendation
        ↓
UI renders full AI analysis panel
```

## Author

**Saksham** — [github.com/sakshammhere](https://github.com/sakshammhere)
