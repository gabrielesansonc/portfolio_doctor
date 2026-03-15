# Copilot Instructions for Portfolio Dashboard

## Architecture Overview

This is a **FastAPI + vanilla JS** portfolio analysis dashboard with GBM simulation. Key data flow:
1. User uploads Robinhood CSV → `POST /api/upload-csv` → saved to `data/`
2. Analysis request → `POST /api/analyze` → `helper.py` processes trades, fetches prices via yfinance
3. Response contains metrics, value history, holdings → frontend renders ApexCharts
4. GBM simulation → `POST /api/simulate` → projects portfolio value 5 years forward using weighted returns
5. Sample portfolio generation → `POST /api/sample-portfolio/generate` → creates DCA CSV for testing

**Critical files:**
- `helper.py` (root): All financial math - returns, volatility, Sharpe, Sortino, beta, XIRR
- `backend/app/main.py`: FastAPI endpoints, calls helper functions
- `frontend/assets/app.js`: State management, chart rendering, API calls (~1740 lines)
- `frontend/assets/styles.css`: Dark fintech theme with CSS variables (~1700 lines)
- `frontend/index.html`: HTML structure with dual-view support (~700 lines)

**⚠️ File location note**: Frontend files are in `frontend/assets/`, NOT `frontend/` root.

## Developer Workflow

```bash
# Start server (from project root)
cd /Users/gabrielsanson/Desktop/portfolio_dashboard
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000

# Access at http://localhost:8000
```

## Tab Architecture (Critical to Understand)

The app has **4 main tabs**: Upload, Analysis, Simulation, Test Lab. Analysis supports **1 or 2 portfolios** (dual view). This means MOST UI elements exist in triplicate:
- **Portfolio 1**: `metricReturn1`, `valueChart1`, `spinnerValue1`
- **Portfolio 2**: `metricReturn2`, `valueChart2`, `spinnerValue2`  
- **Dual view**: `dualReturn1`, `dualReturn2`, `dualValueChart`, `spinnerDualValue`
- **Simulation**: `simChart`, `simFinalMean`, `simParam*` (single instance per simulation)

**When modifying UI, ALWAYS update all relevant contexts** or the feature will be incomplete.

### Finding Elements Pattern
```bash
# Find all instances of a metric across views
grep -n "metricReturn\|dualReturn" frontend/index.html

# Find JS element references
grep -n "metricReturn" frontend/assets/app.js
```

## Adding New Metrics (Step-by-Step)

### 1. Backend (helper.py)
```python
# Add to AssetMetrics dataclass (~line 17)
@dataclass
class AssetMetrics:
    # ... existing fields
    new_metric: float = 0.0

# Add computation function
def compute_new_metric(daily_returns: pd.Series) -> float:
    # Your calculation
    return result

# Call in compute_metrics_from_price_series() (~line 253)
new_metric = compute_new_metric(daily_returns)

# Include in return statement
return AssetMetrics(
    # ... existing fields
    new_metric=float(new_metric),
)

# ALSO update compute_flow_adjusted_metrics() (~line 300) - same pattern
```

### 2. Frontend HTML (index.html)
Add metric card in THREE places:
```html
<!-- Portfolio 1 section (~line 180) -->
<div class="metric-card">
  <div class="metric-icon cyan"><i class="fas fa-icon-name"></i></div>
  <div class="metric-content">
    <span class="metric-label">New Metric</span>
    <span class="metric-value" id="metricNewMetric1">—</span>
  </div>
</div>

<!-- Portfolio 2 section (~line 320) - SAME structure, id="metricNewMetric2" -->
<!-- Dual view section (~line 480) - ids: dualNewMetric1, dualNewMetric2 -->
```

### 3. Frontend JS (app.js)
```javascript
// Add to el object (~line 90)
metricNewMetric1: document.getElementById('metricNewMetric1'),
metricNewMetric2: document.getElementById('metricNewMetric2'),
dualNewMetric1: document.getElementById('dualNewMetric1'),
dualNewMetric2: document.getElementById('dualNewMetric2'),

// Update renderPortfolioMetrics() (~line 400)
el[`metricNewMetric${num}`].textContent = fmtPct(pm.new_metric); // or fmt2(), fmt3()

// Update renderDualMetrics() (~line 870)
el.dualNewMetric1.textContent = fmtPct(pm1.new_metric);
el.dualNewMetric2.textContent = fmtPct(pm2.new_metric);
```

## Chart Patterns

### Chart Key Mapping
```javascript
// state.charts keys → HTML element IDs
value1 → valueChart1
scatter1 → scatterChart1  
holdings1 → holdingsChart1
dualValue → dualValueChart
// etc.
```

### Chart Lifecycle
```javascript
// ALWAYS destroy before re-creating
if (state.charts[chartKey]) state.charts[chartKey].destroy();
state.charts[chartKey] = new ApexCharts(container, options);
state.charts[chartKey].render();
```

### Spinner IDs for Charts
```
spinnerValue1, spinnerHoldings1, spinnerScatter1
spinnerValue2, spinnerHoldings2, spinnerScatter2
spinnerDualValue, spinnerDualHoldings, spinnerDualScatter
spinnerSim (simulation chart)
```

## GBM Simulation Features

### Backend Implementation (`backend/app/main.py`)
- `POST /api/simulate`: Takes portfolio data and runs geometric Brownian motion simulation
- Uses weighted portfolio returns to estimate μ (drift) and σ (volatility)
- Formula: `S_{t+1} = S_t * exp(μ - ½σ² + σ*Z)` where Z ~ N(0,1)
- Defaults: 300 simulations, 5 years forward, 252 trading days/year
- Returns simulation paths, final values summary (mean, median, 5th/95th percentiles)

### Sample Portfolio Generation
- `POST /api/sample-portfolio/generate`: Creates DCA CSV for testing
- Monthly investments, configurable years (default 2)
- `SAMPLE_PORTFOLIO_ALLOCATION`: VOO, QQQ, SLV, GLD, CVNA, META
- `SAMPLE_MONTHLY_INVESTMENT = 300.0`
- Bulk price downloads for speed optimization
- Cross-platform date formatting: `f"{month}/{day}/{year}"`

### Frontend Simulation Tab
- GBM Parameters card shows μ, σ, formula explanation
- Projected Values grid: Mean/95th/Best and Median/5th/Worst layout
- Custom ApexCharts tooltip with value formatting
- Per-portfolio sample buttons: `generateSampleForPortfolio(portfolioNum)`

## CSS Patterns

### Color Variables (use these, don't hardcode)
```css
--accent-blue: #3b82f6;
--accent-green: #10b981;
--accent-red: #ef4444;
--accent-cyan: #06b6d4;
--accent-purple: #8b5cf6;
--bg-card: #1a1d24;
--bg-primary: #0f1117;
--text-primary: #f1f5f9;
--text-muted: #64748b;
```

### Icon Color Classes
```html
<div class="metric-icon green">  <!-- green, red, blue, orange, purple, cyan -->
```

### Positioning for Overlays
Cards need `position: relative` for absolute-positioned children (spinners, overlays).

## Financial Calculations Reference

All annualization uses `TRADING_DAYS_PER_YEAR = 252`:
- **Annual Return**: `(1 + mean_daily)^252 - 1`
- **Annual Volatility**: `daily_std * sqrt(252)`
- **Sharpe**: `(annual_return - risk_free) / annual_volatility`
- **Sortino**: `(annual_return - risk_free) / downside_deviation` (only negative returns)
- **Beta**: `cov(asset, SPY) / var(SPY)`
- **Max Drawdown**: `min((price - running_max) / running_max)` (returns negative)
- **VaR 95%**: `monthly_vol * 1.645`
- **XIRR**: Bisection method on NPV=0 for irregular cash flows

### GBM Simulation Parameters
- **Drift (μ)**: Estimated from weighted portfolio returns annualized
- **Volatility (σ)**: Portfolio volatility from weighted holdings
- **Formula**: `S_{t+1} = S_t * exp(μ - ½σ² + σ*Z)` where Z ~ N(0,1)
- **Time steps**: Daily (252 per year), 5 years = 1260 steps
- **Simulation count**: Default 300 runs for statistical validity

## Key Conventions

- **Ticker normalization**: Always `.upper().strip()` before use
- **Date handling**: Use timezone-naive dates via `_as_naive_daily_index()`
- **API responses**: Use `_frame_to_records()` to convert DataFrames to JSON
- **Formatting functions**: `fmtPct()` for percentages, `fmt2()`/`fmt3()` for decimals

## Common Pitfalls & Solutions

| Issue | Solution |
|-------|----------|
| Element is null | Check ID matches between HTML and `el` object |
| Chart not updating | Verify `state.charts[key]` matches HTML ID pattern |
| Metric shows in single but not dual view | Update `renderDualMetrics()` too |
| Spinner not showing | Check spinner ID exists in HTML, CSS has `.active` style |
| Dates misaligned in dual chart | Use Map + forward-fill pattern (see `renderDualValueChart`) |
| CSS overlay not positioning | Add `position: relative` to parent |
| Sample generation slow | Use bulk yfinance downloads, not per-date API calls |
| GBM produces extreme values | Ensure using weighted portfolio returns, not raw values |
| Cross-platform date issues | Use `f"{month}/{day}/{year}"` not strftime |

## Debugging Commands

```bash
# Find where an element is defined
grep -rn "id=\"elementName\"" frontend/

# Find where an element is used in JS
grep -n "elementName" frontend/assets/app.js

# Find a function definition
grep -n "function functionName" frontend/assets/app.js

# Check backend dataclass fields
grep -A 20 "class AssetMetrics" helper.py
```

## API Response Structure

`POST /api/analyze` returns:
```javascript
{
  portfolio_summary: { ticker, annual_return, annual_volatility, sharpe_ratio, ... },
  benchmark_metrics: [{ ticker, annual_return, ... }, ...],
  scatter_metrics: [{ ticker, annual_return, annual_volatility, ... }, ...],
  value_history: [{ date, "PORTFOLIO_NAME": value, "SPY": value, ... }, ...],
  holdings_weights: [{ ticker, weight, shares, market_value }, ...],
  trades_count: number
}
```

`POST /api/simulate` returns:
```javascript
{
  simulation_paths: [[run1_values...], [run2_values...], ...],
  final_values: { mean, median, min, max, percentile_5, percentile_95 },
  parameters: { drift, volatility, years, simulations, time_steps }
}
```

`POST /api/sample-portfolio/generate` returns:
```javascript
{
  filename: "sample_portfolio_dca.csv",
  total_trades: number,
  date_range: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" },
  total_invested: number
}
```

## Test Lab Feature

Separate tab that simulates adding $X to 50+ ETFs:
- Endpoint: `POST /api/testlab/simulate`
- Custom ticker test: `POST /api/testlab/test-ticker`
- Results show impact on Sharpe, Sortino, volatility
- UI in `index.html` under `#tab-testlab`
- Fixed frontend/backend property mismatch: use `all_results` not `results`
