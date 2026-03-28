# Claude Instructions — Portfolio Doctor (NotFinancialAdvice)

## What This App Is

**Portfolio Doctor** is a web app for everyday investors — not financial professionals. The target user uploads a Robinhood CSV and gets plain-English, intuitive analysis of their portfolio performance. Every metric should feel approachable and self-explanatory.

App name displayed to users: **NotFinancialAdvice**
Production URL: `https://portfolio-doctor.onrender.com`
GitHub remote: `https://github.com/gabrielesansonc/portfolio_doctor.git`

---

## Stack

- **Backend**: FastAPI (`backend/app/main.py`)
- **Financial engine**: `helper.py` (core analytics, MPT metrics, XIRR, GBM simulation)
- **Frontend**: Vanilla HTML/CSS/JS — no React, no framework
  - `frontend/index.html` — page structure, overlays, nav, modal markup
  - `frontend/assets/app.js` — state, API calls, chart creation, tab switching, background preloading
  - `frontend/assets/styles.css` — layout, theme, mobile/iPad fixes
- **Charts**: ApexCharts (CDN)
- **Data source**: `yfinance` for market prices

The active frontend is served from `frontend/`, not `public/`.

---

## Local Development

```bash
cd /Users/gabrielsanson/Desktop/portfolio_dashboard
source venv/bin/activate
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
# Open: http://localhost:8000
```

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/defaults` | Default config |
| GET | `/api/csv-files` | List uploaded CSVs |
| POST | `/api/upload-csv` | Upload Robinhood CSV |
| POST | `/api/analyze` | Full portfolio analysis |
| POST | `/api/simulate` | GBM future simulation |
| POST | `/api/testlab/simulate` | ETF comparison (Test Lab) |
| POST | `/api/sample-portfolio/generate` | Generate a sample CSV |

---

## Runtime Data Flow

1. User completes a 2-step onboarding overlay (why it works → upload CSV)
2. `POST /api/upload-csv` saves the file
3. `POST /api/analyze` returns: summary, metrics table, scatter metrics, holdings weights, value history
4. Dashboard renders charts and metric cards
5. Simulation and Test Lab preload in the background after main analysis

---

## Frontend API URL Detection

```javascript
const API_BASE_URL = (() => {
  if (hostname.includes('vercel.app')) return 'https://portfolio-doctor.onrender.com';
  if (hostname.includes('onrender.com')) return '';
  return 'http://localhost:8000';
})();
```

---

## Key Financial Rules

### Robinhood CSV Parsing
- CSVs may have footer/disclaimer lines — parsing must be tolerant of malformed rows
- Do not assume a clean CSV

### Newer Stock Handling (critical)
- Do **not** intersect all holdings' price histories
- Use a stable market calendar; reindex holdings to it with forward-fill
- A newer ticker (e.g. `RVI`) should contribute only from its first available price date
- Missing pre-listing history must never collapse the entire portfolio history

### Benchmarks
- Benchmarks simulate investing portfolio cash flows into benchmark tickers
- In dual-portfolio view: benchmarks are based on Portfolio 1 cash flows
- Dual performance chart shows: Portfolio 1 line, Portfolio 2 line, benchmark lines (P1 flows)

### Risk-Return / Scatter
- The portfolio point in scatter must use the same corrected metrics as the rest of the dashboard
- Do not compute the portfolio point from a separate, stale logic path

---

## Changing Backend Metrics

When adding a new metric, update both paths in `helper.py`:
- `compute_metrics_from_price_series(...)`
- `compute_flow_adjusted_metrics(...)`

Then thread it through:
1. `backend/app/main.py`
2. `frontend/index.html`
3. `frontend/assets/app.js`

---

## Updating Dashboard UI

When changing a metric card or chart:
1. Update HTML IDs in `index.html`
2. Update `el` references in `app.js`
3. Update single-portfolio rendering
4. Update dual-portfolio rendering
5. Update loading states
6. Check mobile layout

Most dashboard UI exists in three contexts: **Portfolio 1**, **Portfolio 2**, **Dual view**. Update all three.

---

## Chart Rules

- Always destroy the existing ApexCharts instance before recreating
- Mobile: reduced density, reduced height, simplified labels/toolbars
- Performance chart x-axis: `YYYY-MM` format
- Verify both desktop and mobile, both single and dual portfolio, no Simulation/Test Lab regressions

---

## Mobile / iPad UX Rules

The app is tuned for iPhone and iPad. Preserve:
- Desktop: left sidebar navigation
- Mobile/tablet: bottom navigation bar
- Respect iPhone safe areas
- Avoid `vh` bugs on iOS Safari — use safer viewport sizing
- Input font sizes large enough to prevent iOS zoom-on-focus
- Touch targets large enough for mobile
- No hover-only UX for important information

Test matrix: iPhone Safari, iPhone Chrome, iPad Safari portrait, iPad Safari landscape.

---

## Loading & Navigation UX

- After upload + start analysis: scroll user to dashboard top
- Show clear progress states during first analysis
- Background-preload Simulation and Test Lab after main analysis
- Cache results for Simulation/Test Lab when inputs haven't changed
- Never leave users on wrong scroll position after onboarding or modals

---

## Tone & Copy Guidelines

This app is for **non-financial-savvy users**. When writing UI copy, tooltips, labels, or explanations:
- Use plain English, not jargon
- Explain what metrics mean in practical terms ("how bumpy was the ride?")
- Every number shown should feel like it teaches the user something
- Avoid terms like "alpha", "beta", "MPT" without explanation

---

## Deployment

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

Render and Vercel auto-deploy on push to `main`.

---

## Warnings & Pitfalls

- `helper.py` is the core financial engine — be careful with time series alignment
- Bugs with new/recently-listed tickers are almost always time-series/calendar issues
- If a chart looks wrong but the summary is correct, check if that chart uses a separate metric path
- `public/` is NOT the active frontend — always edit `frontend/`
- Improving mobile must not break desktop behavior
