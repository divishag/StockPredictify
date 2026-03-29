import { useEffect, useMemo, useState } from "react";

import LightweightOhlcChart from "../components/LightweightOhlcChart";
import { useTheme } from "../context/ThemeContext";
import {
  deleteTrackedSymbol,
  downloadDataset,
  getTrackedSymbolDetails,
  getTrackedSymbolPreview,
  getTrackedSymbols,
} from "../services/datasetService";
import { MENU_OPTIONS } from "../types/workflow";

function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "--";
  }

  return num.toFixed(2);
}

export default function WorkflowPage() {
  const { theme, setTheme } = useTheme();

  const [activeMenu, setActiveMenu] = useState("home");
  const [symbolsInput, setSymbolsInput] = useState("AAPL, NVDA");
  const [startDate, setStartDate] = useState(() => {
    const tenYearsAgoYear = new Date().getFullYear() - 10;
    return `${tenYearsAgoYear}-01-01`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");

  const [trackedItems, setTrackedItems] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedSymbolRecords, setSelectedSymbolRecords] = useState([]);
  const [selectedSymbolPreview, setSelectedSymbolPreview] = useState(null);
  const [comparisonItems, setComparisonItems] = useState([]);
  const [isLoadingTracked, setIsLoadingTracked] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [symbolMessage, setSymbolMessage] = useState("");

  const selected = useMemo(
    () => MENU_OPTIONS.find((option) => option.key === activeMenu) || MENU_OPTIONS[0],
    [activeMenu]
  );

  const allPreviewPoints = useMemo(() => {
    const points = Array.isArray(selectedSymbolPreview?.points) ? [...selectedSymbolPreview.points] : [];

    points.sort((a, b) => {
      const timeA = new Date(String(a.date)).getTime();
      const timeB = new Date(String(b.date)).getTime();

      if (Number.isNaN(timeA) && Number.isNaN(timeB)) {
        return String(a.date).localeCompare(String(b.date));
      }

      if (Number.isNaN(timeA)) {
        return -1;
      }

      if (Number.isNaN(timeB)) {
        return 1;
      }

      return timeA - timeB;
    });

    return points;
  }, [selectedSymbolPreview]);

  const latestPoint = allPreviewPoints.at(-1);

  useEffect(() => {
    if (activeMenu === "dataset") {
      void loadTrackedSymbols();
    }
  }, [activeMenu]);

  async function loadTrackedSymbols(nextSelectedSymbol = "") {
    setIsLoadingTracked(true);
    setSymbolMessage("");

    try {
      const payload = await getTrackedSymbols();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setTrackedItems(items);

      if (!items.length) {
        setSelectedSymbol("");
        setSelectedSymbolRecords([]);
        setSelectedSymbolPreview(null);
        setComparisonItems([]);
        return;
      }

      const preferredSymbol = nextSelectedSymbol || selectedSymbol || items[0].symbol;
      const exists = items.some((item) => item.symbol === preferredSymbol);
      const finalSymbol = exists ? preferredSymbol : items[0].symbol;
      setSelectedSymbol(finalSymbol);
      await Promise.all([handleViewSymbol(finalSymbol), loadComparisonData(items)]);
    } catch (error) {
      setSymbolMessage(`Could not load tracked symbols: ${error.message}`);
    } finally {
      setIsLoadingTracked(false);
    }
  }

  async function loadComparisonData(items) {
    if (!Array.isArray(items) || items.length === 0) {
      setComparisonItems([]);
      return;
    }

    setIsLoadingComparison(true);
    try {
      const comparisonPayload = await Promise.all(
        items.map(async (item) => {
          try {
            const preview = await getTrackedSymbolPreview(item.symbol);
            return {
              symbol: item.symbol,
              latestClose: Number(preview?.latestClose),
              changePercent: Number(preview?.changePercent),
            };
          } catch {
            return {
              symbol: item.symbol,
              latestClose: Number.NaN,
              changePercent: Number.NaN,
            };
          }
        })
      );

      comparisonPayload.sort((a, b) => {
        const aClose = Number.isFinite(a.latestClose) ? a.latestClose : Number.NEGATIVE_INFINITY;
        const bClose = Number.isFinite(b.latestClose) ? b.latestClose : Number.NEGATIVE_INFINITY;
        if (aClose === bClose) {
          return a.symbol.localeCompare(b.symbol);
        }
        return bClose - aClose;
      });

      setComparisonItems(comparisonPayload);
    } finally {
      setIsLoadingComparison(false);
    }
  }

  async function handleViewSymbol(symbol) {
    setSelectedSymbol(symbol);
    setSymbolMessage("");
    setIsLoadingPreview(true);

    try {
      const [detailPayload, previewPayload] = await Promise.all([
        getTrackedSymbolDetails(symbol),
        getTrackedSymbolPreview(symbol),
      ]);

      setSelectedSymbolRecords(Array.isArray(detailPayload?.items) ? detailPayload.items : []);
      setSelectedSymbolPreview(previewPayload || null);
    } catch (error) {
      setSelectedSymbolRecords([]);
      setSelectedSymbolPreview(null);
      setSymbolMessage(`Could not load symbol data: ${error.message}`);
    } finally {
      setIsLoadingPreview(false);
    }
  }

  async function handleDeleteSymbol(symbol) {
    const confirmed = window.confirm(`Delete all tracked data for ${symbol}?`);
    if (!confirmed) {
      return;
    }

    try {
      const payload = await deleteTrackedSymbol(symbol);
      setSymbolMessage(
        `Deleted ${payload.deletedRecords || 0} records and ${payload.deletedFiles || 0} files for ${payload.symbol || symbol}.`
      );
      await loadTrackedSymbols("");
    } catch (error) {
      setSymbolMessage(`Delete failed: ${error.message}`);
    }
  }

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

      if (downloadedCount > 0) {
        await loadTrackedSymbols(symbols[0]);
      }
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
            {MENU_OPTIONS.map((option) => {
              const stepNumber = MENU_OPTIONS.filter((item) => item.key !== "home").findIndex(
                (item) => item.key === option.key
              );

              const labelText = option.key === "home" ? option.label : `${stepNumber + 1}. ${option.label}`;

              return (
                <button
                  key={option.key}
                  type="button"
                  className={`nav-link ${activeMenu === option.key ? "active" : ""}`}
                  onClick={() => setActiveMenu(option.key)}
                >
                  {labelText}
                </button>
              );
            })}
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
        {activeMenu === "home" ? (
          <section className="hero-panel glass-card mb-4">
            <p className="hero-badge mb-2">WELCOME</p>
            <h1 className="predictify-hero mb-2">Predictify</h1>
            <h2 className="hero-title mb-2">Build, Train, Backtest, and Compare</h2>
            <p className="hero-subtitle mb-0">
              Design datasets, train models, validate strategy behavior, and compare outcomes from one workspace.
            </p>
          </section>
        ) : null}

        <section className="row g-4 mb-4">
          <div className="col-12">
            <div className="glass-card workflow-detail h-100">
              <p className="section-tag mb-2">Selected Stage</p>
              <h2 className="mb-2">{selected.label}</h2>
              <p className="mb-4">{selected.description}</p>

              {activeMenu === "dataset" ? (
                <div className="row g-3 align-items-start">
                  <div className="col-12 col-lg-3">
                    <div className="dataset-listbox h-100">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <p className="section-tag mb-0">Tracked Symbols</p>
                        <button
                          type="button"
                          className="btn btn-outline-cyan btn-sm"
                          onClick={() => loadTrackedSymbols(selectedSymbol)}
                        >
                          Refresh
                        </button>
                      </div>

                      {isLoadingTracked ? <p className="dataset-help mb-2">Loading tracked symbols...</p> : null}

                      {!isLoadingTracked && trackedItems.length === 0 ? (
                        <p className="dataset-help mb-2">No symbols tracked yet. Download data to start tracking.</p>
                      ) : null}

                      <div className="symbol-list">
                        {trackedItems.map((item) => (
                          <div className="symbol-list-row" key={item.symbol}>
                            <button
                              type="button"
                              className={`symbol-list-item ${selectedSymbol === item.symbol ? "active" : ""}`}
                              onClick={() => handleViewSymbol(item.symbol)}
                            >
                              <span className="symbol-name">{item.symbol}</span>
                              <span className="symbol-meta">Rows: {item.totalRows}</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm symbol-delete-btn"
                              onClick={() => handleDeleteSymbol(item.symbol)}
                              aria-label={`Delete ${item.symbol}`}
                              title={`Delete ${item.symbol}`}
                            >
                              <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                                <path
                                  d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"
                                  fill="currentColor"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>

                      {symbolMessage ? <p className="dataset-status mt-2 mb-0">{symbolMessage}</p> : null}
                    </div>

                    <div className="comparison-card comparison-card-offset">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <p className="section-tag mb-0">Recent Close Comparison</p>
                        {isLoadingComparison ? <span className="comparison-loading">Loading...</span> : null}
                      </div>
                      <p className="dataset-help mb-2">Latest close for all tracked symbols.</p>

                      <div className="comparison-list-scroll">
                        {comparisonItems.length === 0 ? (
                          <p className="dataset-help mb-0">No comparison data available yet.</p>
                        ) : (
                          comparisonItems.map((item, index) => {
                            const hasClose = Number.isFinite(item.latestClose);
                            const hasChange = Number.isFinite(item.changePercent);

                            return (
                              <button
                                key={`cmp-${item.symbol}`}
                                type="button"
                                className={`comparison-row ${selectedSymbol === item.symbol ? "active" : ""}`}
                                onClick={() => handleViewSymbol(item.symbol)}
                              >
                                <span className="comparison-rank">#{index + 1}</span>
                                <span className="comparison-symbol">{item.symbol}</span>
                                <span className="comparison-close">{hasClose ? formatPrice(item.latestClose) : "--"}</span>
                                <span
                                  className={`comparison-change ${
                                    !hasChange ? "is-neutral" : item.changePercent >= 0 ? "is-positive" : "is-negative"
                                  }`}
                                >
                                  {!hasChange ? "N/A" : `${formatPrice(item.changePercent)}%`}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-12 col-lg-9">
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

                      <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center mb-3">
                        <button type="submit" className="btn btn-cyan px-4" disabled={isDownloading}>
                          {isDownloading ? "Downloading..." : "Download Data"}
                        </button>
                        {downloadMessage ? <p className="dataset-status mb-0">{downloadMessage}</p> : null}
                      </div>

                      {selectedSymbol ? (
                        <div className="tracked-details">
                          <p className="section-tag mb-2">Selected Symbol Data</p>
                          <h3 className="mb-2">{selectedSymbol}</h3>

                          <div className="stock-preview mb-3">
                            <p className="preview-label mb-1">Stock Preview</p>
                            {isLoadingPreview ? (
                              <p className="dataset-help mb-0">Loading preview...</p>
                            ) : allPreviewPoints.length ? (
                              <>
                                <div className="d-flex flex-wrap gap-2 mb-2">
                                  <span className="preview-chip">
                                    Latest: {formatPrice(selectedSymbolPreview?.latestClose)}
                                  </span>
                                  <span className="preview-chip">Open: {formatPrice(latestPoint?.open)}</span>
                                  <span className="preview-chip">High: {formatPrice(latestPoint?.high)}</span>
                                  <span className="preview-chip">Low: {formatPrice(latestPoint?.low)}</span>
                                  <span
                                    className={`preview-chip ${
                                      Number(selectedSymbolPreview?.change) >= 0 ? "is-positive" : "is-negative"
                                    }`}
                                  >
                                    Change: {formatPrice(selectedSymbolPreview?.change)} ({formatPrice(selectedSymbolPreview?.changePercent)}%)
                                  </span>
                                </div>

                                <LightweightOhlcChart points={allPreviewPoints} theme={theme} />
                              </>
                            ) : (
                              <p className="dataset-help mb-0">Preview unavailable for this symbol.</p>
                            )}
                          </div>

                          {selectedSymbolRecords.length === 0 ? (
                            <p className="dataset-help mb-0">No detailed records found for this symbol.</p>
                          ) : (
                            <ul className="tracked-record-list mb-0">
                              {selectedSymbolRecords.map((record) => (
                                <li key={record.id}>
                                  <strong>{record.startDate}</strong>
                                  <span> to {record.endDate || "N/A"}</span>
                                  <span> - {record.rows} rows</span>
                                  <span> - {record.file}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </form>
                  </div>
                </div>
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
