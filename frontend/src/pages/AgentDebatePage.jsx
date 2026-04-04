import React, { useState } from 'react';
import LightweightLineChart from '../components/LightweightLineChart';

export default function AgentDebatePage() {
  const [ticker, setTicker] = useState('INFY.NS');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debateData, setDebateData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);

  const handleAnalyze = async () => {
    if (!ticker) return;
    setLoading(true);
    setError('');
    setPredictionData(null);
    setDebateData(null);
    
    try {
      const debatePromise = fetch('http://localhost:8000/api/agents/debate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: ticker }),
      });
      
      const predictionPromise = fetch('http://localhost:8000/api/predict/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: ticker, days: 7 }),
      });

      const [debateRes, predictRes] = await Promise.allSettled([debatePromise, predictionPromise]);
      
      if (debateRes.status === 'fulfilled' && debateRes.value.ok) {
          const data = await debateRes.value.json();
          setDebateData(data);
      } else {
          throw new Error('Debate Analysis failed');
      }

      if (predictRes.status === 'fulfilled' && predictRes.value.ok) {
          const pData = await predictRes.value.json();
          if (pData.status === 'success') {
              setPredictionData(pData.data.forecast);
          }
      } else {
          console.warn('Prediction model failed or missing for this ticker.');
      }
    } catch (err) {
      console.error(err);
      setError('Analysis failed. Ensure backend is running and ticker is valid.');
    } finally {
      setLoading(false);
    }
  };

  const getSignalColor = (signal) => {
    if (!signal) return '#94a3b8';
    const s = signal.toUpperCase();
    if (s.includes('BUY')) return '#10b981'; // Emerald
    if (s.includes('SELL')) return '#ef4444'; // Red
    return '#f59e0b'; // Amber
  };

  const getSignalBgColor = (signal) => {
    if (!signal) return 'rgba(148, 163, 184, 0.1)';
    const s = signal.toUpperCase();
    if (s.includes('BUY')) return 'rgba(16, 185, 129, 0.1)';
    if (s.includes('SELL')) return 'rgba(239, 68, 68, 0.1)';
    return 'rgba(245, 158, 11, 0.1)';
  };

  const getSignalIcon = (signal) => {
    if (!signal) return '⏳';
    const s = signal.toUpperCase();
    if (s.includes('BUY')) return '🚀';
    if (s.includes('SELL')) return '⚠️';
    return '⚖️';
  };

  return (
    <div className="dashboard-layout">
      {/* Navbar area */}
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <span className="brand-icon">⚡</span>
          <span className="brand-text">StockPredictify <span className="brand-badge">PRO</span></span>
        </div>
        <div className="nav-search">
          <input 
            type="text" 
            value={ticker} 
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Search NSE Ticker (e.g., INFY.NS, TCS.NS)"
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button className="search-btn" onClick={handleAnalyze} disabled={loading}>
            {loading ? <span className="spinner"></span> : 'Analyze'}
          </button>
        </div>
      </nav>

      {error && <div className="error-banner">{error}</div>}

      {/* Main Content Grid */}
      <div className="dashboard-content">
        
        {/* Left Column - Main Chart area */}
        <div className="main-col">
          <div className="chart-panel glass-panel">
            <div className="panel-header">
              <h2>{debateData ? `${debateData.symbol} Overview` : 'Market Analysis'}</h2>
              <div className="header-actions">
                <span className="timeframe-badge">Live Auto-Update</span>
              </div>
            </div>
            <div className="chart-wrapper">
              {debateData?.chart_data ? (
                <LightweightLineChart data={debateData.chart_data} predictionData={predictionData} theme="dark" />
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">📈</div>
                  <p>Enter a ticker and analyze to view the dynamic price action vs EMA-20.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Insights */}
        <div className="side-col">
          <div className="glass-panel summary-panel">
            <div className="panel-header">
              <h3>Consensus Signal</h3>
            </div>
            <div className="signal-display" style={{ 
              borderColor: getSignalColor(debateData?.market_signal),
              backgroundColor: getSignalBgColor(debateData?.market_signal) 
            }}>
              <div className="signal-large-icon">{getSignalIcon(debateData?.market_signal)}</div>
              <h1 style={{ color: getSignalColor(debateData?.market_signal) }}>
                {debateData ? debateData.market_signal : "STANDBY"}
              </h1>
              <p>AI Multi-Agent Determination</p>
            </div>
          </div>

          <div className="glass-panel ai-panel">
            <div className="panel-header">
              <h3>🧠 AI Rationale</h3>
            </div>
            <div className="ai-content">
              {loading ? (
                 <div className="loading-skeleton">
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                 </div>
              ) : debateData ? (
                 <p className="reasoning-text">{debateData.ai_reasoning}</p>
              ) : (
                 <p className="placeholder-text">Waiting for agents to debate market conditions...</p>
              )}
            </div>
          </div>

          {debateData?.tech_data && (
            <div className="glass-panel stats-panel">
              <div className="panel-header">
                <h3>Technical Indicators</h3>
              </div>
              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-label">Current Price</span>
                  <span className="stat-value">₹{debateData.tech_data.current_price}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">RSI (14)</span>
                  <span className="stat-value">{debateData.tech_data.rsi}</span>
                </div>
                <div className="stat-box">
                  <span className="stat-label">EMA (20)</span>
                  <span className="stat-value">₹{debateData.tech_data.ema_20}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        :root {
          --bg-main: #0B0F19;
          --bg-panel: rgba(19, 24, 38, 0.7);
          --border-color: #1f2937;
          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --accent-primary: #3b82f6;
          --accent-hover: #2563eb;
        }

        .dashboard-layout {
          min-height: 100vh;
          background: radial-gradient(circle at top, #111827 0%, var(--bg-main) 100%);
          color: var(--text-main);
          font-family: 'Inter', system-ui, sans-serif;
          padding-bottom: 40px;
        }

        .dashboard-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          border-bottom: 1px solid var(--border-color);
          background: rgba(11, 15, 25, 0.8);
          backdrop-filter: blur(12px);
          position: sticky;
          top: 0;
          z-index: 50;
        }

        .nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }

        .brand-icon {
          font-size: 24px;
          color: var(--accent-primary);
        }

        .brand-badge {
          font-size: 10px;
          background: var(--accent-primary);
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          vertical-align: top;
          margin-left: 4px;
          letter-spacing: 0.5px;
        }

        .nav-search {
          display: flex;
          gap: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid var(--border-color);
          padding: 6px;
          border-radius: 12px;
          width: 450px;
          transition: border 0.3s;
        }

        .nav-search:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 1px var(--accent-primary);
        }

        .nav-search input {
          flex: 1;
          background: transparent;
          border: none;
          color: var(--text-main);
          padding: 8px 12px;
          font-size: 14px;
          outline: none;
        }

        .nav-search input::placeholder {
          color: #475569;
        }

        .search-btn {
          background: var(--accent-primary);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 90px;
        }

        .search-btn:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        
        .search-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: white;
          animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-banner {
          background: rgba(239, 68, 68, 0.1);
          border-left: 4px solid #ef4444;
          color: #fca5a5;
          padding: 12px 32px;
          margin: 0;
          font-size: 14px;
        }

        .dashboard-content {
          display: grid;
          grid-template-columns: 2.2fr 1fr;
          gap: 24px;
          max-width: 1500px;
          margin: 32px auto;
          padding: 0 32px;
        }

        @media (max-width: 1024px) {
          .dashboard-content {
            grid-template-columns: 1fr;
          }
        }

        .glass-panel {
          background: var(--bg-panel);
          border: 1px solid var(--border-color);
          border-radius: 16px;
          box-shadow: 0 4px 24px -1px rgba(0,0,0,0.3);
          backdrop-filter: blur(12px);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .panel-header {
          padding: 16px 24px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .panel-header h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .panel-header h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0;
        }

        .timeframe-badge {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 12px;
          border: 1px solid rgba(16, 185, 129, 0.2);
        }

        .chart-wrapper {
          flex: 1;
          min-height: 500px;
          padding: 16px;
          position: relative;
        }

        .empty-state {
          height: 100%;
          min-height: 500px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #475569;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }

        .side-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .signal-display {
          margin: 24px;
          padding: 32px;
          border-radius: 12px;
          border: 1px solid;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          transition: all 0.5s ease;
        }

        .signal-large-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .signal-display h1 {
          font-size: 36px;
          font-weight: 800;
          margin: 0 0 8px 0;
          letter-spacing: 2px;
        }

        .signal-display p {
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 500;
          text-transform: uppercase;
          margin: 0;
        }

        .ai-content {
          padding: 24px;
          min-height: 140px;
        }

        .reasoning-text {
          font-size: 15px;
          line-height: 1.7;
          color: #cbd5e1;
          margin: 0;
        }

        .placeholder-text {
          color: #475569;
          font-style: italic;
          text-align: center;
          margin-top: 20px;
        }

        .loading-skeleton {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 10px;
        }

        .skeleton-line {
          height: 12px;
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          animation: pulse 1.5s infinite;
        }

        .skeleton-line.short {
          width: 60%;
        }

        @keyframes pulse {
          0% { opacity: 0.5; }
          50% { opacity: 1; }
          100% { opacity: 0.5; }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: var(--border-color);
        }

        .stat-box {
          background: var(--bg-panel);
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .stat-label {
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
          font-weight: 600;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-main);
        }
      `}</style>
    </div>
  );
}
