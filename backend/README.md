# Backend (FastAPI)

This backend exposes dataset APIs using yfinance and tracks all downloaded symbol data in PostgreSQL.

## Structure

- app/main.py: FastAPI app and routes
- app/db_init.py: One-command PostgreSQL table initializer
- data/: Downloaded CSV files are saved here
- requirements.txt: Python dependencies

## Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Configure PostgreSQL connection:

```bash
cp .env.example .env
```

Then update `DATABASE_URL` in `.env`.

4. Initialize the database table (one command):

```bash
python -m app.db_init
```

5. Run the API server:

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
- Tracks each successful download in PostgreSQL table `stock_dataset_downloads`.
- Returns downloaded and failed symbols in the response.

### List Tracked Symbols

- Method: GET
- Path: /api/dataset/tracked

### View Tracked Symbol Data

- Method: GET
- Path: /api/dataset/tracked/{symbol}

### Delete Tracked Symbol Data

- Method: DELETE
- Path: /api/dataset/tracked/{symbol}
