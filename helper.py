"""Utilities for market data, MPT metrics, and Robinhood-style portfolio analysis."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, Mapping, Sequence

import numpy as np
import pandas as pd
import yfinance as yf

TRADING_DAYS_PER_YEAR = 252


@dataclass
class AssetMetrics:
    """Annualized performance metrics for a single asset or value series."""

    ticker: str
    period_years: int
    annual_return: float
    annual_volatility: float
    sharpe_ratio: float
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    beta: float = 0.0
    var_95: float = 0.0
    downside_deviation: float = 0.0

    def as_dict(self) -> Dict[str, float | str | int]:
        return {
            "ticker": self.ticker,
            "period_years": self.period_years,
            "annual_return": self.annual_return,
            "annual_volatility": self.annual_volatility,
            "sharpe_ratio": self.sharpe_ratio,
            "sortino_ratio": self.sortino_ratio,
            "max_drawdown": self.max_drawdown,
            "beta": self.beta,
            "var_95": self.var_95,
            "downside_deviation": self.downside_deviation,
        }


@dataclass
class PortfolioAnalysisResult:
    """Result bundle for portfolio and benchmark comparison."""

    trades: pd.DataFrame
    value_history: pd.DataFrame
    metrics_table: pd.DataFrame


def _xnpv(rate: float, cashflows: Sequence[tuple[pd.Timestamp, float]]) -> float:
    """NPV for irregular cash flows at an annual discount rate."""
    t0 = cashflows[0][0]
    total = 0.0
    for date, amount in cashflows:
        years = (date - t0).days / 365.25
        total += amount / ((1.0 + rate) ** years)
    return total


def _xirr(cashflows: Sequence[tuple[pd.Timestamp, float]]) -> float:
    """Compute XIRR using bisection on irregular cash flows."""
    if len(cashflows) < 2:
        raise ValueError("Need at least two cash flow points for IRR.")

    amounts = [amt for _, amt in cashflows]
    if not any(a < 0 for a in amounts) or not any(a > 0 for a in amounts):
        raise ValueError("IRR requires at least one negative and one positive cash flow.")

    low = -0.9999
    high = 10.0
    f_low = _xnpv(low, cashflows)
    f_high = _xnpv(high, cashflows)

    # Expand upper bound if needed to bracket a root.
    attempts = 0
    while f_low * f_high > 0 and attempts < 8:
        high *= 2.0
        f_high = _xnpv(high, cashflows)
        attempts += 1

    if f_low * f_high > 0:
        raise ValueError("Could not bracket IRR root.")

    for _ in range(120):
        mid = (low + high) / 2.0
        f_mid = _xnpv(mid, cashflows)
        if abs(f_mid) < 1e-10:
            return mid
        if f_low * f_mid <= 0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid

    return (low + high) / 2.0


def _to_1d_series(values: object, *, field_name: str, ticker: str) -> pd.Series:
    """Normalize yfinance outputs to a single numeric Series."""
    series_like = values

    if hasattr(series_like, "columns"):
        if getattr(series_like, "shape", (0, 0))[1] == 0:
            raise ValueError(f"{field_name} series is empty for ticker '{ticker}'.")
        series_like = series_like.iloc[:, 0]

    if not hasattr(series_like, "dropna"):
        series_like = pd.Series(series_like)

    series = pd.to_numeric(series_like, errors="coerce").dropna()
    if series.empty:
        raise ValueError(f"{field_name} series is empty for ticker '{ticker}'.")
    return series


def _as_naive_daily_index(values: pd.Series | pd.DataFrame) -> pd.Series | pd.DataFrame:
    """Normalize timestamps to timezone-naive midnight dates for alignment."""
    if getattr(values.index, "tz", None) is not None:
        values = values.copy()
        values.index = values.index.tz_convert(None)
    values = values.copy()
    values.index = pd.to_datetime(values.index).normalize()
    return values


def fetch_close_prices(ticker: str, years: int = 5) -> pd.Series:
    """Fetch adjusted close prices for a ticker using yfinance."""
    period = f"{years}y"
    data = yf.download(ticker, period=period, interval="1d", auto_adjust=True, progress=False)

    if data.empty:
        raise ValueError(f"No data returned for ticker '{ticker}'.")

    columns = list(data.columns.get_level_values(0)) if isinstance(data.columns, pd.MultiIndex) else list(data.columns)
    if "Close" not in columns:
        raise ValueError("Close prices not available in downloaded data.")

    close = _to_1d_series(data["Close"], field_name="Close price", ticker=ticker)
    close = _as_naive_daily_index(close)
    return close


def fetch_close_prices_between(ticker: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    """Fetch adjusted close prices between start and end dates (inclusive)."""
    data = yf.download(
        ticker,
        start=start.strftime("%Y-%m-%d"),
        end=(end + pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=True,
        progress=False,
    )
    if data.empty:
        raise ValueError(f"No data returned for ticker '{ticker}' in selected date range.")

    close = _to_1d_series(data["Close"], field_name="Close price", ticker=ticker)
    close = _as_naive_daily_index(close)
    return close


def daily_returns_from_prices(prices: pd.Series) -> pd.Series:
    """Compute daily percentage returns from a price series."""
    price_series = _to_1d_series(prices, field_name="Price", ticker="input")
    returns = price_series.pct_change().dropna()
    if returns.empty:
        raise ValueError("Not enough data points to compute returns.")
    return returns


# ===== Additional Risk Metrics =====

def compute_downside_deviation(daily_returns: pd.Series) -> float:
    """Compute annualized downside deviation (volatility of negative returns only)."""
    downside_returns = daily_returns[daily_returns < 0]
    if len(downside_returns) == 0:
        return 0.0
    downside_std = float(downside_returns.std(ddof=1))
    return downside_std * np.sqrt(TRADING_DAYS_PER_YEAR)


def compute_sortino_ratio(
    daily_returns: pd.Series,
    annual_return: float,
    risk_free_rate: float = 0.0,
) -> float:
    """Compute Sortino ratio using downside deviation only."""
    downside_deviation = compute_downside_deviation(daily_returns)
    
    if downside_deviation == 0:
        return np.nan
    
    return (annual_return - risk_free_rate) / downside_deviation


def compute_max_drawdown(prices: pd.Series) -> float:
    """Compute maximum drawdown from a price/value series."""
    if len(prices) < 2:
        return 0.0
    
    # Running maximum
    running_max = prices.cummax()
    # Drawdown at each point
    drawdown = (prices - running_max) / running_max
    # Maximum drawdown (most negative)
    max_dd = float(drawdown.min())
    return max_dd  # Returns negative value (e.g., -0.35 for 35% drawdown)


def compute_beta(
    daily_returns: pd.Series,
    market_returns: pd.Series,
) -> float:
    """Compute beta relative to market (SPY)."""
    # Align the series
    aligned = pd.DataFrame({
        'asset': daily_returns,
        'market': market_returns,
    }).dropna()
    
    if len(aligned) < 30:
        return np.nan
    
    covariance = aligned['asset'].cov(aligned['market'])
    market_variance = aligned['market'].var()
    
    if market_variance == 0:
        return np.nan
    
    return float(covariance / market_variance)


def compute_var_95(daily_returns: pd.Series) -> float:
    """Compute Value at Risk at 95% confidence (monthly).
    
    Returns the expected maximum loss as a positive percentage.
    E.g., 0.12 means "95% of months, you won't lose more than 12%"
    """
    if len(daily_returns) < 30:
        return np.nan
    
    # Monthly volatility (approximate)
    daily_vol = float(daily_returns.std(ddof=1))
    monthly_vol = daily_vol * np.sqrt(21)  # ~21 trading days per month
    
    # 95% VaR uses 1.645 standard deviations
    var_95 = monthly_vol * 1.645
    return float(var_95)


def compute_metrics_from_price_series(
    prices: pd.Series,
    *,
    label: str,
    risk_free_rate: float = 0.0,
    market_returns: pd.Series | None = None,
) -> AssetMetrics:
    """Compute annualized return, volatility, Sharpe, Sortino, and risk metrics from a price/value series."""
    daily_returns = daily_returns_from_prices(prices)
    mean_daily_return = float(daily_returns.mean())
    daily_volatility = float(daily_returns.std(ddof=1))

    annual_return = (1 + mean_daily_return) ** TRADING_DAYS_PER_YEAR - 1
    annual_volatility = daily_volatility * np.sqrt(TRADING_DAYS_PER_YEAR)

    if annual_volatility == 0:
        sharpe_ratio = np.nan
    else:
        sharpe_ratio = (annual_return - risk_free_rate) / annual_volatility

    # New metrics
    sortino_ratio = compute_sortino_ratio(daily_returns, annual_return, risk_free_rate)
    max_drawdown = compute_max_drawdown(prices)
    var_95 = compute_var_95(daily_returns)
    downside_dev = compute_downside_deviation(daily_returns)
    
    # Beta requires market returns
    if market_returns is not None and not market_returns.empty:
        beta = compute_beta(daily_returns, market_returns)
    else:
        beta = np.nan

    period_years = max(1, int(round(len(prices) / TRADING_DAYS_PER_YEAR)))
    return AssetMetrics(
        ticker=label,
        period_years=period_years,
        annual_return=float(annual_return),
        annual_volatility=float(annual_volatility),
        sharpe_ratio=float(sharpe_ratio),
        sortino_ratio=float(sortino_ratio) if not np.isnan(sortino_ratio) else 0.0,
        max_drawdown=float(max_drawdown),
        beta=float(beta) if not np.isnan(beta) else 0.0,
        var_95=float(var_95) if not np.isnan(var_95) else 0.0,
        downside_deviation=float(downside_dev),
    )


def compute_flow_adjusted_metrics(
    value_series: pd.Series,
    flow_series: pd.Series,
    *,
    label: str,
    risk_free_rate: float = 0.0,
    market_returns: pd.Series | None = None,
) -> AssetMetrics:
    """Compute metrics with money-weighted return and flow-adjusted volatility.

    - Annual return: XIRR on investor cash flows.
    - Volatility: std of daily returns excluding external cash flows.
      r_t = (V_t - F_t) / V_{t-1} - 1
      where F_t is net external flow on day t into the portfolio value process.
    """
    values = _to_1d_series(value_series, field_name="Portfolio value", ticker=label)
    values = _as_naive_daily_index(values).sort_index()

    flows = pd.Series(flow_series, copy=True)
    flows.index = pd.to_datetime(flows.index).normalize()
    flows = flows.sort_index()
    flows = flows.reindex(values.index, fill_value=0.0).astype(float)

    prev_values = values.shift(1)
    daily_returns = ((values - flows) / prev_values) - 1.0
    daily_returns = daily_returns.replace([np.inf, -np.inf], np.nan).dropna()
    if daily_returns.empty:
        raise ValueError(f"Not enough flow-adjusted return data for '{label}'.")

    daily_volatility = float(daily_returns.std(ddof=1))
    annual_volatility = daily_volatility * np.sqrt(TRADING_DAYS_PER_YEAR)

    # Money-weighted return over a subwindow needs an initial capital outflow.
    # Otherwise existing starting capital is treated as "free," inflating IRR.
    first_date = values.index[0]
    last_date = values.index[-1]
    first_value = float(values.iloc[0])

    cashflow_points: list[tuple[pd.Timestamp, float]] = [(first_date, -first_value)]

    # Include external flows strictly after the first valuation date.
    for date, flow in flows.items():
        if date <= first_date:
            continue
        if float(flow) != 0.0:
            cashflow_points.append((date, -float(flow)))

    cashflow_points.append((last_date, float(values.iloc[-1])))
    cashflow_points = sorted(cashflow_points, key=lambda x: x[0])

    try:
        annual_return = float(_xirr(cashflow_points))
    except Exception:
        # Fallback to annualized geometric return from flow-adjusted daily returns.
        mean_daily = float(daily_returns.mean())
        annual_return = float((1.0 + mean_daily) ** TRADING_DAYS_PER_YEAR - 1.0)

    if annual_volatility == 0:
        sharpe_ratio = np.nan
    else:
        sharpe_ratio = (annual_return - risk_free_rate) / annual_volatility

    # New metrics
    sortino_ratio = compute_sortino_ratio(daily_returns, annual_return, risk_free_rate)
    max_drawdown = compute_max_drawdown(values)
    var_95 = compute_var_95(daily_returns)
    downside_dev = compute_downside_deviation(daily_returns)
    
    # Beta requires market returns
    if market_returns is not None and not market_returns.empty:
        beta = compute_beta(daily_returns, market_returns)
    else:
        beta = np.nan

    span_years = max(1, int(round((values.index[-1] - values.index[0]).days / 365.25)))
    return AssetMetrics(
        ticker=label,
        period_years=span_years,
        annual_return=annual_return,
        annual_volatility=float(annual_volatility),
        sharpe_ratio=float(sharpe_ratio),
        sortino_ratio=float(sortino_ratio) if not np.isnan(sortino_ratio) else 0.0,
        max_drawdown=float(max_drawdown),
        beta=float(beta) if not np.isnan(beta) else 0.0,
        var_95=float(var_95) if not np.isnan(var_95) else 0.0,
        downside_deviation=float(downside_dev),
    )


def compute_asset_metrics(
    ticker: str,
    years: int = 5,
    risk_free_rate: float = 0.0,
    market_returns: pd.Series | None = None,
) -> AssetMetrics:
    """Compute annualized return, volatility, and Sharpe ratio for one asset."""
    prices = fetch_close_prices(ticker, years=years)
    metrics = compute_metrics_from_price_series(
        prices,
        label=ticker.upper(),
        risk_free_rate=risk_free_rate,
        market_returns=market_returns,
    )
    metrics.period_years = years
    return metrics


def compute_asset_metrics_as_of(
    ticker: str,
    *,
    years: int = 5,
    as_of_date: pd.Timestamp | None = None,
    risk_free_rate: float = 0.0,
    market_returns: pd.Series | None = None,
) -> AssetMetrics:
    """Compute asset metrics for a lookback window ending on a chosen as-of date."""
    if years < 1:
        raise ValueError("years must be >= 1.")
    end = pd.Timestamp.today().normalize() if as_of_date is None else pd.Timestamp(as_of_date).normalize()
    start = end - pd.DateOffset(years=years)
    prices = fetch_close_prices_between(ticker, start=start, end=end)
    metrics = compute_metrics_from_price_series(
        prices,
        label=ticker.upper(),
        risk_free_rate=risk_free_rate,
        market_returns=market_returns,
    )
    metrics.period_years = years
    return metrics


def compute_final_holdings_portfolio_metrics(
    trades: pd.DataFrame,
    *,
    years: int = 5,
    risk_free_rate: float = 0.0,
    label: str = "GABES",
    as_of_date: pd.Timestamp | None = None,
    market_returns: pd.Series | None = None,
) -> AssetMetrics:
    """Compute metrics for a static portfolio built from final holdings.

    The method:
    - rebuild final share counts from signed trade quantities
    - keep long positions only (> 0 shares)
    - compute current value weights from latest prices
    - apply those fixed weights to historical daily returns over `years`
    """
    required_cols = {"date", "symbol", "signed_quantity"}
    missing = required_cols - set(trades.columns)
    if missing:
        raise ValueError(f"Trades DataFrame missing required columns: {sorted(missing)}")

    end = pd.Timestamp.today().normalize() if as_of_date is None else pd.Timestamp(as_of_date).normalize()
    start = end - pd.DateOffset(years=years)

    active_trades = trades[trades["date"] <= end].copy()
    final_shares = active_trades.groupby("symbol")["signed_quantity"].sum()
    final_shares = final_shares[final_shares > 0]
    if final_shares.empty:
        raise ValueError("No positive final holdings found to build portfolio weights.")

    price_map: dict[str, pd.Series] = {}
    for symbol in final_shares.index:
        try:
            price_map[symbol] = fetch_close_prices_between(symbol, start=start, end=end)
        except Exception:
            # Skip symbols that cannot be fetched; continue with available holdings.
            continue

    # Fetch SPY for beta if not provided
    if market_returns is None:
        try:
            spy_prices = fetch_close_prices_between("SPY", start=start, end=end)
            market_returns = daily_returns_from_prices(spy_prices)
        except Exception:
            market_returns = None

    available_symbols = [s for s in final_shares.index if s in price_map]
    if not available_symbols:
        raise ValueError("Could not fetch prices for any final holdings symbols.")

    final_shares = final_shares.loc[available_symbols]
    prices_df = pd.DataFrame({s: price_map[s] for s in available_symbols})
    prices_df = prices_df.dropna(how="any")
    if prices_df.empty:
        raise ValueError("Insufficient overlapping price history for final holdings.")

    latest_prices = prices_df.iloc[-1]
    market_values = final_shares * latest_prices
    total_value = float(market_values.sum())
    if total_value <= 0:
        raise ValueError("Final holdings total market value is non-positive.")

    weights = market_values / total_value

    daily_returns = prices_df.pct_change().dropna()
    if daily_returns.empty:
        raise ValueError("Not enough return history for final holdings portfolio.")

    portfolio_daily_returns = daily_returns.mul(weights, axis=1).sum(axis=1)
    synthetic_index = (1.0 + portfolio_daily_returns).cumprod()

    metrics = compute_metrics_from_price_series(
        synthetic_index,
        label=label,
        risk_free_rate=risk_free_rate,
        market_returns=market_returns,
    )
    metrics.period_years = years
    return metrics


def compute_final_holdings_weights(trades: pd.DataFrame) -> pd.DataFrame:
    """Compute current holdings allocation by ticker from final shares.

    Returns columns:
    - ticker
    - shares
    - latest_price
    - market_value
    - weight
    Sorted by weight descending.
    """
    required_cols = {"symbol", "signed_quantity"}
    missing = required_cols - set(trades.columns)
    if missing:
        raise ValueError(f"Trades DataFrame missing required columns: {sorted(missing)}")

    final_shares = trades.groupby("symbol")["signed_quantity"].sum()
    final_shares = final_shares[final_shares > 0]
    if final_shares.empty:
        raise ValueError("No positive final holdings found.")

    end_date = pd.Timestamp.today().normalize()
    start_date = end_date - pd.Timedelta(days=45)

    rows: list[dict[str, float | str]] = []
    for symbol, shares in final_shares.items():
        try:
            prices = fetch_close_prices_between(symbol, start=start_date, end=end_date)
            latest_price = float(prices.iloc[-1])
        except Exception:
            # Skip symbols that cannot be priced right now.
            continue
        market_value = float(shares) * latest_price
        if market_value <= 0:
            continue
        rows.append(
            {
                "ticker": symbol,
                "shares": float(shares),
                "latest_price": latest_price,
                "market_value": market_value,
            }
        )

    if not rows:
        raise ValueError("Could not price final holdings tickers from market data.")

    out = pd.DataFrame(rows)
    total_value = float(out["market_value"].sum())
    if total_value <= 0:
        raise ValueError("Total final holdings market value is non-positive.")

    out["weight"] = out["market_value"] / total_value
    return out.sort_values("weight", ascending=False).reset_index(drop=True)


def compute_holdings_weights_as_of(
    trades: pd.DataFrame,
    *,
    as_of_date: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """Compute holdings allocation by ticker at a specific as-of date.

    - Uses trades up to and including `as_of_date` (or all trades if omitted).
    - Prices each position using latest close available on/before `as_of_date`.
    """
    required_cols = {"date", "symbol", "signed_quantity"}
    missing = required_cols - set(trades.columns)
    if missing:
        raise ValueError(f"Trades DataFrame missing required columns: {sorted(missing)}")

    if as_of_date is None:
        as_of = pd.Timestamp.today().normalize()
    else:
        as_of = pd.Timestamp(as_of_date).normalize()

    filtered = trades[trades["date"] <= as_of].copy()
    if filtered.empty:
        raise ValueError("No trades available up to selected as-of date.")

    final_shares = filtered.groupby("symbol")["signed_quantity"].sum()
    final_shares = final_shares[final_shares > 0]
    if final_shares.empty:
        raise ValueError("No positive holdings as of selected date.")

    start_date = as_of - pd.Timedelta(days=60)
    rows: list[dict[str, float | str]] = []
    for symbol, shares in final_shares.items():
        try:
            prices = fetch_close_prices_between(symbol, start=start_date, end=as_of)
            if prices.empty:
                continue
            latest_price = float(prices.iloc[-1])
        except Exception:
            continue
        market_value = float(shares) * latest_price
        if market_value <= 0:
            continue
        rows.append(
            {
                "ticker": symbol,
                "shares": float(shares),
                "latest_price": latest_price,
                "market_value": market_value,
            }
        )

    if not rows:
        raise ValueError("Could not price holdings as of selected date.")

    out = pd.DataFrame(rows)
    total_value = float(out["market_value"].sum())
    if total_value <= 0:
        raise ValueError("Total holdings value is non-positive.")
    out["weight"] = out["market_value"] / total_value
    return out.sort_values("weight", ascending=False).reset_index(drop=True)


def summarize_metrics(metrics: AssetMetrics) -> pd.DataFrame:
    """Return a neat one-row DataFrame of asset metrics."""
    return pd.DataFrame([metrics.as_dict()])


def _resolve_column(df: pd.DataFrame, candidates: Sequence[str]) -> str:
    """Resolve a column by trying case-insensitive candidate names."""
    lowered_map = {c.strip().lower(): c for c in df.columns}
    for candidate in candidates:
        key = candidate.strip().lower()
        if key in lowered_map:
            return lowered_map[key]
    raise ValueError(f"Missing required column. Expected one of: {', '.join(candidates)}")


def _parse_numeric_series(series: pd.Series) -> pd.Series:
    """Parse a generic numeric series that may include commas or currency symbols."""
    cleaned = (
        series.astype(str)
        .str.strip()
        .replace({"": np.nan, "None": np.nan, "nan": np.nan})
        .str.replace(",", "", regex=False)
        .str.replace("$", "", regex=False)
    )
    return pd.to_numeric(cleaned, errors="coerce")


def _parse_money_series(series: pd.Series) -> pd.Series:
    """Parse money strings like '$1,234.56' or '($1,234.56)' into signed floats."""
    raw = series.astype(str).str.strip()
    raw = raw.replace({"": np.nan, "None": np.nan, "nan": np.nan})
    is_paren_negative = raw.str.startswith("(") & raw.str.endswith(")")

    cleaned = (
        raw.str.replace("(", "", regex=False)
        .str.replace(")", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.replace(",", "", regex=False)
    )
    out = pd.to_numeric(cleaned, errors="coerce")
    out.loc[is_paren_negative.fillna(False)] = -out.loc[is_paren_negative.fillna(False)].abs()
    return out


def _read_robinhood_csv_robust(csv_path: str | Path) -> pd.DataFrame:
    """Read Robinhood CSV robustly, tolerating footer/disclaimer malformed lines."""
    try:
        return pd.read_csv(csv_path)
    except pd.errors.ParserError:
        # Some statement exports append disclaimer/footer lines with extra commas.
        return pd.read_csv(csv_path, engine="python", on_bad_lines="skip")


def load_robinhood_orders_csv(csv_path: str | Path) -> pd.DataFrame:
    """Load and normalize a Robinhood-style stock orders CSV.

    Supports two common formats:
    - Robinhood orders export (Created At / Symbol / Side / Average Price ...)
    - Robinhood account statement activity CSV (Activity Date / Instrument / Trans Code ...)
    """
    df = _read_robinhood_csv_robust(csv_path)

    date_col = _resolve_column(df, ["activity date", "created at", "date", "transaction date"])
    symbol_col = _resolve_column(df, ["symbol", "ticker", "instrument"])
    side_col = _resolve_column(df, ["side", "action", "type", "trans code"])
    qty_col = _resolve_column(df, ["quantity", "filled quantity"])
    price_col = _resolve_column(df, ["average price", "price", "fill price"])
    amount_col = _resolve_column(df, ["amount", "notional", "total"])

    fees_col = None
    try:
        fees_col = _resolve_column(df, ["fees", "fee"])
    except ValueError:
        fees_col = None

    parsed_dates = pd.to_datetime(df[date_col], errors="coerce", utc=True)
    normalized_dates = parsed_dates.dt.tz_convert(None).dt.normalize()

    out = pd.DataFrame(
        {
            "date": normalized_dates,
            "symbol": df[symbol_col].astype(str).str.upper().str.strip(),
            "side": df[side_col].astype(str).str.lower().str.strip(),
            "quantity": _parse_numeric_series(df[qty_col]),
            "average_price": _parse_money_series(df[price_col]),
            "amount": _parse_money_series(df[amount_col]),
            "fees": _parse_money_series(df[fees_col]) if fees_col else 0.0,
        }
    )

    out = out.dropna(subset=["date", "side"]).copy()
    out["symbol"] = out["symbol"].replace({"": np.nan, "NAN": np.nan, "NONE": np.nan})
    out["fees"] = out["fees"].fillna(0.0)

    # Keep equity trade rows AND stock splits (SPL = additional shares from split).
    # Splits are treated as $0-cost share additions for holdings calculation.
    is_buy = out["side"].str.contains("buy", na=False)
    is_sell = out["side"].str.contains("sell", na=False)
    is_split = out["side"].str.contains("spl", na=False)  # Stock splits
    out = out[is_buy | is_sell | is_split].copy()
    out = out.dropna(subset=["symbol", "quantity"]).copy()
    if out.empty:
        raise ValueError("No Buy/Sell/Split rows with symbol and quantity were found in CSV.")

    abs_amount = out["amount"].abs().fillna(0.0)
    fallback_amount = (out["quantity"].abs() * out["average_price"].abs()).fillna(0.0)
    out["trade_amount"] = pd.Series(
        np.where(abs_amount > 0, abs_amount, fallback_amount),
        index=out.index,
    ).astype(float)

    # cash_flow: positive means investing cash (buy), negative means withdrawing (sell).
    # Splits have $0 cash flow but add shares.
    is_buy = out["side"].str.contains("buy", na=False)
    is_split = out["side"].str.contains("spl", na=False)
    out["cash_flow"] = np.where(
        is_buy | is_split,  # Splits treated like $0 buys for flow purposes
        out["trade_amount"] + out["fees"],
        -(out["trade_amount"] - out["fees"]),
    )
    out["signed_quantity"] = np.where(is_buy | is_split, out["quantity"], -out["quantity"])

    return out.sort_values("date").reset_index(drop=True)


def _map_to_market_date(date: pd.Timestamp, market_index: pd.DatetimeIndex) -> pd.Timestamp | None:
    pos = market_index.searchsorted(date)
    if pos >= len(market_index):
        return None
    return market_index[pos]


def _aggregate_on_market_dates(
    events_by_date: Mapping[pd.Timestamp, float],
    market_index: pd.DatetimeIndex,
) -> pd.Series:
    aligned = pd.Series(0.0, index=market_index)
    for date, value in events_by_date.items():
        mapped = _map_to_market_date(pd.Timestamp(date), market_index)
        if mapped is not None:
            aligned.loc[mapped] += float(value)
    return aligned


def _simulate_benchmark_from_flows(
    cash_flows: pd.Series,
    benchmark_prices: pd.Series,
) -> pd.Series:
    shares = 0.0
    values: list[float] = []

    for date, price in benchmark_prices.items():
        flow = float(cash_flows.loc[date]) if date in cash_flows.index else 0.0
        if flow != 0:
            shares += flow / float(price)
        values.append(shares * float(price))

    return pd.Series(values, index=benchmark_prices.index)


def analyze_robinhood_portfolio(
    csv_path: str | Path,
    *,
    portfolio_name: str = "GABES",
    benchmark_tickers: Iterable[str] = ("SPY", "QQQ"),
    risk_free_rate: float = 0.037,
    years: int = 5,
) -> PortfolioAnalysisResult:
    """Analyze portfolio performance from Robinhood-style order history CSV.

    Assumes the CSV contains the full trade history needed to rebuild positions.
    Benchmarks are simulated by replaying the same signed cash flows into each ETF.
    """
    trades = load_robinhood_orders_csv(csv_path)

    if trades.empty:
        raise ValueError("No valid trades found in CSV.")

    symbols = sorted(trades["symbol"].unique())
    benchmarks = [b.upper() for b in benchmark_tickers]

    if years < 1:
        raise ValueError("years must be >= 1.")

    today = pd.Timestamp.today().normalize()
    target_start = today - pd.DateOffset(years=years)
    historical_start = min(pd.Timestamp(trades["date"].min()), pd.Timestamp(target_start)) - pd.Timedelta(days=5)
    end_date = today

    all_tickers = symbols + benchmarks
    # Always include SPY for beta calculation
    if "SPY" not in all_tickers:
        all_tickers.append("SPY")
    
    prices: dict[str, pd.Series] = {}
    for ticker in all_tickers:
        prices[ticker] = fetch_close_prices_between(ticker, start=historical_start, end=end_date)

    common_index = None
    for series in prices.values():
        common_index = series.index if common_index is None else common_index.intersection(series.index)
    if common_index is None or common_index.empty:
        raise ValueError("Could not find overlapping price dates across tickers.")

    common_index = common_index.sort_values()
    for ticker in prices:
        prices[ticker] = prices[ticker].reindex(common_index).ffill().dropna()

    # Compute SPY market returns for beta calculation
    spy_prices = prices.get("SPY")
    market_returns = daily_returns_from_prices(spy_prices) if spy_prices is not None else None

    # Rebuild holdings through signed quantities at market dates.
    qty_events = trades.groupby(["date", "symbol"], as_index=False)["signed_quantity"].sum()
    holdings = pd.DataFrame(0.0, index=common_index, columns=symbols)
    for symbol in symbols:
        symbol_events = qty_events[qty_events["symbol"] == symbol]
        by_date = dict(zip(symbol_events["date"], symbol_events["signed_quantity"]))
        aligned = _aggregate_on_market_dates(by_date, common_index)
        holdings[symbol] = aligned.cumsum()

    asset_prices = pd.DataFrame({symbol: prices[symbol] for symbol in symbols}, index=common_index)
    portfolio_value = (holdings * asset_prices).sum(axis=1)

    flow_events = trades.groupby("date", as_index=False)["cash_flow"].sum()
    cash_flows = _aggregate_on_market_dates(dict(zip(flow_events["date"], flow_events["cash_flow"])), common_index)

    value_history = pd.DataFrame({portfolio_name: portfolio_value}, index=common_index)
    for bench in benchmarks:
        value_history[bench] = _simulate_benchmark_from_flows(cash_flows, prices[bench])

    # Keep selected analysis window: [today - years, today] where data exists.
    value_history = value_history[value_history.index >= pd.Timestamp(target_start).normalize()]

    # Keep range where all series are meaningfully active (post first investment).
    non_zero_mask = (value_history.abs().sum(axis=1) > 0)
    if non_zero_mask.any():
        first_active = value_history.index[non_zero_mask.argmax()]
        value_history = value_history.loc[first_active:]

    # Filter market returns to analysis window
    if market_returns is not None:
        market_returns = market_returns[market_returns.index.isin(value_history.index)]

    metrics_rows = []
    for label in value_history.columns:
        series = value_history[label].where(value_history[label] > 0).dropna()
        if len(series) < 3:
            continue
        aligned_flows = cash_flows.reindex(series.index, fill_value=0.0)
        try:
            metrics = compute_flow_adjusted_metrics(
                series,
                aligned_flows,
                label=label,
                risk_free_rate=risk_free_rate,
                market_returns=market_returns,
            )
            metrics_rows.append(metrics.as_dict())
        except Exception:
            # Fallback for edge cases.
            metrics_rows.append(
                compute_metrics_from_price_series(
                    series,
                    label=label,
                    risk_free_rate=risk_free_rate,
                    market_returns=market_returns,
                ).as_dict()
            )

    metrics_table = pd.DataFrame(metrics_rows)
    if not metrics_table.empty:
        metrics_table = metrics_table.sort_values(by="annual_volatility", ascending=True).reset_index(drop=True)

    return PortfolioAnalysisResult(
        trades=trades,
        value_history=value_history,
        metrics_table=metrics_table,
    )
