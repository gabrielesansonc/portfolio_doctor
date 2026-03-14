from __future__ import annotations

from pathlib import Path
import re
import shutil
import sys
from typing import Any

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Allow importing project helper.py at repo root.
ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from helper import (  # noqa: E402
    analyze_robinhood_portfolio,
    compute_asset_metrics_as_of,
    compute_final_holdings_portfolio_metrics,
    compute_final_holdings_weights,
    compute_holdings_weights_as_of,
    fetch_close_prices_between,
    daily_returns_from_prices,
    load_robinhood_orders_csv,
)

DATA_DIR = ROOT_DIR / "data"
FRONTEND_DIR = ROOT_DIR / "frontend"
DEFAULT_CSV = "16d1a7ad-1a4f-5347-b5e5-17ca4bb84564.csv"
DEFAULT_BENCHMARKS = ["SPY", "QQQ"]
DEFAULT_SCATTER = ["QQQ", "VTI", "AAPL", "MSFT", "AMZN", "GOOGL", "VOO"]

try:
    from fastapi import File, UploadFile
    import multipart  # type: ignore  # noqa: F401

    HAS_MULTIPART = True
except Exception:
    HAS_MULTIPART = False


class AnalyzeRequest(BaseModel):
    csv_file: str = Field(default=DEFAULT_CSV)
    portfolio_name: str = Field(default="YOUR PORTFOLIO")
    years: int = Field(default=5, ge=1, le=20)
    risk_free_rate: float = Field(default=0.037)
    benchmarks: list[str] = Field(default_factory=lambda: DEFAULT_BENCHMARKS.copy())
    scatter_tickers: list[str] = Field(default_factory=lambda: DEFAULT_SCATTER.copy())


app = FastAPI(title="Portfolio Dashboard API", version="2.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/defaults")
def defaults() -> dict[str, Any]:
    return {
        "csv_file": DEFAULT_CSV,
        "benchmarks": DEFAULT_BENCHMARKS,
        "scatter_tickers": DEFAULT_SCATTER,
        "years": 5,
        "risk_free_rate": 0.037,
        "portfolio_name": "YOUR PORTFOLIO",
    }


@app.get("/api/csv-files")
def list_csv_files() -> dict[str, list[str]]:
    DATA_DIR.mkdir(exist_ok=True)
    files = sorted([p.name for p in DATA_DIR.glob("*.csv")])
    return {"files": files}


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return cleaned or "uploaded.csv"


if HAS_MULTIPART:
    @app.post("/api/upload-csv")
    def upload_csv(file: UploadFile = File(...)) -> dict[str, Any]:
        DATA_DIR.mkdir(exist_ok=True)
        filename = _safe_filename(file.filename or "uploaded.csv")
        if not filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only .csv uploads are supported.")

        destination = DATA_DIR / filename
        try:
            with destination.open("wb") as f:
                shutil.copyfileobj(file.file, f)
        finally:
            file.file.close()

        files = sorted([p.name for p in DATA_DIR.glob("*.csv")])
        return {"uploaded": filename, "files": files}
else:
    @app.post("/api/upload-csv")
    def upload_csv_disabled() -> dict[str, Any]:
        raise HTTPException(
            status_code=503,
            detail="CSV upload requires python-multipart. Install dependencies from backend/requirements.txt",
        )


def _resolve_csv_path(csv_file: str) -> Path:
    candidate = Path(csv_file)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    data_candidate = DATA_DIR / csv_file
    if data_candidate.exists():
        return data_candidate

    root_candidate = ROOT_DIR / csv_file
    if root_candidate.exists():
        return root_candidate

    raise FileNotFoundError(f"CSV file not found: {csv_file}")


def _frame_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df.empty:
        return []
    out = df.copy()
    if isinstance(out.index, pd.DatetimeIndex):
        out = out.reset_index().rename(columns={out.index.name or "index": "date"})
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = pd.to_datetime(out[col]).dt.strftime("%Y-%m-%d")
    return out.to_dict(orient="records")


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    try:
        csv_path = _resolve_csv_path(request.csv_file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    benchmarks = [b.upper() for b in request.benchmarks if b.strip()]
    if not benchmarks:
        benchmarks = DEFAULT_BENCHMARKS.copy()

    scatter_tickers = [t.upper() for t in request.scatter_tickers if t.strip()]
    if not scatter_tickers:
        scatter_tickers = DEFAULT_SCATTER.copy()

    try:
        result = analyze_robinhood_portfolio(
            csv_path=csv_path,
            portfolio_name=request.portfolio_name,
            benchmark_tickers=tuple(benchmarks),
            risk_free_rate=request.risk_free_rate,
            years=request.years,
        )

        analysis_end = (
            pd.Timestamp(result.value_history.index.max())
            if not result.value_history.empty
            else pd.Timestamp.today().normalize()
        )

        # Fetch SPY returns for beta calculation
        analysis_start = analysis_end - pd.DateOffset(years=request.years)
        try:
            spy_prices = fetch_close_prices_between("SPY", start=analysis_start, end=analysis_end)
            market_returns = daily_returns_from_prices(spy_prices)
        except Exception:
            market_returns = None

        scatter_rows: list[dict[str, Any]] = []
        for ticker in scatter_tickers:
            try:
                scatter_rows.append(
                    compute_asset_metrics_as_of(
                        ticker=ticker,
                        years=request.years,
                        as_of_date=analysis_end,
                        risk_free_rate=request.risk_free_rate,
                        market_returns=market_returns,
                    ).as_dict()
                )
            except Exception:
                continue

        try:
            scatter_rows.append(
                compute_final_holdings_portfolio_metrics(
                    result.trades,
                    years=request.years,
                    risk_free_rate=request.risk_free_rate,
                    label=request.portfolio_name,
                    as_of_date=analysis_end,
                    market_returns=market_returns,
                ).as_dict()
            )
        except Exception:
            pass

        scatter_df = pd.DataFrame(scatter_rows)
        if not scatter_df.empty:
            scatter_df = (
                scatter_df.drop_duplicates(subset=["ticker"], keep="last")
                .sort_values(by="annual_volatility")
                .reset_index(drop=True)
            )

        holdings_df = compute_holdings_weights_as_of(result.trades, as_of_date=analysis_end)

        metrics_df = result.metrics_table.copy()
        portfolio_row = metrics_df[metrics_df["ticker"] == request.portfolio_name]
        portfolio_summary = (
            portfolio_row.iloc[0].to_dict() if not portfolio_row.empty else {
                "ticker": request.portfolio_name,
                "period_years": request.years,
                "annual_return": None,
                "annual_volatility": None,
                "sharpe_ratio": None,
                "sortino_ratio": None,
                "max_drawdown": None,
                "beta": None,
                "var_95": None,
                "downside_deviation": None,
            }
        )

        benchmark_metrics = metrics_df.copy()  # Include portfolio in benchmark table

        return {
            "config": {
                **request.model_dump(),
                "benchmarks": benchmarks,
                "scatter_tickers": scatter_tickers,
            },
            "portfolio_summary": portfolio_summary,
            "benchmark_metrics": _frame_to_records(benchmark_metrics),
            "scatter_metrics": _frame_to_records(scatter_df),
            "value_history": _frame_to_records(result.value_history),
            "holdings_weights": _frame_to_records(holdings_df),
            "trades_count": int(len(result.trades)),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ===== TEST LAB ENDPOINTS =====

# 50 Common ETFs covering various markets and sectors
TEST_LAB_ETFS = {
    # US Broad Market
    "VOO": "Vanguard S&P 500 ETF",
    "VTI": "Vanguard Total US Stock Market",
    "IVV": "iShares Core S&P 500",
    "SPY": "SPDR S&P 500 ETF Trust",
    "QQQ": "Invesco Nasdaq 100",
    "DIA": "SPDR Dow Jones Industrial",
    "IWM": "iShares Russell 2000 Small-Cap",
    "VXF": "Vanguard Extended Market (ex-S&P 500)",
    # International Developed
    "VEA": "Vanguard Developed Markets",
    "EFA": "iShares MSCI EAFE (Europe, Aus, Far East)",
    "IEFA": "iShares Core MSCI EAFE",
    "VGK": "Vanguard European Stock",
    "EWG": "iShares MSCI Germany",
    "EWJ": "iShares MSCI Japan",
    "EWU": "iShares MSCI United Kingdom",
    "EWC": "iShares MSCI Canada",
    "EWA": "iShares MSCI Australia",
    # Emerging Markets  
    "VWO": "Vanguard Emerging Markets",
    "EEM": "iShares MSCI Emerging Markets",
    "IEMG": "iShares Core MSCI Emerging Markets",
    "EWZ": "iShares MSCI Brazil",
    "EWW": "iShares MSCI Mexico",
    "FXI": "iShares China Large-Cap",
    "INDA": "iShares MSCI India",
    "EWT": "iShares MSCI Taiwan",
    # Sectors
    "XLK": "Technology Select Sector SPDR",
    "VGT": "Vanguard Information Technology",
    "XLF": "Financial Select Sector SPDR",
    "XLE": "Energy Select Sector SPDR",
    "XLV": "Health Care Select Sector SPDR",
    "XLI": "Industrial Select Sector SPDR",
    "XLC": "Communication Services Select SPDR",
    "XLY": "Consumer Discretionary Select SPDR",
    "XLP": "Consumer Staples Select SPDR",
    "XLU": "Utilities Select Sector SPDR",
    # Thematic
    "ARKK": "ARK Innovation ETF",
    "BOTZ": "Global X Robotics & AI",
    "ROBO": "ROBO Global Robotics & Automation",
    "SKYY": "First Trust Cloud Computing",
    "HACK": "ETFMG Prime Cyber Security",
    "IBB": "iShares Biotechnology",
    "XBI": "SPDR S&P Biotech",
    # Commodities
    "GLD": "SPDR Gold Shares",
    "SLV": "iShares Silver Trust",
    "IAU": "iShares Gold Trust",
    "USO": "United States Oil Fund",
    "UNG": "United States Natural Gas Fund",
    # Bonds
    "BND": "Vanguard Total Bond Market",
    "AGG": "iShares Core US Aggregate Bond",
    "TLT": "iShares 20+ Year Treasury Bond",
    "SHY": "iShares 1-3 Year Treasury Bond",
    "LQD": "iShares Investment Grade Corporate Bond",
    "HYG": "iShares High Yield Corporate Bond",
}


class TestLabRequest(BaseModel):
    csv_file: str = Field(default=DEFAULT_CSV)
    years: int = Field(default=5, ge=1, le=20)
    risk_free_rate: float = Field(default=0.037)
    investment_amount: float = Field(default=1000.0)
    etfs: list[str] = Field(default_factory=lambda: list(TEST_LAB_ETFS.keys()))


class SingleTickerTestRequest(BaseModel):
    csv_file: str = Field(default=DEFAULT_CSV)
    years: int = Field(default=5, ge=1, le=20)
    risk_free_rate: float = Field(default=0.037)
    investment_amount: float = Field(default=1000.0)
    ticker: str


@app.post("/api/testlab/simulate")
def testlab_simulate(request: TestLabRequest) -> dict[str, Any]:
    """Run Test Lab simulation: calculate impact of adding $X to each ETF."""
    from helper import (
        load_robinhood_orders_csv,
        fetch_close_prices_between,
        compute_metrics_from_price_series,
    )
    
    try:
        csv_path = _resolve_csv_path(request.csv_file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    
    try:
        trades = load_robinhood_orders_csv(csv_path)
        if trades.empty:
            raise ValueError("No valid trades found.")
        
        end = pd.Timestamp.today().normalize()
        start = end - pd.DateOffset(years=request.years)
        
        # Get current holdings
        active_trades = trades[trades["date"] <= end].copy()
        final_shares = active_trades.groupby("symbol")["signed_quantity"].sum()
        final_shares = final_shares[final_shares > 0]
        
        if final_shares.empty:
            raise ValueError("No positive holdings found.")
        
        # Fetch prices for holdings
        price_map: dict[str, pd.Series] = {}
        for symbol in final_shares.index:
            try:
                price_map[symbol] = fetch_close_prices_between(symbol, start=start, end=end)
            except Exception:
                continue
        
        available = [s for s in final_shares.index if s in price_map]
        if not available:
            raise ValueError("Could not fetch prices for holdings.")
        
        final_shares = final_shares.loc[available]
        prices_df = pd.DataFrame({s: price_map[s] for s in available}).dropna(how="any")
        
        if prices_df.empty:
            raise ValueError("Insufficient price history.")
        
        # Calculate baseline portfolio metrics
        latest_prices = prices_df.iloc[-1]
        market_values = final_shares * latest_prices
        total_value = float(market_values.sum())
        weights = market_values / total_value
        
        daily_returns = prices_df.pct_change().dropna()
        portfolio_returns = daily_returns.mul(weights, axis=1).sum(axis=1)
        synthetic_index = (1.0 + portfolio_returns).cumprod()
        
        baseline = compute_metrics_from_price_series(
            synthetic_index,
            label="BASELINE",
            risk_free_rate=request.risk_free_rate,
        )
        
        baseline_dict = {
            "annual_return": baseline.annual_return,
            "annual_volatility": baseline.annual_volatility,
            "sharpe_ratio": baseline.sharpe_ratio,
            "sortino_ratio": baseline.sortino_ratio,
            "max_drawdown": baseline.max_drawdown,
            "var_95": baseline.var_95,
        }
        
        # Now simulate adding investment to each ETF
        results = []
        investment = request.investment_amount
        
        for etf in request.etfs:
            try:
                etf_prices = fetch_close_prices_between(etf.upper(), start=start, end=end)
                etf_prices = etf_prices.reindex(prices_df.index).ffill().dropna()
                
                if len(etf_prices) < len(prices_df) * 0.8:
                    continue
                
                # Calculate new weights with added ETF investment
                etf_latest = float(etf_prices.iloc[-1])
                new_total = total_value + investment
                
                new_weights = (market_values / new_total).to_dict()
                etf_upper = etf.upper()
                
                # If ETF already in portfolio, ADD to existing weight, don't replace
                if etf_upper in new_weights:
                    new_weights[etf_upper] += investment / new_total
                else:
                    new_weights[etf_upper] = investment / new_total
                
                # Build combined returns
                combined_prices = prices_df.copy()
                if etf_upper not in combined_prices.columns:
                    combined_prices[etf_upper] = etf_prices
                combined_returns = combined_prices.pct_change().dropna()
                
                new_portfolio_returns = sum(
                    combined_returns[sym] * w for sym, w in new_weights.items()
                    if sym in combined_returns.columns
                )
                new_synthetic = (1.0 + new_portfolio_returns).cumprod()
                
                new_metrics = compute_metrics_from_price_series(
                    new_synthetic,
                    label=etf.upper(),
                    risk_free_rate=request.risk_free_rate,
                )
                
                results.append({
                    "ticker": etf.upper(),
                    "name": TEST_LAB_ETFS.get(etf.upper(), ""),
                    "new_return": new_metrics.annual_return,
                    "new_volatility": new_metrics.annual_volatility,
                    "new_sharpe": new_metrics.sharpe_ratio,
                    "new_sortino": new_metrics.sortino_ratio,
                    "return_delta": new_metrics.annual_return - baseline.annual_return,
                    "volatility_delta": new_metrics.annual_volatility - baseline.annual_volatility,
                    "sharpe_delta": new_metrics.sharpe_ratio - baseline.sharpe_ratio,
                    "sortino_delta": new_metrics.sortino_ratio - baseline.sortino_ratio,
                })
            except Exception:
                continue
        
        # Sort for rankings - use Sortino as primary
        results_df = pd.DataFrame(results)
        
        top_risk_reducers = results_df.nsmallest(5, "volatility_delta").to_dict("records") if not results_df.empty else []
        top_return_boosters = results_df.nlargest(5, "return_delta").to_dict("records") if not results_df.empty else []
        top_sortino_improvers = results_df.nlargest(5, "sortino_delta").to_dict("records") if not results_df.empty else []
        
        all_results = results_df.sort_values("sortino_delta", ascending=False).to_dict("records") if not results_df.empty else []
        
        return {
            "baseline": baseline_dict,
            "investment_amount": investment,
            "top_risk_reducers": top_risk_reducers,
            "top_return_boosters": top_return_boosters,
            "top_sortino_improvers": top_sortino_improvers,
            "all_results": all_results,
            "etf_count": len(all_results),
        }
        
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/testlab/test-ticker")
def testlab_test_ticker(request: SingleTickerTestRequest) -> dict[str, Any]:
    """Test impact of adding investment in a single custom ticker."""
    from helper import (
        load_robinhood_orders_csv,
        fetch_close_prices_between,
        compute_metrics_from_price_series,
    )
    
    try:
        csv_path = _resolve_csv_path(request.csv_file)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    
    ticker = request.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="Ticker is required.")
    
    try:
        trades = load_robinhood_orders_csv(csv_path)
        if trades.empty:
            raise ValueError("No valid trades found.")
        
        end = pd.Timestamp.today().normalize()
        start = end - pd.DateOffset(years=request.years)
        
        # Get current holdings
        active_trades = trades[trades["date"] <= end].copy()
        final_shares = active_trades.groupby("symbol")["signed_quantity"].sum()
        final_shares = final_shares[final_shares > 0]
        
        if final_shares.empty:
            raise ValueError("No positive holdings found.")
        
        # Fetch prices for holdings
        price_map: dict[str, pd.Series] = {}
        for symbol in final_shares.index:
            try:
                price_map[symbol] = fetch_close_prices_between(symbol, start=start, end=end)
            except Exception:
                continue
        
        available = [s for s in final_shares.index if s in price_map]
        if not available:
            raise ValueError("Could not fetch prices for holdings.")
        
        final_shares = final_shares.loc[available]
        prices_df = pd.DataFrame({s: price_map[s] for s in available}).dropna(how="any")
        
        if prices_df.empty:
            raise ValueError("Insufficient price history.")
        
        # Calculate baseline
        latest_prices = prices_df.iloc[-1]
        market_values = final_shares * latest_prices
        total_value = float(market_values.sum())
        weights = market_values / total_value
        
        daily_returns = prices_df.pct_change().dropna()
        portfolio_returns = daily_returns.mul(weights, axis=1).sum(axis=1)
        synthetic_index = (1.0 + portfolio_returns).cumprod()
        
        baseline = compute_metrics_from_price_series(
            synthetic_index,
            label="BASELINE",
            risk_free_rate=request.risk_free_rate,
        )
        
        # Fetch ticker prices
        ticker_prices = fetch_close_prices_between(ticker, start=start, end=end)
        ticker_prices = ticker_prices.reindex(prices_df.index).ffill().dropna()
        
        if len(ticker_prices) < len(prices_df) * 0.5:
            raise ValueError(f"Insufficient price history for {ticker}.")
        
        # Calculate new portfolio with ticker
        investment = request.investment_amount
        new_total = total_value + investment
        
        new_weights = (market_values / new_total).to_dict()
        
        # If ticker already in portfolio, ADD to existing weight, don't replace
        if ticker in new_weights:
            new_weights[ticker] += investment / new_total
        else:
            new_weights[ticker] = investment / new_total
        
        combined_prices = prices_df.copy()
        if ticker not in combined_prices.columns:
            combined_prices[ticker] = ticker_prices
        combined_returns = combined_prices.pct_change().dropna()
        
        new_portfolio_returns = sum(
            combined_returns[sym] * w for sym, w in new_weights.items()
            if sym in combined_returns.columns
        )
        new_synthetic = (1.0 + new_portfolio_returns).cumprod()
        
        new_metrics = compute_metrics_from_price_series(
            new_synthetic,
            label=ticker,
            risk_free_rate=request.risk_free_rate,
        )
        
        return {
            "ticker": ticker,
            "investment_amount": investment,
            "baseline": {
                "annual_return": baseline.annual_return,
                "annual_volatility": baseline.annual_volatility,
                "sharpe_ratio": baseline.sharpe_ratio,
                "sortino_ratio": baseline.sortino_ratio,
            },
            "with_ticker": {
                "annual_return": new_metrics.annual_return,
                "annual_volatility": new_metrics.annual_volatility,
                "sharpe_ratio": new_metrics.sharpe_ratio,
                "sortino_ratio": new_metrics.sortino_ratio,
            },
            "delta": {
                "return_delta": new_metrics.annual_return - baseline.annual_return,
                "volatility_delta": new_metrics.annual_volatility - baseline.annual_volatility,
                "sharpe_delta": new_metrics.sharpe_ratio - baseline.sharpe_ratio,
                "sortino_delta": new_metrics.sortino_ratio - baseline.sortino_ratio,
            },
        }
        
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ===== SAMPLE PORTFOLIO GENERATION =====

SAMPLE_PORTFOLIO_ALLOCATION = {
    "VOO": 0.70,   # 70% S&P 500
    "QQQ": 0.10,   # 10% Nasdaq 100
    "SLV": 0.10,   # 10% Silver
    "GLD": 0.05,   # 5% Gold
    "CVNA": 0.03,  # 3% Carvana
    "META": 0.02,  # 2% Meta
}
SAMPLE_MONTHLY_INVESTMENT = 300.0


@app.get("/api/sample-portfolio/info")
def sample_portfolio_info() -> dict[str, Any]:
    """Return information about the sample portfolio."""
    return {
        "monthly_investment": SAMPLE_MONTHLY_INVESTMENT,
        "allocation": SAMPLE_PORTFOLIO_ALLOCATION,
        "description": f"${int(SAMPLE_MONTHLY_INVESTMENT)}/month DCA into a diversified mix",
    }


@app.post("/api/sample-portfolio/generate")
def generate_sample_portfolio(years: int = 5) -> dict[str, Any]:
    """Generate a sample portfolio CSV with monthly DCA purchases.
    
    Optimized: Downloads all historical data in one bulk request per ticker,
    then builds trades from the cached data.
    """
    import yfinance as yf
    from datetime import datetime
    from dateutil.relativedelta import relativedelta
    
    DATA_DIR.mkdir(exist_ok=True)
    
    # Generate monthly purchase dates for the past N years
    end_date = datetime.now()
    start_date = end_date - relativedelta(years=years)
    
    # Get first trading day of each month
    current = start_date.replace(day=1)
    purchase_dates = []
    while current <= end_date:
        purchase_dates.append(current)
        current += relativedelta(months=1)
    
    # OPTIMIZATION: Bulk download all ticker data at once
    tickers = list(SAMPLE_PORTFOLIO_ALLOCATION.keys())
    
    # Download all data in one call - much faster than individual calls
    try:
        all_data = yf.download(
            tickers,
            start=start_date.strftime("%Y-%m-%d"),
            end=(end_date + relativedelta(days=7)).strftime("%Y-%m-%d"),
            progress=False,
            group_by='ticker',
            threads=True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch price data: {str(e)}")
    
    if all_data.empty:
        raise HTTPException(status_code=500, detail="No price data available")
    
    # Extract Close prices for each ticker
    ticker_prices = {}
    for ticker in tickers:
        try:
            if len(tickers) == 1:
                # Single ticker: data is not grouped
                close_series = all_data["Close"].dropna()
            else:
                # Multiple tickers: data is grouped by ticker
                close_series = all_data[ticker]["Close"].dropna()
            ticker_prices[ticker] = close_series
        except Exception:
            continue
    
    if not ticker_prices:
        raise HTTPException(status_code=500, detail="Failed to extract price data")
    
    # Build CSV rows using cached data
    rows = []
    for purchase_date in purchase_dates:
        # Format date as M/D/YYYY for Robinhood style
        date_str = f"{purchase_date.month}/{purchase_date.day}/{purchase_date.year}"
        purchase_ts = pd.Timestamp(purchase_date)
        
        for ticker, weight in SAMPLE_PORTFOLIO_ALLOCATION.items():
            if ticker not in ticker_prices:
                continue
                
            prices = ticker_prices[ticker]
            investment_amount = SAMPLE_MONTHLY_INVESTMENT * weight
            
            # Find price on or after purchase date (first available trading day)
            try:
                # Get prices on or after the purchase date
                available_prices = prices[prices.index >= purchase_ts]
                if available_prices.empty:
                    # Fallback: use closest price before date
                    available_prices = prices[prices.index <= purchase_ts]
                    if available_prices.empty:
                        continue
                    price = float(available_prices.iloc[-1])
                else:
                    price = float(available_prices.iloc[0])
                
                if hasattr(price, 'item'):
                    price = price.item()
            except Exception:
                continue
            
            quantity = investment_amount / price
            
            rows.append({
                "Activity Date": date_str,
                "Process Date": date_str,
                "Settle Date": date_str,
                "Instrument": ticker,
                "Description": f"{ticker} - Sample DCA Purchase",
                "Trans Code": "Buy",
                "Quantity": f"{quantity:.6f}",
                "Price": f"${price:.2f}",
                "Amount": f"(${investment_amount:.2f})",
            })
    
    if not rows:
        raise HTTPException(status_code=500, detail="Failed to generate sample portfolio data")
    
    # Create DataFrame and save
    df = pd.DataFrame(rows)
    filename = "sample_portfolio_dca.csv"
    filepath = DATA_DIR / filename
    df.to_csv(filepath, index=False)
    
    return {
        "filename": filename,
        "trades_count": len(rows),
        "months": len(purchase_dates),
        "total_invested": SAMPLE_MONTHLY_INVESTMENT * len(purchase_dates),
    }


# ===== GBM Simulation Endpoints =====

class SimulationRequest(BaseModel):
    csv_file: str = Field(default=DEFAULT_CSV)
    portfolio_name: str = Field(default="YOUR PORTFOLIO")
    history_years: int = Field(default=5, ge=1, le=20)
    simulation_years: int = Field(default=5, ge=1, le=30)
    num_simulations: int = Field(default=300, ge=10, le=1000)
    trading_days_per_year: int = Field(default=252)


@app.post("/api/simulate")
def run_gbm_simulation(req: SimulationRequest) -> dict[str, Any]:
    """
    Run GBM simulation using historical returns of current holdings.
    Computes weighted portfolio returns based on today's allocation weights.
    """
    import numpy as np
    import pandas as pd
    from datetime import timedelta, date
    
    csv_path = DATA_DIR / req.csv_file
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"CSV file not found: {req.csv_file}")
    
    # Load trades to get current holdings
    try:
        trades = load_robinhood_orders_csv(str(csv_path))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load trades: {e}")
    
    if trades.empty:
        raise HTTPException(status_code=400, detail="No trades found in CSV")
    
    # Get current holdings weights
    try:
        holdings_df = compute_final_holdings_weights(trades)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to compute holdings: {e}")
    
    if holdings_df.empty:
        raise HTTPException(status_code=400, detail="No current holdings found")
    
    # Current portfolio value
    current_value = float(holdings_df["market_value"].sum())
    
    # Get tickers and weights
    tickers = holdings_df["ticker"].tolist()
    weights = holdings_df["weight"].values
    
    # Fetch historical prices for each holding
    end_date = pd.Timestamp.today().normalize()
    start_date = end_date - pd.DateOffset(years=req.history_years)
    
    price_data = {}
    valid_tickers = []
    valid_weights = []
    
    for i, ticker in enumerate(tickers):
        try:
            prices = fetch_close_prices_between(ticker, start=start_date, end=end_date)
            if len(prices) >= 20:
                price_data[ticker] = prices
                valid_tickers.append(ticker)
                valid_weights.append(weights[i])
        except Exception:
            continue
    
    if not price_data:
        raise HTTPException(status_code=400, detail="Could not fetch prices for any holdings")
    
    # Normalize weights for valid tickers
    valid_weights = np.array(valid_weights)
    valid_weights = valid_weights / valid_weights.sum()
    
    # Align all price series to common dates
    common_index = None
    for prices in price_data.values():
        if common_index is None:
            common_index = prices.index
        else:
            common_index = common_index.intersection(prices.index)
    
    if common_index is None or len(common_index) < 20:
        raise HTTPException(status_code=400, detail="Insufficient overlapping price history")
    
    common_index = common_index.sort_values()
    
    # Compute weighted portfolio returns using current weights
    # This assumes the portfolio maintains today's allocation over history (static weights)
    weighted_returns = None
    for i, ticker in enumerate(valid_tickers):
        prices = price_data[ticker].reindex(common_index).ffill()
        log_returns = np.diff(np.log(prices.values))
        
        if weighted_returns is None:
            weighted_returns = valid_weights[i] * log_returns
        else:
            weighted_returns += valid_weights[i] * log_returns
    
    # Estimate GBM parameters from weighted portfolio returns
    mu_daily = float(np.mean(weighted_returns))
    sigma_daily = float(np.std(weighted_returns))
    
    # Annualize
    mu_annual = mu_daily * req.trading_days_per_year
    sigma_annual = sigma_daily * np.sqrt(req.trading_days_per_year)
    
    # Simulation parameters
    num_steps = req.simulation_years * req.trading_days_per_year
    
    # Run simulations
    np.random.seed(42)  # For reproducibility
    simulations = []
    
    for _ in range(req.num_simulations):
        prices = [current_value]
        price = current_value
        for _ in range(num_steps):
            # GBM: dS = S * (mu*dt + sigma*dW)
            # Using log form: S(t+dt) = S(t) * exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*Z)
            z = np.random.standard_normal()
            price = price * np.exp((mu_daily - 0.5 * sigma_daily**2) + sigma_daily * z)
            prices.append(price)
        simulations.append(prices)
    
    simulations = np.array(simulations)
    
    # Compute statistics
    mean_path = simulations.mean(axis=0)
    std_path = simulations.std(axis=0)
    percentile_5 = np.percentile(simulations, 5, axis=0)
    percentile_95 = np.percentile(simulations, 95, axis=0)
    
    # Generate dates for x-axis (future dates starting from today)
    from datetime import date
    start_date = date.today()
    sim_dates = []
    for i in range(num_steps + 1):
        # Approximate: just add trading days (skip weekends roughly)
        day_offset = int(i * 365 / req.trading_days_per_year)
        sim_dates.append((start_date + timedelta(days=day_offset)).isoformat())
    
    # Sample paths for plotting (too many points would be heavy)
    # Return every 5th day to reduce data
    step = 5
    sampled_indices = list(range(0, num_steps + 1, step))
    
    # Select a subset of simulation paths for visualization
    num_display_paths = min(50, req.num_simulations)
    display_paths = simulations[:num_display_paths, sampled_indices].tolist()
    
    # Build holdings summary for display
    holdings_summary = [
        {"ticker": valid_tickers[i], "weight": float(valid_weights[i])}
        for i in range(len(valid_tickers))
    ]
    
    return {
        "parameters": {
            "mu_daily": mu_daily,
            "sigma_daily": sigma_daily,
            "mu_annual": mu_annual,
            "sigma_annual": sigma_annual,
            "history_days": len(weighted_returns),
            "num_holdings": len(valid_tickers),
        },
        "holdings": holdings_summary,
        "current_value": current_value,
        "simulation": {
            "dates": [sim_dates[i] for i in sampled_indices],
            "mean": mean_path[sampled_indices].tolist(),
            "upper_95": percentile_95[sampled_indices].tolist(),
            "lower_95": percentile_5[sampled_indices].tolist(),
            "paths": display_paths,
        },
        "final_values": {
            "mean": float(mean_path[-1]),
            "median": float(np.median(simulations[:, -1])),
            "percentile_5": float(percentile_5[-1]),
            "percentile_95": float(percentile_95[-1]),
            "min": float(simulations[:, -1].min()),
            "max": float(simulations[:, -1].max()),
        },
    }


app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


@app.get("/")
def dashboard() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")
