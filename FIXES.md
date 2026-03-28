# Portfolio Doctor — Fix List

Severity: 🔴 Critical · 🟠 High · 🟡 Medium · 🔵 Low
Status: ✅ Done · 🔲 Pending

---

## Part 1 — Financial / Math

---

### ✅ 🔴 FIX-01 · Annual Return Uses Arithmetic Mean (Upward-Biased)

**File:** `helper.py` · **Fixed in:** `compute_metrics_from_price_series`

**What we had:**
```python
mean_daily_return = float(daily_returns.mean())
annual_return = (1 + mean_daily_return) ** TRADING_DAYS_PER_YEAR - 1
```
We took the average of all daily returns and compounded it 252 times.

**Why it was wrong:**

Imagine a stock that goes up 50% one day and down 50% the next. The arithmetic average daily return is `(+50% + -50%) / 2 = 0%`, implying the stock went nowhere. But the actual result is `$100 → $150 → $75` — the investor lost 25%. Compounding the arithmetic mean always overstates what actually happened because of Jensen's inequality: averaging before compounding inflates the result compared to compounding before averaging. For a volatile portfolio, this can overstate annualized returns by 1–3 percentage points, every year, on every metric card the user sees.

**What it is now:**
```python
n_periods = len(prices) - 1   # intervals, not observation count
annual_return = float((prices.iloc[-1] / prices.iloc[0]) ** (TRADING_DAYS_PER_YEAR / n_periods) - 1)
```

**Audit findings applied on top of this fix:**
- `len(prices)` → `len(prices) - 1`: 3 price observations = 2 intervals. Using the count of observations overstated the denominator by 1, slightly understating the annualized return. Error is ~0.08% on a 5-year series but the formula was technically wrong regardless.
- Added guard: raises `ValueError` if `prices.iloc[0] <= 0` (prevents silent `ZeroDivisionError` from bad data) and if `len(prices) < 2` (prevents meaningless single-point series).

---

### ✅ 🔴 FIX-02 · GBM Simulation Uses a Fixed Seed — Not Actually Stochastic

**File:** `main.py` · **Fixed in:** `run_gbm_simulation`

**What we had:**
```python
np.random.seed(42)  # For reproducibility
simulations = []
for _ in range(req.num_simulations):
    ...
    z = np.random.standard_normal()
```
Every request set the seed to 42 and drew from NumPy's shared global RNG.

**Why it was wrong:**

Monte Carlo simulation works by running thousands of random paths so you can observe the distribution of outcomes. With a fixed seed, the random number generator always produces the exact same sequence of numbers. Run it today, run it tomorrow, run it on a different computer — every user gets the exact same 300 paths in the exact same order. The fan chart on screen never changes. The min, max, percentile 5, and percentile 95 are permanently frozen. This is not a simulation; it is a static computation dressed up to look like one.

Additionally, `np.random.standard_normal()` draws from NumPy's global RNG state, which is shared across all threads. FastAPI runs sync handlers in a thread pool, so two concurrent simulation requests could corrupt each other's random draws.

**What it is now:**
```python
# Per-request RNG: thread-safe, statistically superior (PCG64 vs Mersenne Twister),
# and genuinely random on every run.
rng = np.random.default_rng()
simulations = []
for _ in range(req.num_simulations):
    ...
    z = rng.standard_normal()
```

---

### ✅ 🔴 FIX-03 · Displayed `mu_annual` Does Not Match the Actual GBM Drift

**File:** `main.py` · **Fixed in:** `run_gbm_simulation`

**What we had:**
```python
mu_annual = mu_daily * req.trading_days_per_year   # displayed to user

# But the simulation loop used:
price = price * np.exp((mu_daily - 0.5 * sigma_daily**2) + sigma_daily * z)
```
The headline "Expected Annual Return" and the simulation paths were computing different things.

**Why it was wrong:**

In Geometric Brownian Motion, the drift parameter in the exponent must include an Itô correction: `mu - 0.5 * sigma²`. This correction accounts for the mathematical reality that compounded growth is always lower than the simple average gain implies. The simulation loop was already applying this correctly. But `mu_annual` shown in the panel was just `mu_daily * 252` — no correction. For a portfolio with 40% annual volatility, the gap is `0.5 × 0.40² = 8 percentage points`. The panel could say "Expected Return: 22%" while the chart paths averaged 14%.

**What it is now:**
```python
# Ito-corrected drift: this is what the simulation paths actually compound at.
# The 0.5*sigma^2 term converts arithmetic log-drift to geometric (real-world) growth.
geometric_drift_annual = (mu_daily - 0.5 * sigma_daily**2) * req.trading_days_per_year
# Returned to frontend as "mu_annual" — display value now matches the chart.
```

**Note:** `std_path` (computed but never used in the response) was left in place by the original code. Flagged by Pylance — see FIX-26.

---

### 🟠 FIX-04 · VaR Uses Gaussian Assumption and Unlabeled Monthly Timeframe

**File:** `helper.py:238–253`

**What we do now:**
```python
daily_vol = float(daily_returns.std(ddof=1))
monthly_vol = daily_vol * np.sqrt(21)
var_95 = monthly_vol * 1.645
return float(var_95)
```
Then this value is shown in the dashboard metric card labeled "VaR 95%".

**Why it's wrong:**

Two separate problems:

1. **The Gaussian assumption.** Real stock returns have fat tails — extreme events happen far more often than a normal distribution predicts. Using `1.645 standard deviations` for the 95th percentile only works if returns are perfectly normally distributed. They are not. The 2008 crash, COVID crash, and flash crashes were all events that parametric VaR said were nearly impossible. A historical VaR — which uses the actual 5th-worst percentile of observed daily returns — would be both more accurate and more honest.

2. **The timeframe is unlabeled and inconsistent.** Every other metric on the dashboard is annualized. VaR is computed on a monthly basis (`sqrt(21)`) but is displayed in the same row as Annual Return and Annual Volatility without any indication it covers a different period. A user reading the cards sees "Annual Return: 18%, Annual Volatility: 22%, VaR 95%: 9%" and naturally assumes all three are on the same timescale. They are not. The VaR number is a monthly figure in an annualized-looking context.

**What it should be:**
```python
# Historical VaR at 95% confidence — no distribution assumption
var_95 = abs(float(np.percentile(daily_returns, 5)))
# And label it clearly as daily or annualize it consistently
```

---

### 🟠 FIX-05 · Downside Deviation Filters `< 0` Instead of Below MAR

**File:** `helper.py:180–183`

**What we do now:**
```python
def compute_downside_deviation(daily_returns: pd.Series) -> float:
    downside_returns = daily_returns[daily_returns < 0]
    downside_std = float(downside_returns.std(ddof=1))
    return downside_std * np.sqrt(TRADING_DAYS_PER_YEAR)
```
Only days with negative returns are counted as "downside."

**Why it's wrong:**

The Sortino ratio was designed to measure risk relative to a Minimum Acceptable Return (MAR), usually the risk-free rate. A day that returns `+0.001%` when the risk-free rate is `+0.015%/day` is a bad day — the investor underperformed a riskless alternative. The current code treats that day as irrelevant because it wasn't negative. Conversely, if the risk-free rate is zero, the filter and the correct formula are equivalent, but only by coincidence. In a `3.7%` risk-free rate environment (which is what this app defaults to), the divergence is non-trivial.

Additionally, the MAR should be subtracted from each downside return before squaring, not just used as a threshold. The current code computes the standard deviation of negative returns, not the root-mean-squared deviation below MAR — these are different formulas.

**What it should be:**
```python
def compute_downside_deviation(daily_returns: pd.Series, mar_daily: float = 0.0) -> float:
    below_mar = daily_returns[daily_returns < mar_daily] - mar_daily
    if len(below_mar) == 0:
        return 0.0
    downside_std = float(np.sqrt((below_mar**2).mean()))
    return downside_std * np.sqrt(TRADING_DAYS_PER_YEAR)
```

---

### ✅ FIX-06 · Synthetic Index Off-By-One Base + Metric Mismatch Disclosure

**File:** `main.py:419` (both `testlab_simulate` and `testlab_test_ticker`)

#### 6a · Synthetic index construction bug (✅ Fixed)

**Before:**
```python
synthetic_index = (1.0 + portfolio_returns).cumprod()
```
`cumprod()` starts at `1 + r_1` (the first day's return), not 1.0. If the first day is a -0.7% down day, `prices.iloc[0] = 0.993` and `compute_metrics_from_price_series` divides by 0.993 instead of 1.0, inflating the annualized return.

**After:**
```python
base = pd.Series([1.0], index=[prices_df.index[0]])
synthetic_index = pd.concat([base, (1.0 + portfolio_returns).cumprod()])
```
The series now starts at exactly 1.0, so the geometric return formula uses the correct base.

#### 6b · Dashboard vs Test Lab metric mismatch (🔲 UX disclosure pending)

Main dashboard (`/api/analyze`) uses money-weighted XIRR (rewards good timing). Test Lab uses time-weighted return on today's static weights. These answer different questions — see the ⓘ icon added to the UI. The discrepancy is expected and intentional, but the UI should make the distinction clearer.

---

### 🟠 FIX-07 · GBM Simulation Collapses History for New Holdings

**File:** `main.py:873–884`

**What we do now:**
```python
common_index = None
for prices in price_data.values():
    if common_index is None:
        common_index = prices.index
    else:
        common_index = common_index.intersection(prices.index)
```
We take the intersection of all holdings' price histories.

**Why it's wrong:**

This is the exact same bug that was already fixed in the main portfolio analysis path (it's even documented in CLAUDE.md). If any holding in the portfolio went public 6 months ago, the common index collapses to 6 months. The GBM `mu` and `sigma` are then estimated from only 6 months of data — not 5 years. Six months of data during a specific market environment (e.g., post-election rally) will produce wildly different parameters than 5 years of data spanning multiple market cycles. The simulation will look completely different depending on what new stocks the user happens to hold, for reasons having nothing to do with their portfolio's actual long-term behavior. The fix is the same as in the main analysis: use SPY or another broad index as the date calendar and forward-fill missing history.

---

### 🟡 FIX-08 · `period_years` Is Overwritten with the Requested Value

**File:** `helper.py:406, 431`

**What we do now:**
```python
def compute_asset_metrics_as_of(ticker, *, years, ...):
    prices = fetch_close_prices_between(ticker, start=start, end=end)
    metrics = compute_metrics_from_price_series(prices, ...)
    metrics.period_years = years   # overwrites whatever was computed
    return metrics
```
The compute function derives `period_years` from the actual span of price data. Then the calling function overwrites it with what the user asked for.

**Why it's wrong:**

If the user requests 5 years of analysis but a stock was only listed 2 years ago, the compute function correctly sets `period_years = 2`. Then this line sets it back to 5. The benchmark comparison table now shows that this ticker has a 5-year track record when it only has 2. A user comparing their portfolio to a recently-listed ETF or stock would see the wrong period label, and any annualized metrics will appear to cover a longer horizon than the data actually supports.

---

### 🟡 FIX-09 · Stock Splits Can Inject Spurious Cash Flows into XIRR

**File:** `helper.py:749–754`

**What we do now:**
```python
out["cash_flow"] = np.where(
    is_buy | is_split,
    out["trade_amount"] + out["fees"],   # splits treated like buys with trade_amount
    -(out["trade_amount"] - out["fees"]),
)
```
Split rows go through the same cash flow calculation as buys, using `trade_amount = quantity * average_price`.

**Why it's wrong:**

A 2-for-1 stock split gives you double the shares at half the price. No money moved. The investor paid nothing and received nothing — only the number of shares changed. In Robinhood CSVs, split rows sometimes have a non-zero price (the pre-split share price) and a non-zero quantity. The formula then computes `trade_amount = quantity * price`, producing a large positive cash flow that never actually existed. This phantom inflow makes the XIRR calculation think the investor received money they didn't, artificially inflating the money-weighted return. The fix is to force `cash_flow = 0` specifically for split rows, regardless of whatever price or amount appears in those columns.

---

## Part 2 — Backend / API

---

### ✅ 🔴 FIX-10 · Sequential Per-Ticker Downloads Blocking the Event Loop

**File:** `helper.py` · **Fixed in:** `analyze_robinhood_portfolio`

**What we had:**
```python
prices: dict[str, pd.Series] = {}
for ticker in all_tickers:
    prices[ticker] = fetch_close_prices_between(ticker, ...)  # one HTTP call per ticker
```
18 tickers = 18 sequential HTTP calls = 10–30 seconds of wall time.

**Why it was wrong:**

Each `yf.download()` call inside the loop opened a separate HTTP connection to Yahoo Finance and waited for a response before starting the next. For a portfolio with 15 holdings + 2 benchmarks + SPY, that is 18 sequential round-trips. FastAPI offloads sync handlers to a thread pool, so the thread was blocked doing nothing but waiting for the network the entire time. On Render's free tier, this meant the entire server was occupied for up to 30 seconds while one analysis ran.

**What it is now:**
```python
bulk = yf.download(
    all_tickers,
    start=..., end=...,
    auto_adjust=True, group_by="ticker", threads=True,
)
# Results split back into per-ticker Series with MultiIndex-aware extraction
```
One HTTP round-trip for all tickers. Estimated reduction: 10–30 s → 2–4 s for analysis.

**Caveats addressed during review:**
- Wrapped the `yf.download` call in `try/except` — a complete Yahoo Finance outage now returns a readable `ValueError` instead of a raw crash.
- Filtered `symbols` and `benchmarks` against `prices.keys()` before constructing `asset_prices` and `value_history` — delisted tickers, IPOs with no history, or per-ticker partial failures no longer cause a `KeyError` crash. Missing holdings are silently excluded from the portfolio calculation.

---

### ✅ 🔴 FIX-11 · `/api/simulate` Bypasses `_resolve_csv_path()`

**File:** `main.py` · **Fixed in:** `run_gbm_simulation`

**What we had:**
```python
csv_path = DATA_DIR / req.csv_file   # hardcoded — only works if file is in DATA_DIR
if not csv_path.exists():
    raise HTTPException(status_code=404, ...)
```

**Why it was wrong:**

Every other endpoint uses `_resolve_csv_path()`, which tries the path as absolute, then under `data/`, then under the repo root. The simulate endpoint hardcoded `DATA_DIR / req.csv_file`, so any CSV reference that worked in `/api/analyze` would silently 404 in `/api/simulate`. Users who ran analysis successfully and then switched to the Simulation tab would hit a mysterious failure with no indication of why.

**What it is now:**
```python
try:
    csv_path = _resolve_csv_path(req.csv_file)
except FileNotFoundError as exc:
    raise HTTPException(status_code=404, detail=str(exc)) from exc
```
Identical resolution logic to all other endpoints. The 404 message is also now the structured string from `_resolve_csv_path` rather than a bare filename, giving users a clearer error.

---

### 🟠 FIX-12 · SPY Is Fetched Twice on Every Analyze Request

**File:** `main.py:193–195` and `helper.py:824–826`

**What we do now:**

In `main.py`:
```python
spy_prices = fetch_close_prices_between("SPY", start=analysis_start, end=analysis_end)
market_returns = daily_returns_from_prices(spy_prices)
```

Then inside `analyze_robinhood_portfolio()` in `helper.py`:
```python
if "SPY" not in all_tickers:
    all_tickers.append("SPY")
# ... then later:
spy_prices = prices.get("SPY")
market_returns = daily_returns_from_prices(spy_prices)
```

**Why it's wrong:**

SPY is downloaded twice on every single `/api/analyze` call — once inside the helper and once in the API layer. These two downloads may also use different date ranges (the API layer uses `analysis_end - years` while the helper uses `historical_start - 5 days`), meaning they aren't even fetching the same data. Besides the wasted network call (~1 second), the market returns used for beta in the scatter chart and the market returns used for beta inside the portfolio metrics come from different SPY series, which can produce inconsistent beta values across the dashboard.

---

### 🟠 FIX-13 · No File Size or Content Validation on CSV Upload

**File:** `main.py:108–123`

**What we do now:**
```python
@app.post("/api/upload-csv")
def upload_csv(file: UploadFile = File(...)):
    filename = _safe_filename(file.filename or "uploaded.csv")
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv uploads are supported.")
    destination = DATA_DIR / filename
    with destination.open("wb") as f:
        shutil.copyfileobj(file.file, f)  # writes entire file with no size check
```

**Why it's wrong:**

The only check is that the filename ends in `.csv`. A user could upload a 500MB file, a renamed image, a renamed executable, or a valid CSV with 10 million rows — all of which would be silently written to disk. On Render's free tier with an ephemeral filesystem, a large upload fills the disk and breaks the service for all users. At minimum, add a size limit before writing:

```python
MAX_CSV_BYTES = 10 * 1024 * 1024  # 10MB
contents = await file.read(MAX_CSV_BYTES + 1)
if len(contents) > MAX_CSV_BYTES:
    raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
```

---

### 🟠 FIX-14 · ~50 Lines of Test Lab Logic Duplicated Across Two Endpoints

**File:** `main.py:378–425` and `main.py:546–585`

**What we do now:**

`testlab_simulate` (lines 378–425):
```python
trades = load_robinhood_orders_csv(csv_path)
active_trades = trades[trades["date"] <= end].copy()
final_shares = active_trades.groupby("symbol")["signed_quantity"].sum()
final_shares = final_shares[final_shares > 0]
# ... fetch prices, build market_values, compute weights, build synthetic_index ...
baseline = compute_metrics_from_price_series(synthetic_index, ...)
```

`testlab_test_ticker` (lines 546–585):
```python
trades = load_robinhood_orders_csv(csv_path)
active_trades = trades[trades["date"] <= end].copy()
final_shares = active_trades.groupby("symbol")["signed_quantity"].sum()
final_shares = final_shares[final_shares > 0]
# ... identical fetch prices, build market_values, compute weights, build synthetic_index ...
baseline = compute_metrics_from_price_series(synthetic_index, ...)
```

**Why it's wrong:**

This block of code is copy-pasted verbatim. It has already drifted: the threshold for accepting an ETF's price history is `0.8` (80% of trading days required) in the main simulation and `0.5` (50%) in the custom ticker test. If a bug is found in this shared logic — say the weight calculation is wrong — it must be found and fixed in both places independently. This is how silent inconsistencies accumulate. Extract a shared helper:

```python
def _compute_portfolio_baseline(csv_path, years, risk_free_rate, end):
    """Load trades, compute current holdings, return (prices_df, weights, baseline_metrics)."""
    ...
```

---

### 🟡 FIX-15 · CORS Wildcard Allows Any Vercel Deployment to Call the API

**File:** `main.py:69`

**What we do now:**
```python
allow_origins=[
    "http://localhost:3000",
    "http://localhost:8000",
    "https://*.vercel.app",     # any Vercel app on the internet
    "https://*.onrender.com",
]
```

**Why it's wrong:**

`https://*.vercel.app` matches any application deployed on Vercel, not just yours. Anyone who discovers the Render API URL can build their own frontend on Vercel and make cross-origin requests to your backend as if they were a trusted origin. While the API doesn't have authentication and the data it processes is user-uploaded, this still exposes the backend to unintended use, potential abuse of the free-tier resources, and makes it harder to add access controls later. Once your Vercel domain is stable, lock it down:

```python
"https://your-specific-app.vercel.app"
```

---

### 🟡 FIX-16 · yfinance Multi-Ticker Column Access Is Fragile Across Versions

**File:** `main.py:722–728`

**What we do now:**
```python
if len(tickers) == 1:
    close_series = all_data["Close"].dropna()
else:
    close_series = all_data[ticker]["Close"].dropna()
```

**Why it's wrong:**

yfinance changed its multi-ticker download column structure between versions. In older versions, multi-ticker downloads return a flat MultiIndex with `(field, ticker)`. In newer versions with `group_by='ticker'`, it returns `(ticker, field)`. The code assumes a specific structure without checking what it actually received. If yfinance changes its API again (it has, multiple times), this silently skips all tickers and falls through to the `if not ticker_prices` error. The fix is to normalize the column structure immediately after download rather than assuming a layout.

---

## Part 3 — Frontend

---

### 🟠 FIX-17 · `renderTable` Is an XSS Vulnerability

**File:** `app.js:797–819`

**What we do now:**
```javascript
const formatted = col.format ? col.format(val, row) : val;
return `<td class="${cls}">${formatted}</td>`;  // injected directly into innerHTML
```
Format functions return strings, and those strings are embedded in HTML with no escaping.

**Why it's wrong:**

Any string that flows from the API into a table cell — ticker names, portfolio names, benchmark labels — could contain HTML. A user whose Robinhood CSV had a ticker like `<img src=x onerror=alert(1)>` in an instrument name field would trigger script execution when that ticker appears in the benchmark or scatter table. This is a stored XSS path: user-controlled CSV data → API → JSON response → `format()` → `innerHTML`. The fix is to escape user-controlled values before inserting them into HTML, or use `textContent` for cells that don't need HTML formatting.

---

### 🟠 FIX-18 · Simulation and Test Lab Preload Sequentially — Not in Parallel

**File:** `app.js:508–530`

**What we do now:**
```javascript
const warmPortfolio = async (portfolioNum) => {
    await fetchSimulationData(portfolioNum);   // waits up to 15 seconds
    await fetchTestLabData(portfolioNum);      // only starts after simulation finishes
};
```

**Why it's wrong:**

These two fetches are completely independent. Neither depends on the other's result. By `await`-ing the first before starting the second, the total background preload time is the sum of both durations rather than the maximum. Simulation takes 5–15 seconds. Test Lab (which fetches 50 ETFs) takes 20–50 seconds. Sequential: 60+ seconds total. Parallel: 50 seconds total. On a slow connection or cold Render instance, the user will navigate to Test Lab and still see "Preparing in background..." 60 seconds after their analysis completed, when they would have seen results in 50 seconds if these ran together.

**What it should be:**
```javascript
const warmPortfolio = async (portfolioNum) => {
    await Promise.allSettled([
        fetchSimulationData(portfolioNum),
        fetchTestLabData(portfolioNum),
    ]);
};
```

---

### 🟠 FIX-19 · No Duplicate-Request Guard on Run Analysis

**File:** `app.js` — `runAnalysis()` function

**What we do now:**
```javascript
async function runAnalysis() {
    // No check for in-flight request
    const response = await fetch(`${API_BASE_URL}/api/analyze`, { ... });
    const data = await response.json();
    state.portfolio1.data = data;  // writes to state regardless
    renderDashboard(data);
}
```
Each call to `runAnalysis()` fires a new request unconditionally.

**Why it's wrong:**

If a user clicks Run Analysis and the request takes 20 seconds, they might click it again thinking something went wrong. Two parallel requests are now in flight. Whichever response arrives last will overwrite `state.portfolio1.data` and re-render the dashboard, potentially with stale or different parameters (if the user changed the year selector between clicks). The first response to arrive renders briefly then gets replaced by the second. On slow connections this can produce flickering, half-rendered states, or charts being destroyed and recreated mid-render.

The fix is a simple in-flight flag:
```javascript
if (state.analysisInFlight) return;
state.analysisInFlight = true;
try { ... } finally { state.analysisInFlight = false; }
```

---

### 🟡 FIX-20 · Benchmarks Render as `$0` for Dates Before First Cash Flow

**File:** `app.js:864`

**What we do now:**
```javascript
benchmarks.forEach((bench) => {
    const benchData = data.value_history.map((pt) => parseFloat((pt[bench] || 0).toFixed(2)));
    series.push({ name: bench, data: benchData });
});
```
If `pt[bench]` is missing or falsy, it falls back to `0`.

**Why it's wrong:**

The backend only generates benchmark values starting from the first actual cash flow date. Dates before that have no benchmark entry in the JSON. The frontend maps missing values to `$0`. On the performance chart, benchmarks appear to start at zero and then suddenly jump to their first real value. This looks like the benchmark had a massive overnight gain — which is visually alarming and factually wrong. The benchmark didn't start at zero; it simply wasn't invested yet. The chart should start each series at its first non-null value rather than padding missing entries with zero.

---

### 🟡 FIX-21 · Tab Switch Resizes All Charts Including Hidden Ones

**File:** `app.js:608–614`

**What we do now:**
```javascript
if (tabName === 'dashboard') {
    setTimeout(() => {
        Object.values(state.charts).forEach((chart) => {
            if (chart) chart.resize();   // resizes all 11 chart instances
        });
    }, 100);
}
```
Every tab switch to the dashboard triggers a resize on every chart that exists, regardless of visibility.

**Why it's wrong:**

The `state.charts` object holds up to 11 chart instances: value1, scatter1, holdings1, value2, scatter2, holdings2, dualValue, dualScatter, dualHoldings1, dualHoldings2, and simulation. When the user is in single-portfolio view and switches to the dashboard tab, all 11 charts resize even though only 3 of them are visible. Each `chart.resize()` call forces a layout recalculation on a DOM element that may be hidden, causing unnecessary browser reflow. On mobile, where layout recalculations are expensive, this can cause a brief stutter on every tab switch. Only charts inside the currently active view should be resized.

---

### 🔵 FIX-22 · `console.log` Left in Production

**File:** `app.js:20`

**What we do now:**
```javascript
console.log(`[Portfolio Dashboard] Using API Base URL: ${API_BASE_URL || '(same origin)'}`);
```

**Why it's wrong:**

This exposes internal routing configuration to anyone who opens the browser DevTools console. It also clutters the console output for developers debugging real issues. Minor by itself but contributes to an unprofessional production artifact.

---

### 🔵 FIX-23 · Info Sheet Uses `textContent` — Strips Any Formatting from Tooltip Bodies

**File:** `app.js:685`

**What we do now:**
```javascript
el.infoSheetBody.textContent = body || '';
```

**Why it's wrong:**

`textContent` renders everything as plain text. If a tooltip body contains `<strong>Sharpe Ratio</strong>: measures return per unit of risk`, the user on mobile sees the literal string `<strong>Sharpe Ratio</strong>: measures return...` rather than the bolded version. Since this app is built for non-expert users who benefit most from rich, formatted explanations, stripping formatting from the one mobile-focused help overlay is counterproductive. Using `innerHTML` with sanitized content (or a whitelist of safe tags like `<strong>`, `<em>`, `<br>`) would allow the explanations to be as clear as possible for the user who needs them most.

---

## Part 4 — Architecture / Performance

---

### 🟠 FIX-24 · No Market Data Caching — Redundant yfinance Downloads per Request

**File:** `helper.py` — `fetch_close_prices_between()`

**What we do now:**
```python
def fetch_close_prices_between(ticker: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    data = yf.download(ticker, start=..., end=..., ...)
    return close
```
Every call downloads fresh data from Yahoo Finance with no caching.

**Why it's wrong:**

SPY is fetched on every single request — in the main analysis, in the scatter chart, in the Test Lab baseline, and in the simulation. If two users analyze at the same time, SPY is fetched four times simultaneously from the same upstream source. Stock prices don't change during market hours more than once per minute, and they don't change at all on weekends or after close. Fetching the same ticker's 5-year history repeatedly — data that is megabytes in size and changes at most once per day — is the single largest source of latency in the entire app. A simple in-process cache with a 5-minute TTL would eliminate most redundant downloads:

```python
from functools import lru_cache
from datetime import datetime

@lru_cache(maxsize=256)
def _cached_prices(ticker: str, start_str: str, end_str: str) -> pd.Series:
    return _raw_yfinance_download(ticker, start_str, end_str)
```

---

### 🟠 FIX-25 · `app.js` Is a 2,000+ Line Monolith

**File:** `frontend/assets/app.js`

**What we do now:**

One file contains: API URL detection, global state, color constants, layout detection utilities, DOM element references (100+ lines), utility functions, loading state management, tab navigation, chart rendering (5 chart types × 2 portfolio contexts), upload handling, analysis flow, dual-portfolio rendering, Test Lab rendering, simulation rendering, and all event listener binding.

**Why it's wrong:**

Any change to any chart now requires scanning 2,000 lines to understand what else might be affected. The dual-portfolio versions of each chart are separated from their single-portfolio counterparts by hundreds of lines, making it easy to fix a bug in one and miss the other (this is already documented as a known risk in CLAUDE.md). Adding a new metric card requires touching 6–8 different locations scattered across the file. New contributors — or future-you after 3 months — have to read the entire file to understand any individual part of it. Separating into logical modules would isolate change blast radius:

```
frontend/assets/
  state.js        — global state and cache
  api.js          — all fetch() calls
  charts.js       — all ApexCharts rendering
  upload.js       — onboarding and file handling
  navigation.js   — tabs, portfolio switching, info sheets
  app.js          — initialization and event wiring only
```

---

### 🔵 FIX-26 · `std_path` Computed But Never Used

**File:** `main.py:934` · **Flagged by:** Pylance

**What we have:**
```python
std_path = simulations.std(axis=0)   # computed but not included in the response
```

**Why it's wrong:**

`std_path` is the standard deviation of all simulation paths at each point in time — it measures how wide the fan of paths is growing. It is computed but never returned to the frontend or used anywhere. This is dead code: it costs CPU and memory on every simulation run for no benefit. Either include it in the response (it could power a useful "uncertainty band" visualization) or delete the line.

---

## Fix Priority Order

### Tier 1 — Correctness (fixes numbers that are wrong)
- ✅ FIX-01 · Geometric return + off-by-one period count + zero-price guard
- ✅ FIX-02 · Simulation random seed + thread-safe RNG (`default_rng`)
- ✅ FIX-03 · GBM drift display (Ito correction)
- ✅ FIX-10 · Bulk yfinance download (sequential → single round-trip)
- ✅ FIX-11 · Simulate uses `_resolve_csv_path()` consistently

### Tier 2 — Accuracy (fixes metrics that are imprecise or inconsistent)
- 🔲 FIX-04 · Historical VaR + monthly label
- 🔲 FIX-05 · MAR-based downside deviation
- ✅ FIX-06a · Synthetic index off-by-one base (construction bug fixed)
- 🔲 FIX-06b · Test Lab vs Dashboard metric mismatch UX disclosure
- 🔲 FIX-07 · GBM history intersection
- 🔲 FIX-09 · Split cash flow contamination
- 🔲 FIX-13 · Upload file size validation
- 🔲 FIX-17 · XSS in renderTable

### Tier 3 — Performance and UX
- 🔲 FIX-18 · Parallel preloading
- 🔲 FIX-19 · Request deduplication
- 🔲 FIX-24 · Market data caching
- 🔲 FIX-12 · SPY double fetch
- 🔲 FIX-20 · Benchmark zero values in chart

### Tier 4 — Cleanup
- 🔲 FIX-14 · Deduplicate Test Lab logic
- 🔲 FIX-08 · period_years overwrite
- 🔲 FIX-21 · Resize only visible charts
- 🔲 FIX-22 · Remove console.log
- 🔲 FIX-23 · Info sheet HTML formatting
- 🔲 FIX-15 · Narrow CORS origin
- 🔲 FIX-16 · yfinance column normalization
- 🔲 FIX-25 · Modularize app.js
- 🔲 FIX-26 · Remove or use `std_path` dead code
