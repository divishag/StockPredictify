import { useMemo, useState } from "react";

const menuOptions = [
  {
    key: "dataset",
    label: "Dataset Preparation",
    description: "Ingest, clean, and normalize market data before training.",
    bullets: ["Load CSV or API feed", "Handle nulls and outliers", "Generate feature columns"],
  },
  {
    key: "train",
    label: "Train Model",
    description: "Select model type and train against prepared datasets.",
    bullets: ["Configure hyperparameters", "Split train and validation", "Track performance metrics"],
  },
  {
    key: "backtest",
    label: "Backtest Strategy",
    description: "Run strategy on historical windows and evaluate reliability.",
    bullets: ["Set timeframe and capital", "Apply risk rules", "Review equity curve"],
  },
  {
    key: "compare",
    label: "Compare Results",
    description: "Compare model variants and strategy outcomes side-by-side.",
    bullets: ["Sharpe and drawdown", "Hit ratio and returns", "Export comparison summary"],
  },
];

function StatCard({ title, value, hint, tone = "cyan" }) {
  return (
    <div className="col-12 col-md-6 col-xl-3">
      <div className={`glass-card stat-card tone-${tone}`}>
        <p className="stat-title">{title}</p>
        <h3 className="stat-value">{value}</h3>
        <p className="stat-hint mb-0">{hint}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [activeMenu, setActiveMenu] = useState("dataset");

  const selected = useMemo(
    () => menuOptions.find((option) => option.key === activeMenu) || menuOptions[0],
    [activeMenu]
  );

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="container-xl d-flex align-items-center justify-content-between py-3">
          <div className="brand-wrap d-flex align-items-center gap-2">
            <div className="logo-chip">AI</div>
            <div>
              <p className="brand-name mb-0">StockAI Intelligence</p>
              <p className="brand-sub mb-0">React Dashboard</p>
            </div>
          </div>
          <button type="button" className="btn nav-cta-btn">Model Workspace</button>
        </div>
      </header>

      <main className="container-xl content-wrap">
        <section className="hero-panel glass-card mb-4">
          <p className="hero-badge mb-2">ML STRATEGY PIPELINE</p>
          <h1 className="hero-title mb-2">Build, Train, Backtest, and Compare</h1>
          <p className="hero-subtitle mb-0">
            Bootstrap-driven React interface preserving your cyan-on-deep visual system.
          </p>
        </section>

        <section className="glass-card mb-4">
          <nav className="nav nav-pills flex-column flex-lg-row gap-2 menu-nav" aria-label="Main workflow menu">
            {menuOptions.map((option, index) => (
              <button
                key={option.key}
                type="button"
                className={`nav-link text-start text-lg-center ${activeMenu === option.key ? "active" : ""}`}
                onClick={() => setActiveMenu(option.key)}
              >
                {index + 1}. {option.label}
              </button>
            ))}
          </nav>
        </section>

        <section className="row g-4 mb-4">
          <div className="col-12 col-xl-8">
            <div className="glass-card workflow-detail h-100">
              <p className="section-tag mb-2">Selected Stage</p>
              <h2 className="mb-2">{selected.label}</h2>
              <p className="mb-4">{selected.description}</p>

              <div className="row g-3">
                {selected.bullets.map((item) => (
                  <div className="col-12 col-md-4" key={item}>
                    <div className="mini-tile h-100">
                      <span className="tile-dot" aria-hidden="true" />
                      <p className="mb-0">{item}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="d-flex flex-column flex-md-row gap-2 mt-4">
                <button type="button" className="btn btn-cyan px-4">Run {selected.label}</button>
                <button type="button" className="btn btn-outline-cyan px-4">View Logs</button>
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-4">
            <div className="glass-card quick-panel h-100">
              <p className="section-tag mb-3">Quick Metrics</p>
              <div className="vstack gap-3">
                <div>
                  <p className="small-label mb-1">Data Completeness</p>
                  <div className="progress stock-progress" role="progressbar" aria-label="Data completeness" aria-valuenow={92} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar" style={{ width: "92%" }}>92%</div>
                  </div>
                </div>
                <div>
                  <p className="small-label mb-1">Model Confidence</p>
                  <div className="progress stock-progress" role="progressbar" aria-label="Model confidence" aria-valuenow={84} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar" style={{ width: "84%" }}>84%</div>
                  </div>
                </div>
                <div>
                  <p className="small-label mb-1">Backtest Coverage</p>
                  <div className="progress stock-progress" role="progressbar" aria-label="Backtest coverage" aria-valuenow={76} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-bar" style={{ width: "76%" }}>76%</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="row g-3 pb-5">
          <StatCard title="Win Ratio" value="67.2%" hint="Last 90-day simulation" tone="green" />
          <StatCard title="Max Drawdown" value="-8.3%" hint="Contained by risk guard" tone="red" />
          <StatCard title="Sharpe Ratio" value="1.48" hint="Risk-adjusted return" />
          <StatCard title="Strategies Compared" value="12" hint="Latest comparison run" />
        </section>
      </main>
    </div>
  );
}
