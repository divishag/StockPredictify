import { useMemo, useState } from "react";

import { useTheme } from "../context/ThemeContext";
import { downloadDataset } from "../services/datasetService";
import { MENU_OPTIONS } from "../types/workflow";

export default function WorkflowPage() {
  const { theme, setTheme } = useTheme();

  const [activeMenu, setActiveMenu] = useState("dataset");
  const [symbolsInput, setSymbolsInput] = useState("AAPL, NVDA");
  const [startDate, setStartDate] = useState(() => {
    const tenYearsAgoYear = new Date().getFullYear() - 10;
    return `${tenYearsAgoYear}-01-01`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  const selected = useMemo(
    () => MENU_OPTIONS.find((option) => option.key === activeMenu) || MENU_OPTIONS[0],
    [activeMenu]
  );

  async function handleDownloadData(event) {
    event.preventDefault();

    const symbols = symbolsInput
      .split(/[\s,]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    if (!symbols.length) {
      setDownloadMessage("Please enter at least one stock symbol.");
      return;
    }

    if (!startDate) {
      setDownloadMessage("Please select a start date.");
      return;
    }

    setIsDownloading(true);
    setDownloadMessage("Downloading data...");

    try {
      const payload = await downloadDataset({ symbols, startDate });
      const downloadedCount = Array.isArray(payload?.downloaded) ? payload.downloaded.length : 0;
      const failedCount = Array.isArray(payload?.failed) ? payload.failed.length : 0;
      setDownloadMessage(
        `Download completed: ${downloadedCount} succeeded, ${failedCount} failed for ${symbols.join(", ")}.`
      );
    } catch (error) {
      setDownloadMessage(`Backend request failed: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="container-xl d-flex align-items-center justify-content-between py-3 top-nav-row">
          <div className="brand-wrap d-flex align-items-center">
            <p className="brand-name mb-0">Predictify</p>
          </div>

          <nav className="nav nav-pills gap-2 menu-nav top-menu-nav" aria-label="Main workflow menu">
            {MENU_OPTIONS.map((option, index) => (
              <button
                key={option.key}
                type="button"
                className={`nav-link ${activeMenu === option.key ? "active" : ""}`}
                onClick={() => setActiveMenu(option.key)}
              >
                {index + 1}. {option.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="theme-switch"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "Light Theme" : "Dark Theme"}
          </button>
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

        <section className="row g-4 mb-4">
          <div className="col-12">
            <div className="glass-card workflow-detail h-100">
              <p className="section-tag mb-2">Selected Stage</p>
              <h2 className="mb-2">{selected.label}</h2>
              <p className="mb-4">{selected.description}</p>

              {activeMenu === "dataset" ? (
                <form className="dataset-form" onSubmit={handleDownloadData}>
                  <div className="mb-3">
                    <label className="form-label dataset-label" htmlFor="symbols-input">
                      Stock Symbols
                    </label>
                    <input
                      id="symbols-input"
                      type="text"
                      className="form-control dataset-input"
                      value={symbolsInput}
                      onChange={(event) => setSymbolsInput(event.target.value)}
                      placeholder="AAPL, MSFT, NVDA"
                    />
                    <p className="dataset-help mb-0 mt-2">
                      Enter one or more symbols as a comma or space-separated list.
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="form-label dataset-label" htmlFor="start-date-input">
                      Start Date
                    </label>
                    <input
                      id="start-date-input"
                      type="date"
                      className="form-control dataset-input"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                    />
                  </div>

                  <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center">
                    <button type="submit" className="btn btn-cyan px-4" disabled={isDownloading}>
                      {isDownloading ? "Downloading..." : "Download Data"}
                    </button>
                    {downloadMessage ? <p className="dataset-status mb-0">{downloadMessage}</p> : null}
                  </div>
                </form>
              ) : (
                <>
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
                    <button type="button" className="btn btn-cyan px-4">
                      Run {selected.label}
                    </button>
                    <button type="button" className="btn btn-outline-cyan px-4">
                      View Logs
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
