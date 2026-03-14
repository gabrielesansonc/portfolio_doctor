# Portfolio Web App (FastAPI + JS)

## Structure

- `backend/app/main.py`: FastAPI app + API routes
- `backend/requirements.txt`: backend dependencies
- `frontend/index.html`: sectioned web app layout
- `frontend/app.js`: frontend logic and chart rendering
- `frontend/styles.css`: styles
- `data/`: CSV files used by the API
- `helper.py`: analytics engine

## Run

```bash
cd /Users/gabrielsanson/Desktop/portfolio_dashboard
/usr/local/bin/python3 -m pip install -r backend/requirements.txt
/usr/local/bin/python3 -m uvicorn backend.app.main:app --reload
```

Open: `http://127.0.0.1:8000`

## API

- `GET /api/health`
- `GET /api/defaults`
- `GET /api/csv-files`
- `POST /api/upload-csv`
- `POST /api/analyze`

`POST /api/analyze` body example:

```json
{
  "csv_file": "16d1a7ad-1a4f-5347-b5e5-17ca4bb84564.csv",
  "portfolio_name": "GABES",
  "years": 5,
  "risk_free_rate": 0.037,
  "benchmarks": ["SPY", "QQQ"],
  "scatter_tickers": ["SPY", "QQQ", "VTI", "AAPL", "MSFT", "NVDA", "META", "AMZN", "GOOGL", "VOO"]
}
```
