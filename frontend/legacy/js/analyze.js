let currentTicker  = null;
let currentData    = null;  
let currentPeriod  = '1M';
let isLoading      = false;

const tickerInput     = document.getElementById('tickerInput');
const analyzeBtn      = document.getElementById('analyzeBtn');
const analyzeBtnText  = document.getElementById('analyzeBtnText');
const analyzeBtnSpinner = document.getElementById('analyzeBtnSpinner');
const searchError     = document.getElementById('searchError');
const resultsPanel    = document.getElementById('resultsPanel');
const loadingOverlay  = document.getElementById('loadingOverlay');
const loadingText     = document.getElementById('loadingText');

function showError(msg) {
  searchError.textContent = msg;
  searchError.classList.remove('hidden');
}

function hideError() {
  searchError.classList.add('hidden');
}

function setLoading(state, message = 'Fetching stock data...') {
  isLoading = state;
  loadingText.textContent = message;
  if (state) {
    loadingOverlay.classList.remove('hidden');
    analyzeBtn.disabled = true;
    analyzeBtnText.classList.add('hidden');
    analyzeBtnSpinner.classList.remove('hidden');
  } else {
    loadingOverlay.classList.add('hidden');
    analyzeBtn.disabled = false;
    analyzeBtnText.classList.remove('hidden');
    analyzeBtnSpinner.classList.add('hidden');
  }
}

function formatPrice(n) {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCap(mcMillion) {
  if (!mcMillion) return '—';
  if (mcMillion >= 1_000_000) return `$${(mcMillion / 1_000_000).toFixed(2)}T`;
  if (mcMillion >= 1_000)     return `$${(mcMillion / 1_000).toFixed(2)}B`;
  return `$${mcMillion.toFixed(0)}M`;
}

function renderStockData(ticker, data) {
  const { quote, profile, financials } = data;

  document.getElementById('resTicker').textContent      = ticker.toUpperCase();
  document.getElementById('resCompanyName').textContent = profile.name || ticker;
  document.getElementById('resExchange').textContent    = profile.exchange || '—';
  document.getElementById('resPrice').textContent       = formatPrice(quote.price);
  document.getElementById('resUpdated').textContent     = 'Updated ' + new Date().toLocaleTimeString();

  const changeEl = document.getElementById('resChange');
  const sign = quote.changePct >= 0 ? '+' : '';
  changeEl.textContent  = `${sign}$${quote.change} (${sign}${quote.changePct}%)`;
  changeEl.className    = 'results-change ' + (quote.changePct >= 0 ? 'positive' : 'negative');

  //Metrics
  document.getElementById('mOpen').textContent      = formatPrice(quote.open);
  document.getElementById('mHigh').textContent      = formatPrice(quote.high);
  document.getElementById('mLow').textContent       = formatPrice(quote.low);
  document.getElementById('mPrevClose').textContent = formatPrice(quote.prevClose);
  document.getElementById('m52High').textContent    = formatPrice(financials.high52w);
  document.getElementById('m52Low').textContent     = formatPrice(financials.low52w);
  document.getElementById('mMarketCap').textContent = formatMarketCap(profile.marketCap);
  document.getElementById('mPE').textContent        = financials.pe ? financials.pe.toFixed(1) : '—';

  //Chart label
  document.getElementById('chartLabel').textContent = `${ticker.toUpperCase()} — ${currentPeriod} Chart`;
}

function renderAIAnalysis(analysis, currentPrice) {
  const signalBadge = document.getElementById('signalBadge');
  signalBadge.textContent = analysis.signal;
  signalBadge.className   = 'signal-badge ' + analysis.signal.toLowerCase();

  document.getElementById('signalDesc').textContent =
    analysis.signal_description || '';

  setTimeout(() => {
    document.getElementById('bullBar').style.width  = analysis.bull_probability + '%';
    document.getElementById('bearBar').style.width  = analysis.bear_probability + '%';
    document.getElementById('bullPct').textContent  = analysis.bull_probability + '%';
    document.getElementById('bearPct').textContent  = analysis.bear_probability + '%';
  }, 200);

  const riskLabel = document.getElementById('riskLabel');
  const riskLevel = (analysis.risk_level || 'MEDIUM').toLowerCase();
  riskLabel.textContent = analysis.risk_level || 'MEDIUM';
  riskLabel.className   = 'risk-label ' + riskLevel;
  setTimeout(() => {
    document.getElementById('riskBar').style.width = analysis.risk_score + '%';
  }, 300);

  const ksList = document.getElementById('keySignalsList');
  if (analysis.key_signals && analysis.key_signals.length) {
    ksList.innerHTML = analysis.key_signals
      .map(s => `<li class="ks-item">${s}</li>`)
      .join('');
  }

  //Price targets
  document.getElementById('targetBear').textContent = formatPrice(analysis.price_target_bear);
  document.getElementById('targetBase').textContent = formatPrice(analysis.price_target_base);
  document.getElementById('targetBull').textContent = formatPrice(analysis.price_target_bull);

  const content = document.getElementById('aiAnalysisContent');
  const sections = [
    { title: 'SUMMARY',              body: analysis.summary },
    { title: 'TECHNICAL ANALYSIS',   body: analysis.technical_analysis },
    { title: 'FUNDAMENTAL ANALYSIS', body: analysis.fundamental_analysis },
    { title: 'RISK FACTORS',         body: analysis.risk_factors },
    { title: 'RECOMMENDATION',       body: analysis.recommendation },
  ];

  content.innerHTML = sections
    .filter(s => s.body)
    .map(s => `
      <div class="ai-section">
        <div class="ai-section-title">${s.title}</div>
        <div class="ai-section-body">${s.body}</div>
      </div>
    `)
    .join('');

  document.getElementById('aiStatus').textContent = 'Analysis complete';
}

async function runAnalysis(ticker) {
  ticker = ticker.trim().toUpperCase();
  if (!ticker) { showError('Please enter a ticker symbol.'); return; }
  if (!/^[A-Z]{1,6}$/.test(ticker)) { showError('Invalid ticker. Use 1–6 letters (e.g. AAPL, TSLA).'); return; }
  if (isLoading) return;

  hideError();
  resultsPanel.classList.add('hidden');
  AnalyzerChart.destroy();
  currentTicker = ticker;

  document.getElementById('aiAnalysisContent').innerHTML =
    '<div class="ai-placeholder"><p>Fetching AI analysis...</p></div>';
  document.getElementById('aiStatus').textContent = 'Analyzing...';
  document.getElementById('signalBadge').textContent = '—';
  document.getElementById('signalBadge').className   = 'signal-badge neutral';

  try {
    setLoading(true, `Fetching ${ticker} data from Finnhub...`);
    currentData = await FinnhubAPI.fetchAll(ticker, currentPeriod);

    renderStockData(ticker, currentData);
    AnalyzerChart.draw(currentData.candles, ticker, currentData.quote.changePct >= 0);
    resultsPanel.classList.remove('hidden');

    setLoading(true, `Running AI analysis via Groq (Llama 3)...`);
    const analysis = await GroqAI.analyze(ticker, currentData);

    renderAIAnalysis(analysis, currentData.quote.price);

    document.querySelectorAll('.ticker-chip').forEach(c => {
      c.classList.toggle('active', c.dataset.ticker === ticker);
    });

  } catch (err) {
    console.error(err);
    showError(err.message || 'Something went wrong. Please try again.');
    resultsPanel.classList.add('hidden');
  } finally {
    setLoading(false);
  }
}

async function switchPeriod(period) {
  if (!currentTicker || isLoading) return;
  currentPeriod = period;

  document.querySelectorAll('.period-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.period === period);
  });

  try {
    setLoading(true, `Loading ${period} chart...`);
    const candles = await FinnhubAPI.getCandles(currentTicker, period);
    currentData.candles = candles;
    AnalyzerChart.draw(candles, currentTicker, currentData.quote.changePct >= 0);
    document.getElementById('chartLabel').textContent =
      `${currentTicker} — ${period} Chart`;
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
}

window.addEventListener('DOMContentLoaded', () => {

  analyzeBtn.addEventListener('click', () => {
    runAnalysis(tickerInput.value);
  });

  tickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runAnalysis(tickerInput.value);
  });

  tickerInput.addEventListener('input', () => {
    tickerInput.value = tickerInput.value.toUpperCase();
  });

  document.querySelectorAll('.ticker-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      tickerInput.value = chip.dataset.ticker;
      runAnalysis(chip.dataset.ticker);
    });
  });

  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPeriod(btn.dataset.period));
  });

  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  const params = new URLSearchParams(window.location.search);
  const urlTicker = params.get('ticker');
  if (urlTicker) {
    tickerInput.value = urlTicker.toUpperCase();
    runAnalysis(urlTicker);
  }

});
