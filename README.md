# Predictify

Predictify is a full-stack stock analysis platform for dataset preparation, model training, and backtesting workflows.

It provides:
- Dataset download and tracking from Yahoo Finance
- LSTM model training with progress tracking
- Backtest execution and history management
- A modern React workflow UI (Home, Dataset Preparation, Train Model, Backtest Strategy, Compare Results, Help)

## Tech Stack

### Frontend
- React (Vite)
- JavaScript + CSS
- Workflow-based UI in a single app shell

### Backend
- FastAPI
- PostgreSQL (metadata/history storage)
- yfinance + curl_cffi session workaround for improved provider compatibility/rate-limit behavior
- TensorFlow / Keras for model training

## Current Project Structure

```text
StockPredictify/
|- frontend/
|  |- src/
|  |  |- components/
|  |  |- context/
|  |  |- pages/
|  |  |- services/
|  |  |- styles/
|  |  |- App.jsx
|  |  |- App.css
|  |  |- main.jsx
|  |- package.json
|  |- vite.config.js
|
|- backend/
|  |- app/
|  |  |- main.py
|  |  |- config.py
|  |  |- db_init.py
|  |  |- routers/
|  |  |  |- health.py
|  |  |  |- dataset.py
|  |  |  |- backtest.py
|  |  |- schemas/
|  |  |- services/
|  |     |- dataset.py
|  |     |- lstm.py
|  |     |- backtest.py
|  |     |- backtest_history.py
|  |- data/
|  |- models/
|  |- requirements.txt
|
|- predictify.md
|- README.md
```

## Main Frontend Workflow

Predictify currently runs through `WorkflowPage` and includes:
- Home
- Dataset Preparation
- Train Model
- Backtest Strategy
- Compare Results
- Help

## Backend API Overview

### Health
- `GET /health`

### Dataset Preparation
- `POST /api/dataset/download`
- `GET /api/dataset/tracked`
- `GET /api/dataset/tracked/{symbol}`
- `GET /api/dataset/tracked/{symbol}/preview`
- `DELETE /api/dataset/tracked/{symbol}`

### Training
- `GET /api/dataset/training/stocks`
- `POST /api/dataset/training/train`
- `GET /api/dataset/training/train/{job_id}`
- `GET /api/dataset/training/models`
- `POST /api/dataset/training/models/{model_file}/activate`
- `DELETE /api/dataset/training/models/{model_file}`

### Backtesting
- `POST /api/dataset/backtest`
- `GET /backtests`
- `GET /backtests/{backtest_id}`
- `POST /backtests`
- `DELETE /backtests/{backtest_id}`

## Local Setup

## 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m app.db_init
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs on `http://localhost:8000`.

## 2. Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Frontend runs on `http://localhost:5173`.

## Notes

- This README reflects the current Predictify implementation and naming.
- All previous StockAI naming/content has been replaced with Predictify.
