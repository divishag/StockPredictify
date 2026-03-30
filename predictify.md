# StockPredictify

A modern full-stack stock prediction and analysis platform with machine learning capabilities. Train LSTM models on historical stock data, visualize predictions, and analyze market trends with an interactive React frontend and FastAPI backend.

![StockPredictify](https://img.shields.io/badge/StockPredictify-v2.0-00d4ff?style=for-the-badge)
![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-FF6F00?style=for-the-badge&logo=tensorflow&logoColor=white)

---

## What is StockPredictify?

StockPredictify is a full-stack application that combines machine learning with stock market analysis. Train LSTM neural networks on historical stock data, visualize predictions with interactive charts, and understand market patterns through a modern, user-friendly interface.

---

## Features

### 🧠 Machine Learning
- **LSTM Model Training** — Train deep learning models on historical stock data
- **Configurable Training Parameters** — Adjust epochs, batch size, and window size for optimal results
- **Real-time Training Progress** — 7-step progress pipeline with interactive status updates
- **Model Persistence** — Trained models saved as `.keras` files for future predictions

### 📊 Data & Visualization
- **Historical Stock Data** — CSV-based stock data (AAPL, TSLA pre-loaded)
- **Interactive Charts** — Lightweight OHLC charts for trend analysis
- **Training Metrics** — MAE, RMSE, MAPE, and R² score reporting
- **Dark Theme Support** — Fully responsive dark mode UI with theme context

### 🎯 Workflow
- **Workflow Pipeline** — Manage multiple stock analysis and training tasks
- **Training Summary** — View detailed results including model filename and performance metrics
- **Parameter Defaults** — Sensible defaults (epochs=5, batch_size=2, window_size=60) for quick starts
- **Extensible Architecture** — Built for easy integration with additional data sources and prediction algorithms

---

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| **Frontend** | React | Latest |
| **Frontend Build** | Vite | Latest |
| **Backend** | FastAPI | 0.115.0 |
| **Server** | Uvicorn | 0.30.6 |
| **ML Framework** | TensorFlow/Keras | 3.13.2 |
| **Data Processing** | Pandas | 2.2.3 |
| **Feature Scaling** | scikit-learn | 1.8.0 |
| **Numerical Computing** | NumPy | 2.4.4 |
| **Python Version** | Python | 3.11.8 |

---

## Project Structure

```
StockPredictify/
│
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app entry point
│   │   ├── config.py               # Configuration settings
│   │   ├── db_init.py              # Database initialization
│   │   │
│   │   ├── routers/
│   │   │   ├── health.py           # Health check endpoint
│   │   │   └── dataset.py          # Dataset and training endpoints
│   │   │
│   │   ├── schemas/
│   │   │   └── dataset.py          # Pydantic models (TrainModelRequest)
│   │   │
│   │   └── services/
│   │       └── lstm.py             # LSTM training service
│   │
│   ├── data/
│   │   ├── AAPL_2016-01-01.csv    # Apple stock data
│   │   └── TSLA_2016-01-01.csv    # Tesla stock data
│   │
│   ├── models/                     # Trained .keras models saved here
│   ├── requirements.txt            # Python dependencies
│   └── README.md                   # Backend setup guide
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                # React entry point
│   │   ├── App.jsx                 # Root App component
│   │   ├── App.css                 # Global styles
│   │   │
│   │   ├── components/
│   │   │   └── LightweightOhlcChart.jsx  # OHLC chart component
│   │   │
│   │   ├── pages/
│   │   │   └── WorkflowPage.jsx    # Main workflow page with training UI
│   │   │
│   │   ├── services/
│   │   │   └── datasetService.js   # API client for backend
│   │   │
│   │   ├── context/
│   │   │   └── ThemeContext.jsx    # Dark mode theme provider
│   │   │
│   │   └── styles/
│   │       └── theme.css           # Theme variables
│   │
│   ├── index.html                  # HTML template
│   ├── vite.config.js              # Vite configuration
│   ├── package.json                # Node dependencies
│   │
│   └── legacy/                     # Legacy HTML-based analyzer (archived)
│
├── predictify.md                   # This file
└── .gitignore                      # Git ignore rules

```

---

## Quick Start

### Prerequisites
- Python 3.11+ (for backend)
- Node.js 16+ (for frontend)
- Git

### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend runs on `http://localhost:8000`
API docs available at `http://localhost:8000/docs`

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend runs on `http://localhost:5173`

---

## API Endpoints

### Training Workflow

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dataset/training/stocks` | GET | List available stocks for training |
| `/api/dataset/training/train` | POST | Train LSTM model on selected stock |
| `/api/health` | GET | Health check |

### POST /api/dataset/training/train

**Request:**
```json
{
  "symbol": "AAPL",
  "epochs": 5,
  "batchSize": 2,
  "windowSize": 60
}
```

**Response:**
```json
{
  "symbol": "AAPL",
  "epochs": 5,
  "batchSize": 2,
  "windowSize": 60,
  "datasetFile": "AAPL_2016-01-01.csv",
  "modelFile": "saved_model_AAPL.keras",
  "message": "Training completed and model saved successfully.",
  "metrics": {
    "mae": 3.9429,
    "rmse": 5.043,
    "mape": 1.7414,
    "r2": 0.9696
  }
}
```

---

## How It Works

```
User selects stock (AAPL/TSLA)
        ↓
Sets training parameters (epochs, batch_size, window_size)
        ↓
Clicks "Train Model" button
        ↓
Frontend displays 7-step progress pipeline
        ↓
Backend LSTM service processes:
├── Load historical CSV data
├── Normalize features with MinMaxScaler
├── Split into 80/20 train/test sets
├── Build sequences with window_size
├── Train Sequential LSTM model (2x 150-unit layers)
├── Evaluate on test set (MAE, RMSE, MAPE, R²)
└── Save model as .keras file
        ↓
Frontend displays training summary with metrics
        ↓
Model ready for future predictions
```

---

## Model Architecture

**Sequential LSTM:**
- Input: Normalized stock price sequences (window_size × 1)
- Layer 1: LSTM (150 units, return_sequences=True)
- Layer 2: LSTM (150 units)
- Output: Dense (1 unit, linear activation)
- Optimizer: Adam
- Loss: Mean Squared Error (MSE)
- Metrics: MAE, MAPE, R²

**Data Processing:**
- MinMaxScaler: Normalize features to [0, 1] range
- 80/20 Split: Training and test validation
- Batch Processing: Configurable batch sizes (1-128)
- Sequence Windows: Customizable time windows (10-365 days)

---

## Training Metrics Explained

| Metric | Full Name | Interpretation |
|--------|-----------|-----------------|
| **MAE** | Mean Absolute Error | Average prediction error in dollars |
| **RMSE** | Root Mean Squared Error | Penalizes larger errors more heavily |
| **MAPE** | Mean Absolute Percentage Error | Percentage error relative to actual values |
| **R²** | Coefficient of Determination | % of variance explained (closer to 1.0 is better) |

---

## Current Status

✅ **Completed**
- Backend ML training service with LSTM models
- FastAPI endpoints for training workflow
- React frontend with parameter controls
- Interactive 7-step progress tracking
- Training summary display with metrics
- CSV data loading (AAPL, TSLA)
- Dark theme support
- Git branch: `feature/train-model-page` (published)

🚀 **Next Steps**
- Merge `feature/train-model-page` into main branch
- Browser-based testing of training UI
- Additional stock data integration
- Prediction endpoints for trained models
- Advanced visualization dashboard

---

## Performance

**Example Training Run (AAPL, 5 epochs, batch_size=2, window_size=60):**
- Training Time: ~2-3 minutes (M1 Mac)
- Model Size: ~3.3 MB (.keras file)
- Final Metrics: MAE=3.94, RMSE=5.04, MAPE=1.74%, R²=0.9696

---

## Environment

- **OS:** macOS
- **Python:** 3.11.8
- **Backend Port:** 8000
- **Frontend Port:** 5173
- **Git Branch:** feature/train-model-page (tracking origin)
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
