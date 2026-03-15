/* ===== Portfolio Dashboard App with Dual Portfolio Support ===== */

// API Configuration - supports both local and production environments
const API_BASE_URL = (() => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // Vercel frontend → call Render backend
    if (hostname.includes('vercel.app')) {
      return 'https://portfolio-doctor.onrender.com';
    }
    // Render serves both frontend and backend → use relative URLs
    if (hostname.includes('onrender.com')) {
      return '';  // Empty string = same origin (relative URLs)
    }
  }
  // Local development
  return 'http://localhost:8000';
})();

console.log(`[Portfolio Dashboard] Using API Base URL: ${API_BASE_URL || '(same origin)'}`);

const state = {
  charts: {
    value1: null,
    scatter1: null,
    holdings1: null,
    value2: null,
    scatter2: null,
    holdings2: null,
    dualValue: null,
    dualScatter: null,
    dualHoldings1: null,
    dualHoldings2: null,
    simulation: null,
  },
  defaults: null,
  // Per-portfolio state
  portfolio1: {
    file: null,
    name: 'Portfolio 1',
    data: null,
    benchmarks: [],
    scatterTickers: [],
  },
  portfolio2: {
    file: null,
    name: 'Portfolio 2',
    data: null,
    benchmarks: [],
    scatterTickers: [],
  },
  // Shared dual view state
  dualBenchmarks: [],
  dualScatterTickers: [],
  currentTab: 'dashboard',
  currentPortfolioView: '1', // '1' or 'dual'
  labResults: null,
};

// Color palette
const COLORS = {
  primary: '#3b82f6',
  green: '#10b981',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  red: '#ef4444',
  cyan: '#06b6d4',
  pink: '#ec4899',
  lime: '#84cc16',
  gray: '#64748b',
};

const CHART_COLORS = [COLORS.primary, COLORS.green, COLORS.orange, COLORS.purple, COLORS.red, COLORS.cyan, COLORS.pink, COLORS.lime];

function isTabletLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
}

function isPhoneLayout() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

function getChartLayoutConfig() {
  const phone = isPhoneLayout();
  const tablet = isTabletLayout();

  return {
    phone,
    tablet,
    areaHeight: phone ? 300 : 350,
    donutHeight: phone ? 300 : 350,
    smallDonutHeight: phone ? 190 : 180,
    scatterHeight: phone ? 320 : 350,
    simHeight: phone ? 320 : 400,
    tickAmount: phone ? 4 : 6,
    timeSeriesTicks: phone ? 4 : 10,
    rotateLabels: phone ? 0 : -45,
    showToolbar: !tablet,
    showScatterLabels: !tablet,
    showLegend: !phone,
  };
}

function isTouchInfoMode() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: none), (pointer: coarse)').matches;
}

// DOM Elements
const el = {
  // Upload overlay
  uploadOverlay: document.getElementById('uploadOverlay'),
  csvUpload1: document.getElementById('csvUpload1'),
  csvUpload2: document.getElementById('csvUpload2'),
  uploadBtn1: document.getElementById('uploadBtn1'),
  uploadBtn2: document.getElementById('uploadBtn2'),
  upload1Status: document.getElementById('upload1Status'),
  upload2Status: document.getElementById('upload2Status'),
  uploadCard1: document.getElementById('uploadCard1'),
  uploadCard2: document.getElementById('uploadCard2'),
  portfolioName1: document.getElementById('portfolioName1'),
  portfolioName2: document.getElementById('portfolioName2'),
  startAnalysisBtn: document.getElementById('startAnalysisBtn'),
  useSampleBtn1: document.getElementById('useSampleBtn1'),
  useSampleBtn2: document.getElementById('useSampleBtn2'),
  
  // Dashboard elements
  years: document.getElementById('years'),
  changeFilesBtn: document.getElementById('changeFilesBtn'),
  runBtn: document.getElementById('runBtn'),
  status: document.getElementById('status'),
  activeYearsPill: document.getElementById('activeYearsPill'),
  sampleBadge: document.getElementById('sampleBadge'),
  progressBar: document.getElementById('progressBar'),
  
  // Portfolio tabs
  portfolio1File: document.getElementById('portfolio1File'),
  portfolio2File: document.getElementById('portfolio2File'),
  portfolio2Tab: document.getElementById('portfolio2Tab'),
  portfolio1Content: document.getElementById('portfolio1Content'),
  portfolio2Content: document.getElementById('portfolio2Content'),
  
  // Portfolio 1 metrics
  metricReturn1: document.getElementById('metricReturn1'),
  metricVolatility1: document.getElementById('metricVolatility1'),
  metricSharpe1: document.getElementById('metricSharpe1'),
  metricSortino1: document.getElementById('metricSortino1'),
  metricMaxDrawdown1: document.getElementById('metricMaxDrawdown1'),
  metricBeta1: document.getElementById('metricBeta1'),
  metricVaR1: document.getElementById('metricVaR1'),
  metricDownside1: document.getElementById('metricDownside1'),
  benchmarkTable1: document.getElementById('benchmarkTable1'),
  scatterTable1: document.getElementById('scatterTable1'),
  benchmarkInput1: document.getElementById('benchmarkInput1'),
  addBenchmarkBtn1: document.getElementById('addBenchmarkBtn1'),
  benchmarkTags1: document.getElementById('benchmarkTags1'),
  scatterInput1: document.getElementById('scatterInput1'),
  addScatterBtn1: document.getElementById('addScatterBtn1'),
  scatterTags1: document.getElementById('scatterTags1'),
  
  // Portfolio 2 metrics
  metricReturn2: document.getElementById('metricReturn2'),
  metricVolatility2: document.getElementById('metricVolatility2'),
  metricSharpe2: document.getElementById('metricSharpe2'),
  metricSortino2: document.getElementById('metricSortino2'),
  metricMaxDrawdown2: document.getElementById('metricMaxDrawdown2'),
  metricBeta2: document.getElementById('metricBeta2'),
  metricVaR2: document.getElementById('metricVaR2'),
  metricDownside2: document.getElementById('metricDownside2'),
  benchmarkTable2: document.getElementById('benchmarkTable2'),
  scatterTable2: document.getElementById('scatterTable2'),
  benchmarkInput2: document.getElementById('benchmarkInput2'),
  addBenchmarkBtn2: document.getElementById('addBenchmarkBtn2'),
  benchmarkTags2: document.getElementById('benchmarkTags2'),
  scatterInput2: document.getElementById('scatterInput2'),
  addScatterBtn2: document.getElementById('addScatterBtn2'),
  scatterTags2: document.getElementById('scatterTags2'),
  
  // Compare view
  dualContent: document.getElementById('dualContent'),
  portfolioTabs: document.getElementById('portfolioTabs'),
  
  // Dual view metrics
  dualReturn1: document.getElementById('dualReturn1'),
  dualReturn2: document.getElementById('dualReturn2'),
  dualVolatility1: document.getElementById('dualVolatility1'),
  dualVolatility2: document.getElementById('dualVolatility2'),
  dualSortino1: document.getElementById('dualSortino1'),
  dualSortino2: document.getElementById('dualSortino2'),
  dualSharpe1: document.getElementById('dualSharpe1'),
  dualSharpe2: document.getElementById('dualSharpe2'),
  dualMaxDD1: document.getElementById('dualMaxDD1'),
  dualMaxDD2: document.getElementById('dualMaxDD2'),
  dualBeta1: document.getElementById('dualBeta1'),
  dualBeta2: document.getElementById('dualBeta2'),
  dualVaR1: document.getElementById('dualVaR1'),
  dualVaR2: document.getElementById('dualVaR2'),
  dualDownside1: document.getElementById('dualDownside1'),
  dualDownside2: document.getElementById('dualDownside2'),
  dualHoldingsLabel1: document.getElementById('dualHoldingsLabel1'),
  dualHoldingsLabel2: document.getElementById('dualHoldingsLabel2'),
  dualLegendName1: document.getElementById('dualLegendName1'),
  dualLegendName2: document.getElementById('dualLegendName2'),
  dualBenchmarkInput: document.getElementById('dualBenchmarkInput'),
  addDualBenchmarkBtn: document.getElementById('addDualBenchmarkBtn'),
  dualBenchmarkTags: document.getElementById('dualBenchmarkTags'),
  dualScatterInput: document.getElementById('dualScatterInput'),
  addDualScatterBtn: document.getElementById('addDualScatterBtn'),
  dualScatterTags: document.getElementById('dualScatterTags'),
  
  // Test Lab elements
  labPortfolioSelect: document.getElementById('labPortfolioSelect'),
  labPortfolio2Option: document.getElementById('labPortfolio2Option'),
  labPortfolioBadge: document.getElementById('labPortfolioBadge'),
  runLabBtn: document.getElementById('runLabBtn'),
  labStatus: document.getElementById('labStatus'),
  baselineReturn: document.getElementById('baselineReturn'),
  baselineVolatility: document.getElementById('baselineVolatility'),
  baselineSharpe: document.getElementById('baselineSharpe'),
  baselineSortino: document.getElementById('baselineSortino'),
  customTickerInput: document.getElementById('customTickerInput'),
  testCustomBtn: document.getElementById('testCustomBtn'),
  customResult: document.getElementById('customResult'),
  topRiskReducers: document.getElementById('topRiskReducers'),
  topReturnBoosters: document.getElementById('topReturnBoosters'),
  topSortinoImprovers: document.getElementById('topSortinoImprovers'),
  etfTable: document.getElementById('etfTable'),
  etfCount: document.getElementById('etfCount'),
  
  // Simulation elements
  simPortfolioSelect: document.getElementById('simPortfolioSelect'),
  simPortfolio2Option: document.getElementById('simPortfolio2Option'),
  simPortfolioBadge: document.getElementById('simPortfolioBadge'),
  runSimBtn: document.getElementById('runSimBtn'),
  simStatus: document.getElementById('simStatus'),
  simMuAnnual: document.getElementById('simMuAnnual'),
  simSigmaAnnual: document.getElementById('simSigmaAnnual'),
  simMuDaily: document.getElementById('simMuDaily'),
  simSigmaDaily: document.getElementById('simSigmaDaily'),
  simHistoryDays: document.getElementById('simHistoryDays'),
  simNumHoldings: document.getElementById('simNumHoldings'),
  simTopHoldings: document.getElementById('simTopHoldings'),
  simCurrentValue: document.getElementById('simCurrentValue'),
  spinnerSimChart: document.getElementById('spinnerSimChart'),
  simChart: document.getElementById('simChart'),
  simFinalMean: document.getElementById('simFinalMean'),
  simFinalMedian: document.getElementById('simFinalMedian'),
  simFinal5: document.getElementById('simFinal5'),
  simFinal95: document.getElementById('simFinal95'),
  simFinalMin: document.getElementById('simFinalMin'),
  simFinalMax: document.getElementById('simFinalMax'),
  infoSheet: document.getElementById('infoSheet'),
  infoSheetBackdrop: document.getElementById('infoSheetBackdrop'),
  infoSheetClose: document.getElementById('infoSheetClose'),
  infoSheetTitle: document.getElementById('infoSheetTitle'),
  infoSheetBody: document.getElementById('infoSheetBody'),
};

// ===== Utility Functions =====
function normalizeTicker(value) {
  return (value || '').trim().toUpperCase();
}

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${(Number(v) * 100).toFixed(2)}%`;
}

function fmtDelta(v, invert = false) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return { text: '—', class: 'neutral' };
  const pct = (Number(v) * 100).toFixed(2);
  const isPositive = invert ? Number(v) < 0 : Number(v) > 0;
  const sign = Number(v) > 0 ? '+' : '';
  return {
    text: `${sign}${pct}%`,
    class: Math.abs(Number(v)) < 0.0001 ? 'neutral' : (isPositive ? 'positive' : 'negative'),
  };
}

function fmt3(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(3);
}

function fmt2(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(2);
}

function fmtChartMonth(value) {
  if (!value) return '';
  const str = String(value);
  return str.length >= 7 ? str.slice(0, 7) : str;
}

function fmtDelta3(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return { text: '—', class: 'neutral' };
  const val = Number(v).toFixed(3);
  const sign = Number(v) > 0 ? '+' : '';
  return {
    text: `${sign}${val}`,
    class: Math.abs(Number(v)) < 0.001 ? 'neutral' : (Number(v) > 0 ? 'positive' : 'negative'),
  };
}

function setStatus(text, type = 'info', tradesInfo = null) {
  let statusHtml = text;
  if (tradesInfo) {
    statusHtml = `<span>${text}</span><span class="status-trades">${tradesInfo}</span>`;
  }
  el.status.innerHTML = statusHtml;
  el.status.className = 'status-bar';
  if (type === 'error') el.status.classList.add('error');
  if (type === 'success') el.status.classList.add('success');
}

function setLabStatus(text, type = 'info') {
  el.labStatus.textContent = text;
  el.labStatus.className = 'status-bar';
  if (type === 'error') el.labStatus.classList.add('error');
  if (type === 'success') el.labStatus.classList.add('success');
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    state.charts[name] = null;
  }
}

function truncateFilename(name, maxLen = 15) {
  if (!name) return '—';
  if (name.length <= maxLen) return name;
  return name.substring(0, maxLen - 3) + '...';
}

// ===== Loading Utilities =====
function showProgressBar(progress = null) {
  el.progressBar.classList.add('active');
  const fill = el.progressBar.querySelector('.progress-bar-track .progress-bar-fill');
  const text = el.progressBar.querySelector('.progress-bar-text');
  if (progress === null) {
    el.progressBar.classList.add('indeterminate');
    fill.style.width = '';
    if (text) text.textContent = '';
  } else {
    el.progressBar.classList.remove('indeterminate');
    const pct = Math.min(100, Math.max(0, Math.round(progress)));
    fill.style.width = `${pct}%`;
    if (text) text.textContent = `${pct}%`;
  }
}

function hideProgressBar() {
  el.progressBar.classList.remove('active', 'indeterminate');
  const fill = el.progressBar.querySelector('.progress-bar-track .progress-bar-fill');
  const text = el.progressBar.querySelector('.progress-bar-text');
  fill.style.width = '0%';
  if (text) text.textContent = '0%';
}

function showChartLoading(spinnerId) {
  const spinner = document.getElementById(spinnerId);
  if (spinner) spinner.classList.add('active');
}

function hideChartLoading(spinnerId) {
  const spinner = document.getElementById(spinnerId);
  if (spinner) spinner.classList.remove('active');
}

// Map of chart names to their spinner IDs
const chartSpinnerMap = {
  value1: 'spinnerValue1',
  scatter1: 'spinnerScatter1',
  holdings1: 'spinnerHoldings1',
  value2: 'spinnerValue2',
  scatter2: 'spinnerScatter2',
  holdings2: 'spinnerHoldings2',
  dualValue: 'spinnerDualValue',
  dualScatter: 'spinnerDualScatter',
  dualHoldings: 'spinnerDualHoldings',
};

// ===== Tab Navigation =====
function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update nav items
  document.querySelectorAll('[data-tab]').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
  
  // Resize charts if switching to dashboard
  if (tabName === 'dashboard') {
    setTimeout(() => {
      Object.values(state.charts).forEach((chart) => {
        if (chart) chart.resize();
      });
    }, 100);
  }
}

function switchPortfolioView(view) {
  state.currentPortfolioView = view;
  
  // Update tabs
  document.querySelectorAll('.portfolio-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.portfolio === view);
  });
  
  // Update content visibility
  el.portfolio1Content.classList.toggle('active', view === '1');
  if (el.portfolio2Content) el.portfolio2Content.classList.toggle('active', view === '2');
  
  // Resize charts
  setTimeout(() => {
    Object.values(state.charts).forEach((chart) => {
      if (chart) chart.resize();
    });
  }, 100);
}

function openInfoSheet(title, body) {
  if (!el.infoSheet || !el.infoSheetTitle || !el.infoSheetBody) return;
  el.infoSheetTitle.textContent = title || 'Info';
  el.infoSheetBody.textContent = body || '';
  el.infoSheet.classList.add('active');
  el.infoSheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeInfoSheet() {
  if (!el.infoSheet) return;
  el.infoSheet.classList.remove('active');
  el.infoSheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function getInfoPayload(node) {
  if (!node) return null;

  const directText = node.getAttribute('data-tooltip') || node.getAttribute('data-tooltip-text') || node.getAttribute('title');
  if (!directText) return null;

  let title = 'Info';
  if (node.classList.contains('metric-card')) {
    title = node.querySelector('.metric-label')?.textContent?.trim() || 'Metric details';
  } else if (node.classList.contains('section-info-icon')) {
    title = node.closest('.card-header')?.querySelector('h2')?.textContent?.replace('ⓘ', '').trim() || 'Section details';
  } else if (node.classList.contains('sim-formula-value')) {
    title = 'Simulation model';
  }

  return { title, body: directText };
}

function bindTouchInfoSheets() {
  if (!isTouchInfoMode()) return;

  document.querySelectorAll('.metric-card[data-tooltip], .section-info-icon[data-tooltip-text], .sim-formula-value[title]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      const payload = getInfoPayload(node);
      if (payload) openInfoSheet(payload.title, payload.body);
    });
  });

  if (el.infoSheetClose) {
    el.infoSheetClose.addEventListener('click', closeInfoSheet);
  }

  if (el.infoSheetBackdrop) {
    el.infoSheetBackdrop.addEventListener('click', closeInfoSheet);
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeInfoSheet();
  });
}

function bindPrimaryNavigation() {
  const handledPointerTabs = new WeakSet();

  document.querySelectorAll('[data-tab]').forEach((item) => {
    const activateTab = (event) => {
      event.preventDefault();
      switchTab(item.dataset.tab);
    };

    item.addEventListener('click', (event) => {
      if (handledPointerTabs.has(item)) {
        handledPointerTabs.delete(item);
        return;
      }
      activateTab(event);
    });

    if (item.classList.contains('mobile-nav-item')) {
      item.addEventListener('pointerup', (event) => {
        handledPointerTabs.add(item);
        activateTab(event);
      });
    }
  });
}

// ===== Chip/Tag Management =====
function renderChips(target, list, onRemove) {
  if (!list || list.length === 0) {
    target.innerHTML = '';
    return;
  }
  
  target.innerHTML = list
    .map((t) => `<span class="chip">${t}<button type="button" data-ticker="${t}" aria-label="Remove ${t}">×</button></span>`)
    .join('');

  target.querySelectorAll('button[data-ticker]').forEach((btn) => {
    btn.addEventListener('click', () => onRemove(btn.dataset.ticker));
  });
}

function addTicker(portfolioNum, listName, raw) {
  const ticker = normalizeTicker(raw);
  if (!ticker) return false;
  const list = state[`portfolio${portfolioNum}`][listName];
  if (!list.includes(ticker)) {
    list.push(ticker);
    return true;
  }
  return false;
}

function removeTicker(portfolioNum, listName, ticker) {
  state[`portfolio${portfolioNum}`][listName] = state[`portfolio${portfolioNum}`][listName].filter((t) => t !== ticker);
}

// ===== Table Rendering =====
function renderTable(target, rows, columns, allowHtml = false) {
  if (!rows || rows.length === 0) {
    target.innerHTML = '<p class="help-text">No data available.</p>';
    return;
  }

  const headerHtml = columns.map((col) => `<th>${col.label}</th>`).join('');
  const rowsHtml = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const val = row[col.key];
          const cls = col.colorClass ? col.colorClass(val) : '';
          const formatted = col.format ? col.format(val, row) : val;
          return `<td class="${cls}">${formatted}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  target.innerHTML = `<table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

// ===== Base Chart Options =====
function getBaseChartOptions() {
  const layout = getChartLayoutConfig();

  return {
    chart: {
      background: 'transparent',
      fontFamily: 'Inter, sans-serif',
      toolbar: { show: layout.showToolbar, tools: { download: true, selection: false, zoom: false, zoomin: false, zoomout: false, pan: false, reset: false } },
      animations: { enabled: true, speed: 400 },
    },
    theme: { mode: 'dark' },
    colors: CHART_COLORS,
    grid: { borderColor: '#2a2e38', strokeDashArray: 4 },
    xaxis: { labels: { style: { colors: '#94a3b8', fontSize: '11px' } }, axisBorder: { color: '#2a2e38' }, axisTicks: { color: '#2a2e38' } },
    yaxis: { labels: { style: { colors: '#94a3b8', fontSize: '11px' } } },
    tooltip: { theme: 'dark', style: { fontSize: '12px' } },
    legend: { labels: { colors: '#f1f5f9' }, fontSize: '12px', fontWeight: 500 },
    stroke: { curve: 'smooth', width: 2 },
  };
}

// ===== Chart Rendering =====
function renderValueChart(portfolioNum, data) {
  const layout = getChartLayoutConfig();
  const chartName = `value${portfolioNum}`;
  destroyChart(chartName);
  const container = document.getElementById(`valueChart${portfolioNum}`);
  
  if (!data || !data.value_history || data.value_history.length === 0) {
    container.innerHTML = '<p class="help-text">No value history data.</p>';
    return;
  }

  const portfolioName = data.config?.portfolio_name || 'My Portfolio';
  const categories = data.value_history.map((pt) => pt.date);
  const portfolioData = data.value_history.map((pt) => parseFloat((pt[portfolioName] || 0).toFixed(2)));

  const series = [{ name: portfolioName, data: portfolioData }];

  // Add benchmarks from value_history (each benchmark is a column)
  const benchmarks = data.config?.benchmarks || [];
  benchmarks.forEach((bench) => {
    const benchData = data.value_history.map((pt) => parseFloat((pt[bench] || 0).toFixed(2)));
    series.push({ name: bench, data: benchData });
  });

  const options = {
    ...getBaseChartOptions(),
    chart: { ...getBaseChartOptions().chart, type: 'area', height: layout.areaHeight },
    series,
    xaxis: {
      ...getBaseChartOptions().xaxis,
      categories,
      tickAmount: Math.min(layout.timeSeriesTicks, categories.length),
      labels: {
        ...getBaseChartOptions().xaxis.labels,
        rotate: layout.rotateLabels,
        hideOverlappingLabels: true,
        formatter: fmtChartMonth,
      },
    },
    yaxis: { ...getBaseChartOptions().yaxis, labels: { formatter: (v) => `$${v.toLocaleString()}` } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    tooltip: { ...getBaseChartOptions().tooltip, y: { formatter: (v) => `$${v.toLocaleString()}` } },
    legend: {
      ...getBaseChartOptions().legend,
      position: layout.phone ? 'bottom' : 'top',
      horizontalAlign: layout.phone ? 'center' : 'left',
      show: layout.showLegend || series.length <= 2,
    },
  };

  state.charts[chartName] = new ApexCharts(container, options);
  state.charts[chartName].render();
}

function renderHoldingsChart(portfolioNum, holdings, chartId = null) {
  const layout = getChartLayoutConfig();
  const chartName = chartId || `holdings${portfolioNum}`;
  destroyChart(chartName);
  const containerId = chartId ? chartId : `holdingsChart${portfolioNum}`;
  const container = document.getElementById(containerId);
  
  if (!holdings || holdings.length === 0) {
    container.innerHTML = '<p class="help-text">No holdings data.</p>';
    return;
  }

  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  
  // Group holdings < 5% into "Other"
  const threshold = 0.05;
  const mainHoldings = sorted.filter((r) => r.weight >= threshold);
  const smallHoldings = sorted.filter((r) => r.weight < threshold);
  
  let labels = mainHoldings.map((r) => r.ticker);
  let data = mainHoldings.map((r) => parseFloat((Number(r.weight) * 100).toFixed(2)));
  
  // Build "Other" breakdown for tooltip (top 4 + remaining as "Rest")
  let otherBreakdown = '';
  if (smallHoldings.length > 0) {
    const otherTotal = smallHoldings.reduce((sum, r) => sum + r.weight, 0);
    labels.push('Other');
    data.push(parseFloat((otherTotal * 100).toFixed(2)));
    
    // Build breakdown: show top 4, then "Rest" if more
    const topOthers = smallHoldings.slice(0, 4);
    const restOthers = smallHoldings.slice(4);
    
    otherBreakdown = topOthers.map(h => 
      `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${h.ticker}</span><span>${(h.weight * 100).toFixed(1)}%</span></div>`
    ).join('');
    
    if (restOthers.length > 0) {
      const restTotal = restOthers.reduce((sum, r) => sum + r.weight, 0);
      otherBreakdown += `<div style="display:flex;justify-content:space-between;gap:12px;color:#64748b;"><span>+${restOthers.length} more</span><span>${(restTotal * 100).toFixed(1)}%</span></div>`;
    }
  }
  
  // Generate gradient colors - diverse spectrum for better distinction
  const generateGradientColors = (count) => {
    const baseColors = [
      '#3b82f6', // Blue
      '#06b6d4', // Cyan
      '#10b981', // Emerald
      '#f59e0b', // Amber
      '#ef4444', // Red
      '#8b5cf6', // Violet
      '#ec4899', // Pink
      '#14b8a6', // Teal
      '#f97316', // Orange
      '#84cc16', // Lime
    ];
    
    if (count <= baseColors.length) {
      return baseColors.slice(0, count);
    }
    
    const colors = [];
    for (let i = 0; i < count; i++) {
      const idx = (i / count) * (baseColors.length - 1);
      colors.push(baseColors[Math.round(idx)]);
    }
    return colors;
  };
  
  const chartColors = generateGradientColors(labels.length);
  // Make "Other" gray
  if (smallHoldings.length > 0) {
    chartColors[chartColors.length - 1] = '#64748b';
  }

  const options = {
    ...getBaseChartOptions(),
    chart: { ...getBaseChartOptions().chart, type: 'donut', height: layout.donutHeight },
    series: data,
    labels: labels,
    colors: chartColors,
    stroke: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: '65%',
          labels: {
            show: true,
            name: { show: true, fontSize: '14px', color: '#f1f5f9' },
            value: {
              show: true,
              fontSize: '20px',
              fontWeight: 700,
              color: '#f1f5f9',
              formatter: (val) => `${parseFloat(val).toFixed(1)}%`,
            },
            total: { show: true, label: 'Total', color: '#94a3b8', formatter: () => '100%' },
          },
        },
      },
    },
    legend: {
      ...getBaseChartOptions().legend,
      position: 'bottom',
      horizontalAlign: 'center',
      fontSize: layout.phone ? '11px' : '12px',
    },
    dataLabels: { enabled: false },
    tooltip: {
      ...getBaseChartOptions().tooltip,
      custom: ({ series, seriesIndex, w }) => {
        const label = w.config.labels[seriesIndex];
        const value = series[seriesIndex].toFixed(1);
        
        if (label === 'Other' && otherBreakdown) {
          return `<div class="holdings-tooltip">
            <div class="holdings-tooltip-header"><strong>Other:</strong> ${value}%</div>
            <div class="holdings-tooltip-breakdown">${otherBreakdown}</div>
          </div>`;
        }
        
        return `<div class="holdings-tooltip">
          <div class="holdings-tooltip-header"><strong>${label}:</strong> ${value}%</div>
        </div>`;
      },
    },
  };

  state.charts[chartName] = new ApexCharts(container, options);
  state.charts[chartName].render();
}

function renderScatterChart(portfolioNum, data) {
  const layout = getChartLayoutConfig();
  const chartName = `scatter${portfolioNum}`;
  destroyChart(chartName);
  const container = document.getElementById(`scatterChart${portfolioNum}`);
  
  if (!data || !data.scatter_metrics || data.scatter_metrics.length === 0) {
    container.innerHTML = '<p class="help-text">No scatter data.</p>';
    return;
  }

  const portfolioName = data.config?.portfolio_name || 'My Portfolio';
  const points = data.scatter_metrics;
  const portfolio = points.find((p) => p.ticker === portfolioName);
  const others = points.filter((p) => p.ticker !== portfolioName);

  // Convert to numbers (ApexCharts needs numeric values for proper axis scaling)
  const makePoint = (p) => ({
    x: parseFloat(((p.annual_volatility || 0) * 100).toFixed(2)),
    y: parseFloat(((p.annual_return || 0) * 100).toFixed(2)),
    label: p.ticker,
  });

  const seriesData = [
    {
      name: portfolioName,
      data: portfolio ? [makePoint(portfolio)] : [],
    },
    {
      name: 'Comparisons',
      data: others.map(makePoint),
    },
  ];

  const options = {
    ...getBaseChartOptions(),
    chart: { ...getBaseChartOptions().chart, type: 'scatter', height: layout.scatterHeight },
    series: seriesData,
    colors: [COLORS.primary, COLORS.orange],
    stroke: { width: 0 },
    xaxis: {
      type: 'numeric',
      title: { text: 'Volatility (%)', style: { color: '#94a3b8' } },
      tickAmount: layout.tickAmount,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, formatter: (v) => `${parseFloat(v).toFixed(0)}%` },
      axisBorder: { color: '#2a2e38' },
      axisTicks: { color: '#2a2e38' },
    },
    yaxis: {
      title: { text: 'Annual Return (%)', style: { color: '#94a3b8' } },
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, formatter: (v) => `${parseFloat(v).toFixed(0)}%` },
    },
    grid: { borderColor: '#2a2e38', strokeDashArray: 4 },
    markers: { size: layout.phone ? [10, 8] : [14, 10], strokeWidth: 0, hover: { size: layout.phone ? 12 : 16 } },
    dataLabels: {
      enabled: layout.showScatterLabels,
      formatter: (val, opts) => {
        const point = opts.w.config.series[opts.seriesIndex].data[opts.dataPointIndex];
        return point?.label || '';
      },
      offsetY: -12,
      style: { fontSize: layout.phone ? '9px' : '10px', fontWeight: 600, colors: ['#f1f5f9'] },
      background: { enabled: true, foreColor: '#1a1d24', padding: 4, borderRadius: 2, borderWidth: 0, opacity: 0.8 },
    },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const point = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div class="scatter-tooltip"><strong>${point.label}</strong><br/>Return: ${point.y.toFixed(2)}%<br/>Vol: ${point.x.toFixed(2)}%</div>`;
      },
    },
    legend: { show: !layout.phone, position: 'bottom', horizontalAlign: 'center', labels: { colors: '#f1f5f9' } },
  };

  state.charts[chartName] = new ApexCharts(container, options);
  state.charts[chartName].render();
}

// ===== Upload Handling =====
async function uploadFile(fileInput, portfolioNum) {
  const file = fileInput.files?.[0];
  if (!file) return null;

  const form = new FormData();
  form.append('file', file);

  try {
    const response = await fetch(`${API_BASE_URL}/api/upload-csv`, { method: 'POST', body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Upload failed');
    return payload.uploaded;
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

function updateUploadUI() {
  const file1 = state.portfolio1.file;
  const file2 = state.portfolio2.file;
  
  // Update upload card states
  el.uploadCard1.classList.toggle('has-file', !!file1);
  el.upload1Status.textContent = file1 ? `✓ ${truncateFilename(file1, 25)}` : 'No file selected';
  
  el.uploadCard2.classList.toggle('has-file', !!file2);
  el.upload2Status.textContent = file2 ? `✓ ${truncateFilename(file2, 25)}` : 'No file selected';
  
  // Enable start button if at least portfolio 1 is uploaded
  el.startAnalysisBtn.disabled = !file1;
  
  // Update file badges in portfolio tabs
  el.portfolio1File.textContent = truncateFilename(file1, 12);
  el.portfolio2File.textContent = truncateFilename(file2, 12);
  
  // Show/hide portfolio 2 tab
  el.portfolio2Tab.style.display = file2 ? 'flex' : 'none';
  
  // Update lab portfolio selector with names
  el.labPortfolio2Option.disabled = !file2;
  const labSelect = el.labPortfolioSelect;
  if (labSelect.options[0]) labSelect.options[0].textContent = state.portfolio1.name || 'Portfolio 1';
  if (labSelect.options[1]) labSelect.options[1].textContent = state.portfolio2.name || 'Portfolio 2';
  
  // Update simulation portfolio selector with names
  if (el.simPortfolio2Option) el.simPortfolio2Option.disabled = !file2;
  const simSelect = el.simPortfolioSelect;
  if (simSelect && simSelect.options[0]) simSelect.options[0].textContent = state.portfolio1.name || 'Portfolio 1';
  if (simSelect && simSelect.options[1]) simSelect.options[1].textContent = state.portfolio2.name || 'Portfolio 2';
  
  // Show/hide sample badge
  if (el.sampleBadge) {
    el.sampleBadge.style.display = state.portfolio1.isSample ? 'inline-flex' : 'none';
  }
}

// ===== Main Analysis =====
async function runAnalysisForPortfolio(portfolioNum) {
  const portfolioState = state[`portfolio${portfolioNum}`];
  if (!portfolioState.file) return null;
  
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csv_file: portfolioState.file,
      years: Number(el.years.value) || 5,
      risk_free_rate: 0.037,
      benchmarks: portfolioState.benchmarks,
      scatter_tickers: portfolioState.scatterTickers,
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || 'Analysis failed');
  
  portfolioState.data = payload;
  return payload;
}

function renderPortfolioMetrics(portfolioNum, data) {
  const pm = data.portfolio_summary;
  if (!pm) return;
  
  document.getElementById(`metricReturn${portfolioNum}`).textContent = fmtPct(pm.annual_return);
  document.getElementById(`metricVolatility${portfolioNum}`).textContent = fmtPct(pm.annual_volatility);
  document.getElementById(`metricSharpe${portfolioNum}`).textContent = fmt3(pm.sharpe_ratio);
  document.getElementById(`metricSortino${portfolioNum}`).textContent = fmt3(pm.sortino_ratio);
  document.getElementById(`metricMaxDrawdown${portfolioNum}`).textContent = fmtPct(pm.max_drawdown);
  document.getElementById(`metricBeta${portfolioNum}`).textContent = fmt2(pm.beta);
  document.getElementById(`metricVaR${portfolioNum}`).textContent = fmtPct(pm.var_95);
  document.getElementById(`metricDownside${portfolioNum}`).textContent = fmtPct(pm.downside_deviation);
}

function renderBenchmarkTable(portfolioNum, data) {
  const target = document.getElementById(`benchmarkTable${portfolioNum}`);
  const rows = data.benchmark_metrics || [];

  const columns = [
    { label: 'Asset', key: 'ticker', format: (v) => v },
    { label: 'Return', key: 'annual_return', format: fmtPct },
    { label: 'Volatility', key: 'annual_volatility', format: fmtPct },
    { label: 'Down Vol', key: 'downside_deviation', format: fmtPct },
    { label: 'Sortino', key: 'sortino_ratio', format: fmt3 },
    { label: 'Sharpe', key: 'sharpe_ratio', format: fmt3 },
    { label: 'Max DD', key: 'max_drawdown', format: fmtPct },
    { label: 'Beta', key: 'beta', format: fmt2 },
    { label: 'VaR 95%', key: 'var_95', format: fmtPct },
  ];

  renderTable(target, rows, columns);
}

function renderScatterTable(portfolioNum, data) {
  const target = document.getElementById(`scatterTable${portfolioNum}`);
  const rows = data.scatter_metrics || [];

  const columns = [
    { label: 'Asset', key: 'ticker', format: (v) => v },
    { label: 'Return', key: 'annual_return', format: fmtPct },
    { label: 'Volatility', key: 'annual_volatility', format: fmtPct },
    { label: 'Down Vol', key: 'downside_deviation', format: fmtPct },
    { label: 'Sortino', key: 'sortino_ratio', format: fmt3 },
    { label: 'Sharpe', key: 'sharpe_ratio', format: fmt3 },
    { label: 'Max DD', key: 'max_drawdown', format: fmtPct },
    { label: 'Beta', key: 'beta', format: fmt2 },
    { label: 'VaR 95%', key: 'var_95', format: fmtPct },
  ];

  renderTable(target, rows, columns);
}

async function runAnalysis(showProgress = false) {
  if (!state.portfolio1.file) {
    setStatus('Please upload at least Portfolio 1 CSV.', 'error');
    return;
  }

  setStatus('Running analysis...', 'info');
  if (showProgress) showProgressBar(0);
  el.runBtn.disabled = true;
  el.runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

  // Show loading spinners next to chart titles
  const hasTwoPortfolios = state.portfolio2.file != null;
  if (hasTwoPortfolios) {
    showChartLoading('spinnerDualValue');
    showChartLoading('spinnerDualHoldings');
    showChartLoading('spinnerDualScatter');
  } else {
    showChartLoading('spinnerValue1');
    showChartLoading('spinnerHoldings1');
    showChartLoading('spinnerScatter1');
  }

  try {
    if (showProgress) showProgressBar(20);
    // Analyze portfolio 1
    const data1 = await runAnalysisForPortfolio(1);
    if (showProgress) showProgressBar(50);
    
    if (hasTwoPortfolios) {
      // Dual portfolio mode - analyze both and show combined view
      const data2 = await runAnalysisForPortfolio(2);
      if (showProgress) showProgressBar(80);
      
      // Hide tabs and individual portfolio content
      el.portfolioTabs.style.display = 'none';
      el.portfolio1Content.classList.remove('active');
      if (el.portfolio2Content) el.portfolio2Content.classList.remove('active');
      el.dualContent.classList.add('active');
      
      // Render dual view
      if (data1 && data2) {
        renderDualMetrics(data1, data2);
        renderDualValueChart(data1, data2);
        hideChartLoading('spinnerDualValue');
        
        renderDualHoldingsCharts(data1, data2);
        hideChartLoading('spinnerDualHoldings');
        
        renderDualBenchmarkTable(data1, data2);
        
        renderDualScatterChart(data1, data2);
        hideChartLoading('spinnerDualScatter');
        
        renderDualScatterTable(data1, data2);
        
        if (showProgress) showProgressBar(100);
        
        // Build trades info string
        const trades1 = data1.trades_count || 0;
        const trades2 = data2.trades_count || 0;
        const tradesInfo = `${state.portfolio1.name}: ${trades1} trades · ${state.portfolio2.name}: ${trades2} trades`;
        setStatus('Analysis complete!', 'success', tradesInfo);
      } else {
        setStatus('Analysis complete!', 'success');
      }
    } else {
      // Single portfolio mode
      el.portfolioTabs.style.display = 'none'; // Hide tabs for single portfolio too
      el.portfolio1Content.classList.add('active');
      el.dualContent.classList.remove('active');
      
      if (data1) {
        if (showProgress) showProgressBar(70);
        renderPortfolioMetrics(1, data1);
        
        renderValueChart(1, data1);
        hideChartLoading('spinnerValue1');
        
        renderHoldingsChart(1, data1.holdings_weights || []);
        hideChartLoading('spinnerHoldings1');
        
        renderBenchmarkTable(1, data1);
        
        renderScatterChart(1, data1);
        hideChartLoading('spinnerScatter1');
        
        renderScatterTable(1, data1);
        
        if (showProgress) showProgressBar(100);
        
        const tradesInfo = `${data1.trades_count || 0} trades analyzed`;
        setStatus('Analysis complete!', 'success', tradesInfo);
      } else {
        setStatus('Analysis complete!', 'success');
      }
    }
  } catch (error) {
    setStatus(`Error: ${error.message || error}`, 'error');
    // Hide all chart loading spinners on error
    hideChartLoading('spinnerValue1');
    hideChartLoading('spinnerHoldings1');
    hideChartLoading('spinnerScatter1');
    hideChartLoading('spinnerDualValue');
    hideChartLoading('spinnerDualHoldings');
    hideChartLoading('spinnerDualScatter');
  } finally {
    // Hide progress bar if it was shown
    if (showProgress) {
      setTimeout(() => hideProgressBar(), 300);
    }
    el.runBtn.disabled = false;
    el.runBtn.innerHTML = '<i class="fas fa-play"></i> Run Analysis';
  }
}

// ===== Dual View Rendering Functions =====
function renderDualMetrics(data1, data2) {
  const pm1 = data1.portfolio_summary;
  const pm2 = data2.portfolio_summary;
  
  // Update holdings labels and legend with custom names
  const displayName1 = state.portfolio1.name;
  const displayName2 = state.portfolio2.name;
  if (el.dualHoldingsLabel1) el.dualHoldingsLabel1.textContent = displayName1;
  if (el.dualHoldingsLabel2) el.dualHoldingsLabel2.textContent = displayName2;
  if (el.dualLegendName1) el.dualLegendName1.textContent = displayName1;
  if (el.dualLegendName2) el.dualLegendName2.textContent = displayName2;
  
  if (pm1) {
    el.dualReturn1.textContent = fmtPct(pm1.annual_return);
    el.dualVolatility1.textContent = fmtPct(pm1.annual_volatility);
    el.dualSortino1.textContent = fmt3(pm1.sortino_ratio);
    el.dualSharpe1.textContent = fmt3(pm1.sharpe_ratio);
    el.dualMaxDD1.textContent = fmtPct(pm1.max_drawdown);
    el.dualBeta1.textContent = fmt2(pm1.beta);
    el.dualVaR1.textContent = fmtPct(pm1.var_95);
    el.dualDownside1.textContent = fmtPct(pm1.downside_deviation);
  }
  
  if (pm2) {
    el.dualReturn2.textContent = fmtPct(pm2.annual_return);
    el.dualVolatility2.textContent = fmtPct(pm2.annual_volatility);
    el.dualSortino2.textContent = fmt3(pm2.sortino_ratio);
    el.dualSharpe2.textContent = fmt3(pm2.sharpe_ratio);
    el.dualMaxDD2.textContent = fmtPct(pm2.max_drawdown);
    el.dualBeta2.textContent = fmt2(pm2.beta);
    el.dualVaR2.textContent = fmtPct(pm2.var_95);
    el.dualDownside2.textContent = fmtPct(pm2.downside_deviation);
  }
}

function renderDualValueChart(data1, data2) {
  const layout = getChartLayoutConfig();
  destroyChart('dualValue');
  const container = document.getElementById('dualValueChart');
  
  if (!data1?.value_history || !data2?.value_history) {
    container.innerHTML = '<p class="help-text">No value history data.</p>';
    return;
  }

  // Backend portfolio names (for data access)
  const backendName1 = data1.config?.portfolio_name || 'Portfolio 1';
  const backendName2 = data2.config?.portfolio_name || 'Portfolio 2';
  
  // User-defined display names
  const displayName1 = state.portfolio1.name;
  const displayName2 = state.portfolio2.name;

  // Create date-indexed maps for both portfolios
  const data1Map = new Map(data1.value_history.map(pt => [pt.date, pt]));
  const data2Map = new Map(data2.value_history.map(pt => [pt.date, pt]));
  
  // Get all unique dates from both portfolios, sorted
  const allDates = [...new Set([
    ...data1.value_history.map(pt => pt.date),
    ...data2.value_history.map(pt => pt.date)
  ])].sort();

  // Build aligned series with forward-fill for missing values
  let lastVal1 = 0, lastVal2 = 0;
  const benchLastVals = {};
  const allBenchmarks = [...new Set([...(data1.config?.benchmarks || []), ...(data2.config?.benchmarks || [])])];
  allBenchmarks.forEach(b => benchLastVals[b] = 0);
  
  const series1Data = [];
  const series2Data = [];
  const benchData = allBenchmarks.map(() => []);

  allDates.forEach(date => {
    const pt1 = data1Map.get(date);
    const pt2 = data2Map.get(date);
    
    // Portfolio 1 - use value if exists, otherwise forward-fill
    if (pt1 && pt1[backendName1] != null) {
      lastVal1 = pt1[backendName1];
    }
    series1Data.push(parseFloat(lastVal1.toFixed(2)));
    
    // Portfolio 2 - use value if exists, otherwise forward-fill
    if (pt2 && pt2[backendName2] != null) {
      lastVal2 = pt2[backendName2];
    }
    series2Data.push(parseFloat(lastVal2.toFixed(2)));
    
    // Benchmarks based on Portfolio 1's cash flows only
    allBenchmarks.forEach((bench, i) => {
      if (pt1 && pt1[bench] != null) {
        benchLastVals[bench] = pt1[bench];
      }
      benchData[i].push(parseFloat(benchLastVals[bench].toFixed(2)));
    });
  });

  const series = [
    { name: displayName1, data: series1Data },
    { name: displayName2, data: series2Data },
  ];
  
  allBenchmarks.forEach((bench, i) => {
    series.push({ name: bench, data: benchData[i] });
  });

  const options = {
    ...getBaseChartOptions(),
    chart: { ...getBaseChartOptions().chart, type: 'area', height: layout.areaHeight },
    series,
    colors: [COLORS.primary, COLORS.purple, COLORS.green, COLORS.orange, COLORS.cyan],
    xaxis: {
      ...getBaseChartOptions().xaxis,
      categories: allDates,
      tickAmount: Math.min(layout.timeSeriesTicks, allDates.length),
      labels: {
        ...getBaseChartOptions().xaxis.labels,
        rotate: layout.rotateLabels,
        hideOverlappingLabels: true,
        formatter: fmtChartMonth,
      },
    },
    yaxis: { ...getBaseChartOptions().yaxis, labels: { formatter: (v) => `$${v.toLocaleString()}` } },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 90, 100] } },
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    tooltip: { ...getBaseChartOptions().tooltip, y: { formatter: (v) => `$${v.toLocaleString()}` } },
    legend: {
      show: layout.showLegend || series.length <= 3,
      position: 'bottom',
      horizontalAlign: 'center',
      labels: { colors: '#f1f5f9' },
    },
  };

  state.charts.dualValue = new ApexCharts(container, options);
  state.charts.dualValue.render();
}

function renderDualHoldingsCharts(data1, data2) {
  // Render smaller pie charts for both portfolios
  renderSmallHoldingsChart('dualHoldings1', data1.holdings_weights || [], COLORS.primary);
  renderSmallHoldingsChart('dualHoldings2', data2.holdings_weights || [], COLORS.purple);
}

function renderSmallHoldingsChart(chartId, holdings, accentColor) {
  const layout = getChartLayoutConfig();
  destroyChart(chartId);
  const containerId = chartId.includes('1') ? 'dualHoldingsChart1' : 'dualHoldingsChart2';
  const container = document.getElementById(containerId);
  
  if (!container) return;
  if (!holdings || holdings.length === 0) {
    container.innerHTML = '<p class="help-text">No holdings</p>';
    return;
  }

  const sorted = [...holdings].sort((a, b) => b.weight - a.weight);
  const threshold = 0.05;
  const mainHoldings = sorted.filter((r) => r.weight >= threshold);
  const smallHoldings = sorted.filter((r) => r.weight < threshold);
  
  let labels = mainHoldings.map((r) => r.ticker);
  let data = mainHoldings.map((r) => parseFloat((Number(r.weight) * 100).toFixed(2)));
  
  // Build "Other" breakdown for tooltip
  let otherBreakdown = '';
  if (smallHoldings.length > 0) {
    const otherTotal = smallHoldings.reduce((sum, r) => sum + r.weight, 0);
    labels.push('Other');
    data.push(parseFloat((otherTotal * 100).toFixed(2)));
    
    const topOthers = smallHoldings.slice(0, 4);
    const restOthers = smallHoldings.slice(4);
    
    otherBreakdown = topOthers.map(h => 
      `<div style="display:flex;justify-content:space-between;gap:12px;"><span>${h.ticker}</span><span>${(h.weight * 100).toFixed(1)}%</span></div>`
    ).join('');
    
    if (restOthers.length > 0) {
      const restTotal = restOthers.reduce((sum, r) => sum + r.weight, 0);
      otherBreakdown += `<div style="display:flex;justify-content:space-between;gap:12px;color:#64748b;"><span>+${restOthers.length} more</span><span>${(restTotal * 100).toFixed(1)}%</span></div>`;
    }
  }
  
  const baseColors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
  const chartColors = labels.map((_, i) => baseColors[i % baseColors.length]);
  if (smallHoldings.length > 0) {
    chartColors[chartColors.length - 1] = '#64748b';
  }

  const options = {
    chart: { type: 'donut', height: layout.smallDonutHeight, background: 'transparent' },
    series: data,
    labels: labels,
    colors: chartColors,
    stroke: { show: false },
    plotOptions: {
      pie: {
        donut: {
          size: '60%',
          labels: {
            show: true,
            name: { show: false },
            value: { show: true, fontSize: '14px', fontWeight: 700, color: '#f1f5f9', formatter: (val) => `${parseFloat(val).toFixed(0)}%` },
            total: { show: true, label: '', color: '#94a3b8', formatter: () => '' },
          },
        },
      },
    },
    legend: { show: false },
    dataLabels: { enabled: false },
    tooltip: {
      theme: 'dark',
      custom: ({ series, seriesIndex, w }) => {
        const label = w.config.labels[seriesIndex];
        const value = series[seriesIndex].toFixed(1);
        
        if (label === 'Other' && otherBreakdown) {
          return `<div class="holdings-tooltip">
            <div class="holdings-tooltip-header"><strong>Other:</strong> ${value}%</div>
            <div class="holdings-tooltip-breakdown">${otherBreakdown}</div>
          </div>`;
        }
        
        return `<div class="holdings-tooltip">
          <div class="holdings-tooltip-header"><strong>${label}:</strong> ${value}%</div>
        </div>`;
      },
    },
  };

  state.charts[chartId] = new ApexCharts(container, options);
  state.charts[chartId].render();
}

function renderDualBenchmarkTable(data1, data2) {
  const target = document.getElementById('dualBenchmarkTable');
  
  // Get custom names
  const displayName1 = state.portfolio1.name;
  const displayName2 = state.portfolio2.name;
  
  // Combine metrics from both portfolios and benchmarks
  const pm1 = data1.portfolio_summary;
  const pm2 = data2.portfolio_summary;
  
  const rows = [];
  
  // Add Portfolio 1
  if (pm1) {
    rows.push({ ticker: displayName1, ...pm1, _highlight: 'p1' });
  }
  
  // Add Portfolio 2
  if (pm2) {
    rows.push({ ticker: displayName2, ...pm2, _highlight: 'p2' });
  }
  
  // Add benchmark metrics (deduplicated)
  const benchmarks1 = data1.benchmark_metrics || [];
  const benchmarks2 = data2.benchmark_metrics || [];
  const seenTickers = new Set([displayName1, displayName2, data1.config?.portfolio_name, data2.config?.portfolio_name]);
  
  [...benchmarks1, ...benchmarks2].forEach((row) => {
    if (!seenTickers.has(row.ticker)) {
      seenTickers.add(row.ticker);
      rows.push(row);
    }
  });

  const columns = [
    { label: 'Asset', key: 'ticker', format: (v, row) => {
      if (row._highlight === 'p1') return `<span style="color: var(--accent-blue); font-weight: 600;">${v}</span>`;
      if (row._highlight === 'p2') return `<span style="color: var(--accent-purple); font-weight: 600;">${v}</span>`;
      return v;
    }},
    { label: 'Return', key: 'annual_return', format: fmtPct },
    { label: 'Volatility', key: 'annual_volatility', format: fmtPct },
    { label: 'Down Vol', key: 'downside_deviation', format: fmtPct },
    { label: 'Sortino', key: 'sortino_ratio', format: fmt3 },
    { label: 'Sharpe', key: 'sharpe_ratio', format: fmt3 },
    { label: 'Max DD', key: 'max_drawdown', format: fmtPct },
    { label: 'Beta', key: 'beta', format: fmt2 },
    { label: 'VaR 95%', key: 'var_95', format: fmtPct },
  ];

  renderTable(target, rows, columns, true);
}

function renderDualScatterChart(data1, data2) {
  const layout = getChartLayoutConfig();
  destroyChart('dualScatter');
  const container = document.getElementById('dualScatterChart');
  
  if (!data1?.scatter_metrics && !data2?.scatter_metrics) {
    container.innerHTML = '<p class="help-text">No scatter data.</p>';
    return;
  }

  // Get custom names and backend names
  const displayName1 = state.portfolio1.name;
  const displayName2 = state.portfolio2.name;
  const portfolioName1 = data1.config?.portfolio_name || 'Portfolio 1';
  const portfolioName2 = data2.config?.portfolio_name || 'Portfolio 2';
  
  const makePoint = (p) => ({
    x: parseFloat(((p.annual_volatility || 0) * 100).toFixed(2)),
    y: parseFloat(((p.annual_return || 0) * 100).toFixed(2)),
    label: p.ticker,
  });

  // Find portfolio points
  const points1 = data1.scatter_metrics || [];
  const points2 = data2.scatter_metrics || [];
  
  const portfolio1 = points1.find((p) => p.ticker === portfolioName1);
  const portfolio2 = points2.find((p) => p.ticker === portfolioName2);
  
  // Combine other points (deduplicated)
  const seenTickers = new Set([portfolioName1, portfolioName2]);
  const others = [];
  [...points1, ...points2].forEach((p) => {
    if (!seenTickers.has(p.ticker)) {
      seenTickers.add(p.ticker);
      others.push(p);
    }
  });

  const seriesData = [
    {
      name: displayName1,
      data: portfolio1 ? [makePoint({ ...portfolio1, ticker: displayName1 })] : [],
    },
    {
      name: displayName2,
      data: portfolio2 ? [makePoint({ ...portfolio2, ticker: displayName2 })] : [],
    },
    {
      name: 'Comparisons',
      data: others.map(makePoint),
    },
  ];

  const options = {
    ...getBaseChartOptions(),
    chart: { ...getBaseChartOptions().chart, type: 'scatter', height: layout.scatterHeight },
    series: seriesData,
    colors: [COLORS.primary, COLORS.purple, COLORS.orange],
    stroke: { width: 0 },
    xaxis: {
      type: 'numeric',
      title: { text: 'Volatility (%)', style: { color: '#94a3b8' } },
      tickAmount: layout.tickAmount,
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, formatter: (v) => `${parseFloat(v).toFixed(0)}%` },
      axisBorder: { color: '#2a2e38' },
      axisTicks: { color: '#2a2e38' },
    },
    yaxis: {
      title: { text: 'Annual Return (%)', style: { color: '#94a3b8' } },
      labels: { style: { colors: '#94a3b8', fontSize: '11px' }, formatter: (v) => `${parseFloat(v).toFixed(0)}%` },
    },
    grid: { borderColor: '#2a2e38', strokeDashArray: 4 },
    markers: { size: layout.phone ? [10, 10, 7] : [14, 14, 8], strokeWidth: 0, hover: { size: layout.phone ? 12 : 16 } },
    dataLabels: {
      enabled: layout.showScatterLabels,
      formatter: (val, opts) => {
        const point = opts.w.config.series[opts.seriesIndex].data[opts.dataPointIndex];
        return point?.label || '';
      },
      offsetY: -12,
      style: { fontSize: layout.phone ? '9px' : '10px', fontWeight: 600, colors: ['#f1f5f9'] },
      background: { enabled: true, foreColor: '#1a1d24', padding: 4, borderRadius: 2, borderWidth: 0, opacity: 0.8 },
    },
    tooltip: {
      custom: ({ seriesIndex, dataPointIndex, w }) => {
        const point = w.config.series[seriesIndex].data[dataPointIndex];
        return `<div class="scatter-tooltip"><strong>${point.label}</strong><br/>Return: ${point.y.toFixed(2)}%<br/>Vol: ${point.x.toFixed(2)}%</div>`;
      },
    },
    legend: { show: !layout.phone, position: 'bottom', horizontalAlign: 'center', labels: { colors: '#f1f5f9' } },
  };

  state.charts.dualScatter = new ApexCharts(container, options);
  state.charts.dualScatter.render();
}

function renderDualScatterTable(data1, data2) {
  const target = document.getElementById('dualScatterTable');
  
  // Get custom names and backend names
  const displayName1 = state.portfolio1.name;
  const displayName2 = state.portfolio2.name;
  const portfolioName1 = data1.config?.portfolio_name || 'Portfolio 1';
  const portfolioName2 = data2.config?.portfolio_name || 'Portfolio 2';
  
  const rows = [];
  const seenTickers = new Set();
  
  // Add portfolio 1 row
  const points1 = data1.scatter_metrics || [];
  const p1 = points1.find((p) => p.ticker === portfolioName1);
  if (p1) {
    rows.push({ ...p1, ticker: displayName1, _highlight: 'p1' });
    seenTickers.add(portfolioName1);
  }
  
  // Add portfolio 2 row
  const points2 = data2.scatter_metrics || [];
  const p2 = points2.find((p) => p.ticker === portfolioName2);
  if (p2) {
    rows.push({ ...p2, ticker: displayName2, _highlight: 'p2' });
    seenTickers.add(portfolioName2);
  }
  
  // Add other scatter points
  [...points1, ...points2].forEach((p) => {
    if (!seenTickers.has(p.ticker)) {
      seenTickers.add(p.ticker);
      rows.push(p);
    }
  });

  const columns = [
    { label: 'Asset', key: 'ticker', format: (v, row) => {
      if (row._highlight === 'p1') return `<span style="color: var(--accent-blue); font-weight: 600;">${v}</span>`;
      if (row._highlight === 'p2') return `<span style="color: var(--accent-purple); font-weight: 600;">${v}</span>`;
      return v;
    }},
    { label: 'Return', key: 'annual_return', format: fmtPct },
    { label: 'Volatility', key: 'annual_volatility', format: fmtPct },
    { label: 'Down Vol', key: 'downside_deviation', format: fmtPct },
    { label: 'Sortino', key: 'sortino_ratio', format: fmt3 },
    { label: 'Sharpe', key: 'sharpe_ratio', format: fmt3 },
    { label: 'Max DD', key: 'max_drawdown', format: fmtPct },
    { label: 'Beta', key: 'beta', format: fmt2 },
    { label: 'VaR 95%', key: 'var_95', format: fmtPct },
  ];

  renderTable(target, rows, columns, true);
}

// ===== Test Lab =====
async function runLabSimulation() {
  const portfolioNum = el.labPortfolioSelect.value;
  const portfolioState = state[`portfolio${portfolioNum}`];
  
  if (!portfolioState.file) {
    setLabStatus(`Portfolio ${portfolioNum} CSV not uploaded.`, 'error');
    return;
  }

  setLabStatus('Running simulation on 50 ETFs...', 'info');
  el.runLabBtn.disabled = true;
  el.runLabBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Simulating...';
  el.labPortfolioBadge.textContent = portfolioState.name || `Portfolio ${portfolioNum}`;

  try {
    const response = await fetch(`${API_BASE_URL}/api/testlab/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv_file: portfolioState.file,
        years: Number(el.years.value) || 5,
        risk_free_rate: 0.037,
        investment_amount: 1000,
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Simulation failed');

    state.labResults = payload;
    renderLabResults(payload);
    setLabStatus(`Simulation complete! Analyzed ${payload.all_results?.length || payload.etf_count || 0} ETFs.`, 'success');
  } catch (error) {
    setLabStatus(`Error: ${error.message || error}`, 'error');
  } finally {
    el.runLabBtn.disabled = false;
    el.runLabBtn.innerHTML = '<i class="fas fa-vial"></i> Run Simulation';
  }
}

function renderLabResults(payload) {
  // Baseline metrics
  const baseline = payload.baseline;
  if (baseline) {
    el.baselineReturn.textContent = fmtPct(baseline.annual_return);
    el.baselineVolatility.textContent = fmtPct(baseline.annual_volatility);
    el.baselineSharpe.textContent = fmt3(baseline.sharpe_ratio);
    el.baselineSortino.textContent = fmt3(baseline.sortino_ratio);
  }

  const results = payload.all_results || [];
  
  // Top 5 Risk Reducers (lowest volatility delta)
  const riskReducers = [...results].sort((a, b) => a.volatility_delta - b.volatility_delta).slice(0, 5);
  renderRankingList(el.topRiskReducers, riskReducers, 'volatility_delta', true);

  // Top 5 Return Boosters (highest return delta)
  const returnBoosters = [...results].sort((a, b) => b.return_delta - a.return_delta).slice(0, 5);
  renderRankingList(el.topReturnBoosters, returnBoosters, 'return_delta');

  // Top 5 Sortino Improvers (highest sortino delta)
  const sortinoImprovers = [...results].sort((a, b) => b.sortino_delta - a.sortino_delta).slice(0, 5);
  renderRankingList(el.topSortinoImprovers, sortinoImprovers, 'sortino_delta');

  // Full table
  renderLabTable(results);
  el.etfCount.textContent = `${results.length} ETFs analyzed`;
}

function renderRankingList(target, items, deltaKey, invert = false) {
  if (!items || items.length === 0) {
    target.innerHTML = '<p class="help-text">No data</p>';
    return;
  }

  target.innerHTML = items
    .map((item, i) => {
      const delta = item[deltaKey];
      const deltaFormatted = deltaKey.includes('sharpe') || deltaKey.includes('sortino')
        ? fmtDelta3(delta)
        : fmtDelta(delta, invert);
      return `
        <div class="ranking-item">
          <span class="ranking-position">${i + 1}</span>
          <div class="ranking-info">
            <span class="ranking-ticker">${item.ticker}</span>
            <span class="ranking-name">${item.name || ''}</span>
          </div>
          <span class="ranking-delta ${deltaFormatted.class}">${deltaFormatted.text}</span>
        </div>
      `;
    })
    .join('');
}

function renderLabTable(results) {
  const columns = [
    { label: 'Ticker', key: 'ticker', format: (v) => v },
    { label: 'Name', key: 'name', format: (v) => v || '—' },
    { label: 'New Return', key: 'new_return', format: fmtPct },
    { label: 'Δ Return', key: 'return_delta', format: (v) => fmtDelta(v).text, colorClass: (v) => fmtDelta(v).class },
    { label: 'New Vol', key: 'new_volatility', format: fmtPct },
    { label: 'Δ Vol', key: 'volatility_delta', format: (v) => fmtDelta(v, true).text, colorClass: (v) => fmtDelta(v, true).class },
    { label: 'New Sortino', key: 'new_sortino', format: fmt3 },
    { label: 'Δ Sortino', key: 'sortino_delta', format: (v) => fmtDelta3(v).text, colorClass: (v) => fmtDelta3(v).class },
    { label: 'New Sharpe', key: 'new_sharpe', format: fmt3 },
    { label: 'Δ Sharpe', key: 'sharpe_delta', format: (v) => fmtDelta3(v).text, colorClass: (v) => fmtDelta3(v).class },
  ];

  renderTable(el.etfTable, results, columns);
}

async function testCustomTicker() {
  const portfolioNum = el.labPortfolioSelect.value;
  const portfolioState = state[`portfolio${portfolioNum}`];
  const ticker = normalizeTicker(el.customTickerInput.value);
  
  if (!ticker) {
    el.customResult.innerHTML = '<p class="help-text">Please enter a ticker symbol.</p>';
    el.customResult.classList.add('active');
    return;
  }

  if (!portfolioState.file) {
    el.customResult.innerHTML = '<p class="help-text" style="color: var(--accent-red);">Please upload a CSV file first.</p>';
    el.customResult.classList.add('active');
    return;
  }

  el.testCustomBtn.disabled = true;
  el.testCustomBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
  el.customResult.innerHTML = '<p class="help-text">Calculating impact...</p>';
  el.customResult.classList.add('active');

  try {
    const response = await fetch(`${API_BASE_URL}/api/testlab/test-ticker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv_file: portfolioState.file,
        years: Number(el.years.value) || 5,
        risk_free_rate: 0.037,
        investment_amount: 1000,
        ticker: ticker,
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || 'Test failed');

    const returnDelta = fmtDelta(payload.delta.return_delta);
    const volDelta = fmtDelta(payload.delta.volatility_delta, true);
    const sharpeDelta = fmtDelta3(payload.delta.sharpe_delta);
    const sortinoDelta = fmtDelta3(payload.delta.sortino_delta);

    el.customResult.innerHTML = `
      <h3 style="margin-bottom: 16px; color: var(--text-primary);">
        <i class="fas fa-chart-line"></i> Impact of Adding $1,000 in ${ticker}
      </h3>
      <div class="custom-result-grid">
        <div class="result-item">
          <span class="result-item-label">Annual Return</span>
          <div class="result-item-values">
            <span class="result-value">${fmtPct(payload.with_ticker.annual_return)}</span>
            <span class="result-delta ${returnDelta.class}">${returnDelta.text}</span>
          </div>
        </div>
        <div class="result-item">
          <span class="result-item-label">Volatility (Risk)</span>
          <div class="result-item-values">
            <span class="result-value">${fmtPct(payload.with_ticker.annual_volatility)}</span>
            <span class="result-delta ${volDelta.class}">${volDelta.text}</span>
          </div>
        </div>
        <div class="result-item">
          <span class="result-item-label">Sortino Ratio</span>
          <div class="result-item-values">
            <span class="result-value">${fmt3(payload.with_ticker.sortino_ratio)}</span>
            <span class="result-delta ${sortinoDelta.class}">${sortinoDelta.text}</span>
          </div>
        </div>
        <div class="result-item">
          <span class="result-item-label">Sharpe Ratio</span>
          <div class="result-item-values">
            <span class="result-value">${fmt3(payload.with_ticker.sharpe_ratio)}</span>
            <span class="result-delta ${sharpeDelta.class}">${sharpeDelta.text}</span>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    el.customResult.innerHTML = `<p class="help-text" style="color: var(--accent-red);">Error: ${error.message}</p>`;
  } finally {
    el.testCustomBtn.disabled = false;
    el.testCustomBtn.innerHTML = '<i class="fas fa-calculator"></i> Calculate Impact';
  }
}

// ===== Monte Carlo Simulation =====
async function runGBMSimulation() {
  const portfolioNum = el.simPortfolioSelect?.value || '1';
  const portfolioState = portfolioNum === '2' ? state.portfolio2 : state.portfolio1;
  
  if (!portfolioState.file) {
    showSimStatus('Please upload a portfolio first', 'error');
    return;
  }
  
  // Update badge
  if (el.simPortfolioBadge) {
    el.simPortfolioBadge.textContent = portfolioState.name;
  }
  
  showSimStatus('Running Monte Carlo simulation...', 'loading');
  el.runSimBtn.disabled = true;
  el.runSimBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Simulating...';
  
  if (el.spinnerSimChart) el.spinnerSimChart.classList.add('active');
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv_file: portfolioState.file,
        portfolio_name: portfolioState.name,
        history_years: 5,
        simulation_years: 5,
        num_simulations: 300,
      }),
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Simulation failed');
    }
    
    const data = await response.json();
    
    // Update GBM parameters display
    if (el.simMuAnnual) el.simMuAnnual.textContent = fmtPct(data.parameters.mu_annual);
    if (el.simSigmaAnnual) el.simSigmaAnnual.textContent = fmtPct(data.parameters.sigma_annual);
    if (el.simMuDaily) el.simMuDaily.textContent = `${(data.parameters.mu_daily * 100).toFixed(4)}%`;
    if (el.simSigmaDaily) el.simSigmaDaily.textContent = `${(data.parameters.sigma_daily * 100).toFixed(4)}%`;
    if (el.simHistoryDays) el.simHistoryDays.textContent = data.parameters.history_days.toLocaleString();
    if (el.simNumHoldings) el.simNumHoldings.textContent = data.parameters.num_holdings;
    if (el.simCurrentValue) el.simCurrentValue.textContent = `$${data.current_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Update final values
    if (el.simFinalMean) el.simFinalMean.textContent = `$${data.final_values.mean.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (el.simFinalMedian) el.simFinalMedian.textContent = `$${data.final_values.median.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (el.simFinal5) el.simFinal5.textContent = `$${data.final_values.percentile_5.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (el.simFinal95) el.simFinal95.textContent = `$${data.final_values.percentile_95.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (el.simFinalMin) el.simFinalMin.textContent = `$${data.final_values.min.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (el.simFinalMax) el.simFinalMax.textContent = `$${data.final_values.max.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    
    // Render simulation chart
    renderSimulationChart(data.simulation, data.current_value);
    
    showSimStatus('Simulation complete!', 'success');
    
  } catch (error) {
    console.error('Simulation error:', error);
    showSimStatus(`Error: ${error.message}`, 'error');
  } finally {
    el.runSimBtn.disabled = false;
    el.runSimBtn.innerHTML = '<i class="fas fa-play"></i> Run Simulation';
    if (el.spinnerSimChart) el.spinnerSimChart.classList.remove('active');
  }
}

function showSimStatus(message, type = 'info') {
  if (!el.simStatus) return;
  el.simStatus.className = `status-bar ${type}`;
  
  let icon = 'info-circle';
  if (type === 'success') icon = 'check-circle';
  else if (type === 'error') icon = 'exclamation-circle';
  else if (type === 'loading') icon = 'spinner fa-spin';
  
  el.simStatus.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
  el.simStatus.style.display = 'flex';
  
  if (type === 'success') {
    setTimeout(() => {
      el.simStatus.style.display = 'none';
    }, 3000);
  }
}

function renderSimulationChart(simData, currentValue) {
  destroyChart('simulation');
  
  const container = el.simChart;
  if (!container) return;
  
  // Add sample paths first (so they're behind), then mean and CI bounds
  const numSamplePaths = Math.min(25, simData.paths.length);
  const series = [];
  
  // Sample paths - all named with underscore to hide from legend
  for (let i = 0; i < numSamplePaths; i++) {
    series.push({
      name: `_path${i}`,
      data: simData.dates.map((date, j) => ({
        x: new Date(date).getTime(),
        y: simData.paths[i][j],
      })),
    });
  }
  
  // Add mean and CI lines on top
  series.push({
    name: '5th Percentile',
    data: simData.dates.map((date, i) => ({
      x: new Date(date).getTime(),
      y: simData.lower_95[i],
    })),
  });
  series.push({
    name: '95th Percentile',
    data: simData.dates.map((date, i) => ({
      x: new Date(date).getTime(),
      y: simData.upper_95[i],
    })),
  });
  series.push({
    name: 'Mean Projection',
    data: simData.dates.map((date, i) => ({
      x: new Date(date).getTime(),
      y: simData.mean[i],
    })),
  });
  
  // Track which series are the key ones (not sample paths)
  const keySeriesIndices = [numSamplePaths, numSamplePaths + 1, numSamplePaths + 2];
  
  const options = {
    chart: {
      type: 'line',
      height: getChartLayoutConfig().simHeight,
      background: 'transparent',
      toolbar: { show: !getChartLayoutConfig().tablet, tools: { download: true, zoom: true, pan: true, reset: true } },
      animations: { enabled: false },
    },
    series: series,
    colors: [
      ...Array(numSamplePaths).fill('#3b82f6'), // Paths - blue
      '#f59e0b', // Lower 5 - orange
      '#10b981', // Upper 95 - green
      '#ef4444', // Mean - red
    ],
    stroke: {
      width: [...Array(numSamplePaths).fill(1), 2, 2, 3],
      curve: 'smooth',
      dashArray: [...Array(numSamplePaths).fill(0), 5, 5, 0],
    },
    fill: {
      opacity: [...Array(numSamplePaths).fill(0.12), 0.8, 0.8, 1],
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px' },
        datetimeFormatter: { year: 'yyyy', month: "MMM 'yy" },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#94a3b8', fontSize: '11px' },
        formatter: (val) => `$${(val / 1000).toFixed(0)}k`,
      },
    },
    grid: {
      borderColor: '#2a2e38',
      strokeDashArray: 3,
    },
    legend: {
      show: !getChartLayoutConfig().phone,
      position: getChartLayoutConfig().phone ? 'bottom' : 'top',
      horizontalAlign: getChartLayoutConfig().phone ? 'center' : 'left',
      labels: { colors: '#94a3b8' },
      itemMargin: { horizontal: 10 },
      showForSingleSeries: true,
      customLegendItems: ['5th Percentile', '95th Percentile', 'Mean Projection'],
      markers: {
        width: 10,
        height: 10,
        radius: 2,
        fillColors: ['#f59e0b', '#10b981', '#ef4444'],
      },
    },
    tooltip: {
      theme: 'dark',
      shared: true,
      intersect: false,
      x: { format: 'MMM yyyy' },
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        // Only show the 3 key series (5th, 95th, mean)
        const p5 = series[numSamplePaths] ? series[numSamplePaths][dataPointIndex] : null;
        const p95 = series[numSamplePaths + 1] ? series[numSamplePaths + 1][dataPointIndex] : null;
        const mean = series[numSamplePaths + 2] ? series[numSamplePaths + 2][dataPointIndex] : null;
        const date = w.globals.seriesX[numSamplePaths][dataPointIndex];
        const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        const fmt = (v) => v ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';
        
        return `<div class="sim-tooltip">
          <div class="sim-tooltip-date">${dateStr}</div>
          <div class="sim-tooltip-row"><span class="sim-tooltip-dot" style="background:#f59e0b"></span>5th Percentile: <strong>${fmt(p5)}</strong></div>
          <div class="sim-tooltip-row"><span class="sim-tooltip-dot" style="background:#10b981"></span>95th Percentile: <strong>${fmt(p95)}</strong></div>
          <div class="sim-tooltip-row"><span class="sim-tooltip-dot" style="background:#ef4444"></span>Mean: <strong>${fmt(mean)}</strong></div>
        </div>`;
      },
    },
    annotations: {
      yaxis: [{
        y: currentValue,
        borderColor: '#8b5cf6',
        strokeDashArray: 4,
        label: {
          borderColor: '#8b5cf6',
          style: { color: '#fff', background: '#8b5cf6' },
          text: `Current: $${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        },
      }],
    },
  };
  
  state.charts.simulation = new ApexCharts(container, options);
  state.charts.simulation.render();
}

// ===== Chip Handlers =====
function wireChipHandlers() {
  // Portfolio 1 benchmarks
  const onRemoveBenchmark1 = (ticker) => {
    removeTicker(1, 'benchmarks', ticker);
    renderChips(el.benchmarkTags1, state.portfolio1.benchmarks, onRemoveBenchmark1);
    runAnalysis();
  };
  
  const onRemoveScatter1 = (ticker) => {
    removeTicker(1, 'scatterTickers', ticker);
    renderChips(el.scatterTags1, state.portfolio1.scatterTickers, onRemoveScatter1);
    runAnalysis();
  };

  // Portfolio 2 benchmarks
  const onRemoveBenchmark2 = (ticker) => {
    removeTicker(2, 'benchmarks', ticker);
    renderChips(el.benchmarkTags2, state.portfolio2.benchmarks, onRemoveBenchmark2);
    runAnalysis();
  };
  
  const onRemoveScatter2 = (ticker) => {
    removeTicker(2, 'scatterTickers', ticker);
    renderChips(el.scatterTags2, state.portfolio2.scatterTickers, onRemoveScatter2);
    runAnalysis();
  };

  // Dual view chips (show combined from both portfolios)
  const onRemoveDualBenchmark = (ticker) => {
    removeTicker(1, 'benchmarks', ticker);
    removeTicker(2, 'benchmarks', ticker);
    wireChipHandlers();
    runAnalysis();
  };
  
  const onRemoveDualScatter = (ticker) => {
    removeTicker(1, 'scatterTickers', ticker);
    removeTicker(2, 'scatterTickers', ticker);
    wireChipHandlers();
    runAnalysis();
  };

  // Combine benchmarks from both portfolios for dual view
  const combinedBenchmarks = [...new Set([...state.portfolio1.benchmarks, ...state.portfolio2.benchmarks])];
  const combinedScatter = [...new Set([...state.portfolio1.scatterTickers, ...state.portfolio2.scatterTickers])];

  renderChips(el.benchmarkTags1, state.portfolio1.benchmarks, onRemoveBenchmark1);
  renderChips(el.scatterTags1, state.portfolio1.scatterTickers, onRemoveScatter1);
  renderChips(el.benchmarkTags2, state.portfolio2.benchmarks, onRemoveBenchmark2);
  renderChips(el.scatterTags2, state.portfolio2.scatterTickers, onRemoveScatter2);
  
  // Render dual view tags if elements exist
  if (el.dualBenchmarkTags) {
    renderChips(el.dualBenchmarkTags, combinedBenchmarks, onRemoveDualBenchmark);
  }
  if (el.dualScatterTags) {
    renderChips(el.dualScatterTags, combinedScatter, onRemoveDualScatter);
  }
}

// ===== Event Bindings =====
function bindEvents() {
  bindPrimaryNavigation();

  // Portfolio tab navigation
  document.querySelectorAll('.portfolio-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchPortfolioView(tab.dataset.portfolio);
    });
  });

  // Upload buttons
  el.uploadBtn1.addEventListener('click', () => el.csvUpload1.click());
  el.uploadBtn2.addEventListener('click', () => el.csvUpload2.click());

  el.csvUpload1.addEventListener('change', async () => {
    const filename = await uploadFile(el.csvUpload1, 1);
    if (filename) {
      state.portfolio1.file = filename;
      state.portfolio1.isSample = false; // Reset sample flag when uploading custom file
      updateUploadUI();
    }
  });

  el.csvUpload2.addEventListener('change', async () => {
    const filename = await uploadFile(el.csvUpload2, 2);
    if (filename) {
      state.portfolio2.file = filename;
      updateUploadUI();
    }
  });

  // Start analysis button
  el.startAnalysisBtn.addEventListener('click', () => {
    // Capture portfolio names
    state.portfolio1.name = el.portfolioName1.value.trim() || 'Portfolio 1';
    state.portfolio2.name = el.portfolioName2.value.trim() || 'Portfolio 2';
    
    el.uploadOverlay.classList.remove('active');
    runAnalysis();
  });

  // Use Sample Portfolio buttons (for each portfolio)
  async function generateSampleForPortfolio(portfolioNum) {
    const btn = portfolioNum === 1 ? el.useSampleBtn1 : el.useSampleBtn2;
    const statusEl = portfolioNum === 1 ? el.upload1Status : el.upload2Status;
    const nameInput = portfolioNum === 1 ? el.portfolioName1 : el.portfolioName2;
    const portfolio = portfolioNum === 1 ? state.portfolio1 : state.portfolio2;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    statusEl.textContent = 'Generating sample portfolio...';
    
    try {
      const years = Number(el.years.value) || 5;
      const response = await fetch(`${API_BASE_URL}/api/sample-portfolio/generate?years=${years}`, { method: 'POST' });
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.detail || 'Failed to generate sample');
      
      // Set up the portfolio with the sample
      portfolio.file = result.filename;
      portfolio.name = `Sample Portfolio ${portfolioNum}`;
      portfolio.isSample = true;
      nameInput.value = `Sample Portfolio ${portfolioNum}`;
      
      updateUploadUI();
    } catch (error) {
      console.error('Sample generation failed:', error);
      statusEl.textContent = 'Failed to generate sample';
      statusEl.style.color = '#ef4444';
      setTimeout(() => {
        statusEl.style.color = '';
        updateUploadUI();
      }, 3000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-flask"></i> Use Sample';
    }
  }
  
  el.useSampleBtn1.addEventListener('click', () => generateSampleForPortfolio(1));
  el.useSampleBtn2.addEventListener('click', () => generateSampleForPortfolio(2));

  // Change files button
  el.changeFilesBtn.addEventListener('click', () => {
    // Restore names to inputs when reopening
    el.portfolioName1.value = state.portfolio1.name;
    el.portfolioName2.value = state.portfolio2.name;
    el.uploadOverlay.classList.add('active');
  });

  // Run analysis button (initial CSV load - show progress bar)
  el.runBtn.addEventListener('click', () => runAnalysis(true));

  // Portfolio 1 benchmark input
  el.addBenchmarkBtn1.addEventListener('click', () => {
    if (addTicker(1, 'benchmarks', el.benchmarkInput1.value)) {
      el.benchmarkInput1.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.benchmarkInput1.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addBenchmarkBtn1.click();
    }
  });

  el.addScatterBtn1.addEventListener('click', () => {
    if (addTicker(1, 'scatterTickers', el.scatterInput1.value)) {
      el.scatterInput1.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.scatterInput1.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addScatterBtn1.click();
    }
  });

  // Portfolio 2 benchmark input
  el.addBenchmarkBtn2.addEventListener('click', () => {
    if (addTicker(2, 'benchmarks', el.benchmarkInput2.value)) {
      el.benchmarkInput2.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.benchmarkInput2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addBenchmarkBtn2.click();
    }
  });

  el.addScatterBtn2.addEventListener('click', () => {
    if (addTicker(2, 'scatterTickers', el.scatterInput2.value)) {
      el.scatterInput2.value = '';
      wireChipHandlers();
      runAnalysis();
    }
  });

  el.scatterInput2.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.addScatterBtn2.click();
    }
  });

  // Dual view benchmark input (adds to both portfolios)
  if (el.addDualBenchmarkBtn) {
    el.addDualBenchmarkBtn.addEventListener('click', () => {
      const ticker = normalizeTicker(el.dualBenchmarkInput.value);
      if (ticker) {
        addTicker(1, 'benchmarks', ticker);
        addTicker(2, 'benchmarks', ticker);
        el.dualBenchmarkInput.value = '';
        wireChipHandlers();
        runAnalysis();
      }
    });

    el.dualBenchmarkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.addDualBenchmarkBtn.click();
      }
    });
  }

  // Dual view scatter input (adds to both portfolios)
  if (el.addDualScatterBtn) {
    el.addDualScatterBtn.addEventListener('click', () => {
      const ticker = normalizeTicker(el.dualScatterInput.value);
      if (ticker) {
        addTicker(1, 'scatterTickers', ticker);
        addTicker(2, 'scatterTickers', ticker);
        el.dualScatterInput.value = '';
        wireChipHandlers();
        runAnalysis();
      }
    });

    el.dualScatterInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        el.addDualScatterBtn.click();
      }
    });
  }

  // Years selector
  el.years.addEventListener('change', () => {
    el.activeYearsPill.textContent = `${el.years.value || 5}Y`;
    runAnalysis();
  });

  // Test Lab events
  el.runLabBtn.addEventListener('click', runLabSimulation);
  el.testCustomBtn.addEventListener('click', testCustomTicker);
  el.customTickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      testCustomTicker();
    }
  });
  
  // Simulation events
  if (el.runSimBtn) {
    el.runSimBtn.addEventListener('click', runGBMSimulation);
  }
  if (el.simPortfolioSelect) {
    el.simPortfolioSelect.addEventListener('change', () => {
      const num = el.simPortfolioSelect.value;
      const pState = num === '2' ? state.portfolio2 : state.portfolio1;
      if (el.simPortfolioBadge) el.simPortfolioBadge.textContent = pState.name;
    });
  }

  // Window resize - ApexCharts handles resize automatically
  // but we can force redraw if needed
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      Object.values(state.charts).forEach((chart) => {
        if (chart && typeof chart.windowResizeHandler === 'function') {
          chart.windowResizeHandler();
        }
      });
    }, 100);
  });
}

// ===== Initialization =====
async function init() {
  try {
    // Load defaults
    const defaultsRes = await fetch(`${API_BASE_URL}/api/defaults`);
    const defaults = await defaultsRes.json();
    state.defaults = defaults;

    el.years.value = defaults.years || 5;
    el.activeYearsPill.textContent = `${defaults.years || 5}Y`;
    
    // Set default benchmarks and scatter tickers for both portfolios
    const defaultBenchmarks = (defaults.benchmarks || []).map(normalizeTicker).filter(Boolean);
    const defaultScatter = (defaults.scatter_tickers || []).map(normalizeTicker).filter(Boolean);
    
    state.portfolio1.benchmarks = [...defaultBenchmarks];
    state.portfolio1.scatterTickers = [...defaultScatter];
    state.portfolio2.benchmarks = [...defaultBenchmarks];
    state.portfolio2.scatterTickers = [...defaultScatter];

    document.querySelectorAll('.metric-card[data-tooltip], .section-info-icon[data-tooltip-text], .sim-formula-value[title]').forEach((node) => {
      const fallbackText = node.getAttribute('data-tooltip') || node.getAttribute('data-tooltip-text') || node.getAttribute('title');
      if (fallbackText && !node.getAttribute('aria-label')) {
        node.setAttribute('aria-label', fallbackText);
      }
      if (fallbackText && !node.getAttribute('title')) {
        node.setAttribute('title', fallbackText);
      }
    });

    wireChipHandlers();
    bindEvents();
    bindTouchInfoSheets();
    
    // Show upload overlay (no default CSV)
    el.uploadOverlay.classList.add('active');
    
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

document.addEventListener('DOMContentLoaded', init);
