# Backend (FastAPI)

This backend exposes a dataset download API using yfinance.

## Structure

- app/main.py: FastAPI app and routes
- data/: Downloaded CSV files are saved here
- requirements.txt: Python dependencies

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the API server:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API

### Health Check

- Method: GET
- Path: /health

### Download Dataset

- Method: POST
- Path: /api/dataset/download
- Content-Type: application/json

Request body:

```json
{
	"symbols": ["AAPL", "MSFT", "NVDA"],
	"startDate": "2024-01-01"
}
```

Behavior:

- Downloads historical data for each symbol from the startDate onward.
- Saves one CSV per symbol into backend/data.
- Returns downloaded and failed symbols in the response.
