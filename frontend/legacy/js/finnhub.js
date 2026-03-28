
const FinnhubAPI = {

  _url(endpoint, params = {}) {
    const url = new URL(CONFIG.FINNHUB_BASE + endpoint);
    url.searchParams.set('token', CONFIG.FINNHUB_KEY);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    return url.toString();
  },

  async _get(endpoint, params = {}) {
    const url = this._url(endpoint, params);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Finnhub error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return data;
  },

  // Returns: { price, open, high, low, prevClose, change, changePct }
  async getQuote(ticker) {
    const data = await this._get('/quote', { symbol: ticker.toUpperCase() });

    if (!data.c || data.c === 0) {
      throw new Error(`No data found for ticker "${ticker}". Check the symbol and try again.`);
    }

    return {
      price:     data.c,                          // current price
      open:      data.o,                          // open
      high:      data.h,                          // day high
      low:       data.l,                          // day low
      prevClose: data.pc,                         // previous close
      change:    +(data.c - data.pc).toFixed(2),  // dollar change
      changePct: +(((data.c - data.pc) / data.pc) * 100).toFixed(2), // % change
    };
  },

  // Returns: { name, exchange, currency, marketCap, logo, industry, weburl }
  async getCompanyProfile(ticker) {
    const data = await this._get('/stock/profile2', { symbol: ticker.toUpperCase() });

    return {
      name:      data.name       || ticker,
      exchange:  data.exchange   || '—',
      currency:  data.currency   || 'USD',
      marketCap: data.marketCapitalization || null,  // in millions
      industry:  data.finnhubIndustry || '—',
      weburl:    data.weburl     || '',
    };
  },

  // Returns: { pe, eps, 52wHigh, 52wLow, beta }
  async getBasicFinancials(ticker) {
    const data = await this._get('/stock/metric', {
      symbol: ticker.toUpperCase(),
      metric: 'all',
    });

    const m = data.metric || {};
    return {
      pe:       m['peBasicExclExtraTTM']     || m['peTTM']    || null,
      eps:      m['epsBasicExclExtraItemsTTM'] || null,
      high52w:  m['52WeekHigh']               || null,
      low52w:   m['52WeekLow']                || null,
      beta:     m['beta']                     || null,
    };
  },

  // period: '1D' | '1W' | '1M' | '3M'
  // Returns: { labels: [timestamps], prices: [closing prices] }
  async getCandles(ticker, period = '1M') {
    const now   = Math.floor(Date.now() / 1000);
    let   from  = now;
    let   resolution = 'D'; // default daily

    switch (period) {
      case '1D':
        from = now - 60 * 60 * 8;   // last 8 trading hours
        resolution = '5';            // 5-minute tickers
        break;
      case '1W':
        from = now - 60 * 60 * 24 * 7;
        resolution = '60';           // hourly
        break;
      case '1M':
        from = now - 60 * 60 * 24 * 30;
        resolution = 'D';            // daily
        break;
      case '3M':
        from = now - 60 * 60 * 24 * 90;
        resolution = 'D';
        break;
      default:
        from = now - 60 * 60 * 24 * 30;
        resolution = 'D';
    }

    const data = await this._get('/stock/candle', {
      symbol:     ticker.toUpperCase(),
      resolution: resolution,
      from:       from,
      to:         now,
    });

    if (data.s === 'no_data' || !data.c || data.c.length === 0) {
      if (period === '1D') {
        return this.getCandles(ticker, '1M');
      }
      throw new Error('No chart data available for this period.');
    }

    return {
      labels: data.t.map(ts => new Date(ts * 1000).toISOString()),
      prices: data.c,
      opens:  data.o,
      highs:  data.h,
      lows:   data.l,
    };
  },

  async fetchAll(ticker, period = '1M') {
    const [quote, profile, financials, candles] = await Promise.all([
      this.getQuote(ticker),
      this.getCompanyProfile(ticker),
      this.getBasicFinancials(ticker),
      this.getCandles(ticker, period),
    ]);

    return { quote, profile, financials, candles };
  },

};
