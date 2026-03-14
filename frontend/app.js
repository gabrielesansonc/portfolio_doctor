const state = {
  charts: {
    value: null,
    scatter: null,
    holdings: null,
  },
  defaults: null,
  benchmarks: [],
  scatterTickers: [],
};

const el = {
  years: document.getElementById('years'),
  csvFile: document.getElementById('csvFile'),
  csvUpload: document.getElementById('csvUpload'),
  uploadBtn: document.getElementById('uploadBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  runBtn: document.getElementById('runBtn'),
  status: document.getElementById('status'),
  activeYearsPill: document.getElementById('activeYearsPill'),
  activeCsvPill: document.getElementById('activeCsvPill'),

  portfolioMetrics: document.getElementById('portfolioMetrics'),
  benchmarkTable: document.getElementById('benchmarkTable'),
  scatterTable: document.getElementById('scatterTable'),

  benchmarkInput: document.getElementById('benchmarkInput'),
  addBenchmarkBtn: document.getElementById('addBenchmarkBtn'),
  benchmarkTags: document.getElementById('benchmarkTags'),

  scatterInput: document.getElementById('scatterInput'),
  addScatterBtn: document.getElementById('addScatterBtn'),
  scatterTags: document.getElementById('scatterTags'),
};

function normalizeTicker(value) {
  return (value || '').trim().toUpperCase();
}

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return `${(Number(v) * 100).toFixed(2)}%`;
}

function fmt3(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '-';
  return Number(v).toFixed(3);
}

function setStatus(text, type = 'info') {
  el.status.textContent = text;
  el.status.style.color = type === 'error' ? '#e11d48' : '#64748b';
}

function destroyChart(name) {
  const chart = state.charts[name];
  if (chart) {
    chart.dispose();
    state.charts[name] = null;
  }
}

function renderChips(target, list, onRemove) {
  target.innerHTML = list
    .map((t) => `<span class="chip">${t}<button type="button" data-ticker="${t}" aria-label="Remove ${t}">×</button></span>`)
    .join('');

  target.querySelectorAll('button[data-ticker]').forEach((btn) => {
    btn.addEventListener('click', () => onRemove(btn.dataset.ticker));
  });
}

function addTicker(listName, raw) {
  const ticker = normalizeTicker(raw);
  if (!ticker) return false;

  const list = state[listName];
  if (!list.includes(ticker)) {
    list.push(ticker);
    return true;
  }
  return false;
}

function removeTicker(listName, ticker) {
  state[listName] = state[listName].filter((t) => t !== ticker);
}

function renderTable(target, rows, columns) {
  if (!rows || rows.length === 0) {
    target.innerHTML = '<p class="help-text" style="padding:10px;">No data available.</p>';
    return;
  }

  const head = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${c.format ? c.format(r[c.key]) : (r[c.key] ?? '')}</td>`).join('')}</tr>`)
    .join('');

  target.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderPortfolioMetrics(summary) {
  if (!summary || summary.annual_return === null) {
    el.portfolioMetrics.innerHTML = '<p class="help-text">No portfolio metrics available.</p>';
    return;
  }

  el.portfolioMetrics.innerHTML = [
    { label: 'Annual Return', value: fmtPct(summary.annual_return) },
    { label: 'Annual Volatility (Risk)', value: fmtPct(summary.annual_volatility) },
    { label: 'Sharpe Ratio', value: fmt3(summary.sharpe_ratio) },
  ]
    .map((item) => `<div class="metric-tile"><span>${item.label}</span><strong>${item.value}</strong></div>`)
    .join('');
}

function getCommonChartBase() {
  return {
    animationDuration: 450,
    grid: { left: 56, right: 22, top: 36, bottom: 52 },
    tooltip: { trigger: 'item' },
    textStyle: { fontFamily: 'Manrope, sans-serif' },
  };
}

function renderHoldingsChart(holdings) {
  destroyChart('holdings');
  if (!holdings || holdings.length === 0) return;

  const container = document.getElementById('holdingsChart');
  const chart = echarts.init(container);
  state.charts.holdings = chart;

  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const labels = sorted.map((r) => r.ticker);
  const data = sorted.map((r) => Number(r.weight) * 100);

  chart.setOption({
    ...getCommonChartBase(),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => `${v.toFixed(2)}%`,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLabel: { rotate: labels.length > 8 ? 35 : 0 },
    },
    yAxis: {
      type: 'value',
      name: 'Weight %',
      axisLabel: { formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#edf2f7' } },
    },
    series: [{
      type: 'bar',
      data,
      itemStyle: { color: '#f59e0b', borderRadius: [7, 7, 0, 0] },
      emphasis: { itemStyle: { color: '#d97706' } },
    }],
  });
}

function renderValueChart(valueHistory) {
  destroyChart('value');
  if (!valueHistory || valueHistory.length === 0) return;

  const container = document.getElementById('valueChart');
  const chart = echarts.init(container);
  state.charts.value = chart;

  const dates = valueHistory.map((r) => r.date);
  const keys = Object.keys(valueHistory[0]).filter((k) => k !== 'date');
  const palette = ['#f59e0b', '#0b5a7a', '#0f766e', '#7c3aed', '#ef4444'];

  const series = keys.map((k, i) => ({
    name: k,
    type: 'line',
    smooth: 0.25,
    showSymbol: false,
    lineStyle: { width: 2, color: palette[i % palette.length] },
    data: valueHistory.map((row) => Number(row[k])),
  }));

  chart.setOption({
    ...getCommonChartBase(),
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => `$${Number(v).toLocaleString()}`,
    },
    legend: { top: 4 },
    xAxis: {
      type: 'category',
      data: dates,
      boundaryGap: false,
      axisLabel: { hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      name: 'Value ($)',
      splitLine: { lineStyle: { color: '#edf2f7' } },
    },
    series,
  });
}

function classifyEfficient(metrics) {
  return metrics.map((m, i) => {
    const dominated = metrics.some((n, j) => {
      if (i === j) return false;
      const notWorseRisk = Number(n.annual_volatility) <= Number(m.annual_volatility);
      const notWorseReturn = Number(n.annual_return) >= Number(m.annual_return);
      const strictlyBetter =
        Number(n.annual_volatility) < Number(m.annual_volatility) ||
        Number(n.annual_return) > Number(m.annual_return);
      return notWorseRisk && notWorseReturn && strictlyBetter;
    });
    return { ...m, efficient: !dominated };
  });
}

function renderScatterChart(metrics) {
  destroyChart('scatter');
  if (!metrics || metrics.length === 0) return;

  const container = document.getElementById('scatterChart');
  const chart = echarts.init(container);
  state.charts.scatter = chart;

  const labeled = classifyEfficient(metrics);
  const toPoints = (rows) => rows.map((r) => [Number(r.annual_volatility), Number(r.annual_return), r.ticker]);

  const portfolio = labeled.filter((m) => m.ticker === 'YOUR PORTFOLIO');
  const efficient = labeled.filter((m) => m.ticker !== 'YOUR PORTFOLIO' && m.efficient);
  const dominated = labeled.filter((m) => m.ticker !== 'YOUR PORTFOLIO' && !m.efficient);

  chart.setOption({
    ...getCommonChartBase(),
    legend: { top: 4 },
    tooltip: {
      formatter: (params) => {
        const [risk, ret, ticker] = params.data;
        return `${ticker}<br/>Return: ${fmtPct(ret)}<br/>Risk: ${fmtPct(risk)}`;
      },
    },
    xAxis: {
      type: 'value',
      name: 'Annualized Volatility',
      axisLabel: { formatter: (v) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#edf2f7' } },
    },
    yAxis: {
      type: 'value',
      name: 'Annualized Return',
      axisLabel: { formatter: (v) => `${(v * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: '#edf2f7' } },
    },
    series: [
      {
        name: 'Non-efficient',
        type: 'scatter',
        symbolSize: 11,
        itemStyle: { color: '#9ca3af' },
        label: { show: true, formatter: (p) => p.data[2], position: 'top', color: '#64748b', fontSize: 10 },
        data: toPoints(dominated),
      },
      {
        name: 'Efficient',
        type: 'scatter',
        symbolSize: 12,
        itemStyle: { color: '#2563eb' },
        label: { show: true, formatter: (p) => p.data[2], position: 'top', color: '#1e40af', fontSize: 10 },
        data: toPoints(efficient),
      },
      {
        name: 'Your Portfolio',
        type: 'scatter',
        symbolSize: 16,
        itemStyle: { color: '#f59e0b', borderColor: '#b45309', borderWidth: 1 },
        label: { show: true, formatter: (p) => p.data[2], position: 'top', color: '#92400e', fontSize: 11, fontWeight: 700 },
        data: toPoints(portfolio),
      },
    ],
  });
}

async function loadCsvFiles(preferred) {
  const response = await fetch('/api/csv-files');
  const payload = await response.json();
  const files = payload.files || [];

  el.csvFile.innerHTML = '';
  files.forEach((f) => {
    const option = document.createElement('option');
    option.value = f;
    option.textContent = f;
    el.csvFile.appendChild(option);
  });

  if (preferred && files.includes(preferred)) {
    el.csvFile.value = preferred;
  }

  if (el.csvFile.value) {
    el.activeCsvPill.textContent = `CSV: ${el.csvFile.value}`;
  }
}

async function uploadCsv() {
  const file = el.csvUpload.files?.[0];
  if (!file) {
    el.uploadStatus.textContent = 'Select a CSV first.';
    return;
  }

  const form = new FormData();
  form.append('file', file);
  el.uploadStatus.textContent = 'Uploading...';

  try {
    const response = await fetch('/api/upload-csv', { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Upload failed');

    await loadCsvFiles(payload.uploaded);
    el.uploadStatus.textContent = `Uploaded: ${payload.uploaded}`;
    runAnalysis();
  } catch (error) {
    el.uploadStatus.textContent = `Upload error: ${error.message || error}`;
  }
}

function syncHeaderPills() {
  el.activeYearsPill.textContent = `${el.years.value || 5}Y Window`;
  if (el.csvFile.value) el.activeCsvPill.textContent = `CSV: ${el.csvFile.value}`;
}

async function runAnalysis() {
  if (!el.csvFile.value) {
    setStatus('Please select a CSV file before running analysis.', 'error');
    return;
  }

  syncHeaderPills();
  el.runBtn.disabled = true;
  setStatus('Running analysis...');

  const body = {
    csv_file: el.csvFile.value,
    portfolio_name: 'YOUR PORTFOLIO',
    years: Number(el.years.value) || 5,
    benchmarks: state.benchmarks,
    scatter_tickers: state.scatterTickers,
  };

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Analysis request failed');

    renderPortfolioMetrics(payload.portfolio_summary);
    renderHoldingsChart(payload.holdings_weights || []);
    renderValueChart(payload.value_history || []);
    renderScatterChart(payload.scatter_metrics || []);

    renderTable(el.benchmarkTable, payload.benchmark_metrics || [], [
      { key: 'ticker', label: 'Ticker' },
      { key: 'period_years', label: 'Years' },
      { key: 'annual_return', label: 'Return', format: fmtPct },
      { key: 'annual_volatility', label: 'Volatility', format: fmtPct },
      { key: 'sharpe_ratio', label: 'Sharpe', format: fmt3 },
    ]);

    renderTable(el.scatterTable, payload.scatter_metrics || [], [
      { key: 'ticker', label: 'Ticker' },
      { key: 'period_years', label: 'Years' },
      { key: 'annual_return', label: 'Return', format: fmtPct },
      { key: 'annual_volatility', label: 'Volatility', format: fmtPct },
      { key: 'sharpe_ratio', label: 'Sharpe', format: fmt3 },
    ]);

    setStatus(`Complete. Processed ${payload.trades_count} trades.`);
  } catch (error) {
    setStatus(error.message || String(error), 'error');
  } finally {
    el.runBtn.disabled = false;
  }
}

function wireChipHandlers() {
  const onRemoveBenchmark = (ticker) => {
    removeTicker('benchmarks', ticker);
    renderChips(el.benchmarkTags, state.benchmarks, onRemoveBenchmark);
    runAnalysis();
  };

  const onRemoveScatter = (ticker) => {
    removeTicker('scatterTickers', ticker);
    renderChips(el.scatterTags, state.scatterTickers, onRemoveScatter);
    runAnalysis();
  };

  renderChips(el.benchmarkTags, state.benchmarks, onRemoveBenchmark);
  renderChips(el.scatterTags, state.scatterTickers, onRemoveScatter);
}

function bindEvents() {
  el.uploadBtn.addEventListener('click', uploadCsv);
  el.runBtn.addEventListener('click', runAnalysis);

  el.addBenchmarkBtn.addEventListener('click', () => {
    if (addTicker('benchmarks', el.benchmarkInput.value)) {
      el.benchmarkInput.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.addScatterBtn.addEventListener('click', () => {
    if (addTicker('scatterTickers', el.scatterInput.value)) {
      el.scatterInput.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.benchmarkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addBenchmarkBtn.click();
    }
  });

  el.scatterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addScatterBtn.click();
    }
  });

  el.years.addEventListener('change', () => {
    syncHeaderPills();
    runAnalysis();
  });

  el.csvFile.addEventListener('change', () => {
    syncHeaderPills();
    runAnalysis();
  });

  window.addEventListener('resize', () => {
    Object.values(state.charts).forEach((chart) => {
      if (chart) chart.resize();
    });
  });
}

async function init() {
  try {
    const defaultsRes = await fetch('/api/defaults');
    const defaults = await defaultsRes.json();
    state.defaults = defaults;

    el.years.value = defaults.years || 5;
    state.benchmarks = (defaults.benchmarks || []).map(normalizeTicker).filter(Boolean);
    state.scatterTickers = (defaults.scatter_tickers || []).map(normalizeTicker).filter(Boolean);

    await loadCsvFiles(defaults.csv_file);
    syncHeaderPills();
    wireChipHandlers();
    bindEvents();
    await runAnalysis();
  } catch (error) {
    setStatus(`Initialization failed: ${error.message || error}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
