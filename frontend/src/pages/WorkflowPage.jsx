import { useEffect, useMemo, useRef, useState } from "react";

import LightweightOhlcChart from "../components/LightweightOhlcChart";
import { useTheme } from "../context/ThemeContext";
import {
  activateTrainedModel,
  deleteBacktestById,
  deleteTrainedModel,
  deleteTrackedSymbol,
  downloadDataset,
  getBacktestById,
  getBacktests,
  getTrainingJobStatus,
  getTrainedModels,
  getTrainableStocks,
  getTrackedSymbolDetails,
  getTrackedSymbolPreview,
  getTrackedSymbols,
  runBacktestStrategy,
  trainSelectedStock,
} from "../services/datasetService";
import { MENU_OPTIONS } from "../types/workflow";
import HelpPage from "./HelpPage";
function formatPrice(value) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return "--";
  }

  return num.toFixed(2);
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "--";
  }

  const formatted = Math.abs(num).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${num < 0 ? "-" : ""}$${formatted}`;
}

function formatTimestamp(value) {
  if (!value) {
    return "Unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString();
}

function formatElapsedSeconds(ms) {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return (numeric / 1000).toFixed(1);
}

function isValidEpochValue(value) {
  return Number.isInteger(value) && value > 0;
}

const EPOCH_PROGRESS_TICK_MS = 150;

function getEpochProgressIncrement(avgEpochDurationMs) {
  const duration = Number(avgEpochDurationMs);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }

  const ticksPerEpoch = Math.max(1, duration / EPOCH_PROGRESS_TICK_MS);
  const increment = Math.ceil(96 / ticksPerEpoch);
  return Math.max(1, Math.min(12, increment));
}

const DEFAULT_EPOCHS = 5;
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_WINDOW_SIZE = 60;
const DEFAULT_MODEL_TYPE = "lstm";
const TRAIN_MODEL_OPTIONS = [
  { value: "lstm", label: "LSTM" },
  { value: "tcn", label: "TCN" },
];
const DEFAULT_BACKTEST_CASH = 100000;
const DEFAULT_BACKTEST_MIN_STREAK = 3;
const DEFAULT_BACKTEST_RSI_WINDOW = 14;
const DEFAULT_BACKTEST_LOWER = 30;
const DEFAULT_BACKTEST_UPPER = 70;

const TRAIN_PROGRESS_STEPS = [
  { key: "load_dataset", label: "Loading dataset..." },
  { key: "split_data", label: "Splitting train and test data..." },
  { key: "scale_features", label: "Scaling features..." },
  { key: "build_sequences", label: "Building sequences..." },
  { key: "build_model", label: "Building selected model..." },
  { key: "train_model", label: "Training model..." },
  { key: "save_model", label: "Saving trained model..." },
];

const INITIAL_TRAIN_STEPS = TRAIN_PROGRESS_STEPS.map((step) => ({
  ...step,
  status: "pending",
  durationMs: null,
  progressPct: 0,
  currentEpoch: null,
  totalEpochs: null,
  elapsedMs: null,
}));

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
  const [symbolPendingDelete, setSymbolPendingDelete] = useState("");
  const [isSymbolDeletePending, setIsSymbolDeletePending] = useState(false);
  const [trainStocks, setTrainStocks] = useState([]);
  const [selectedTrainStock, setSelectedTrainStock] = useState("");
  const [isLoadingTrainStocks, setIsLoadingTrainStocks] = useState(false);
  const [isTrainingModel, setIsTrainingModel] = useState(false);
  const [trainStatus, setTrainStatus] = useState("");
  const [trainProgressSteps, setTrainProgressSteps] = useState(INITIAL_TRAIN_STEPS);
  const [trainSummary, setTrainSummary] = useState(null);
  const [trainedModels, setTrainedModels] = useState([]);
  const [activeModelFile, setActiveModelFile] = useState("");
  const [isLoadingTrainedModels, setIsLoadingTrainedModels] = useState(false);
  const [isModelActionPending, setIsModelActionPending] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
  const [modelPendingDelete, setModelPendingDelete] = useState(null);
  const [epochs, setEpochs] = useState(DEFAULT_EPOCHS);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [windowSize, setWindowSize] = useState(DEFAULT_WINDOW_SIZE);
  const [trainModelType, setTrainModelType] = useState(DEFAULT_MODEL_TYPE);
  const [realProgress, setRealProgress] = useState(0);
  const [epochProgressPct, setEpochProgressPct] = useState(0);
  const [epochProgressIncrement, setEpochProgressIncrement] = useState(1);
  const [isEpochTrainingActive, setIsEpochTrainingActive] = useState(false);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestStatus, setBacktestStatus] = useState("");
  const [backtestRunError, setBacktestRunError] = useState("");
  const [backtestResult, setBacktestResult] = useState(null);
  const [backtestHistory, setBacktestHistory] = useState([]);
  const [selectedBacktestId, setSelectedBacktestId] = useState(null);
  const [isLoadingBacktestHistory, setIsLoadingBacktestHistory] = useState(false);
  const [isLoadingBacktestDetails, setIsLoadingBacktestDetails] = useState(false);
  const [backtestDeletePendingId, setBacktestDeletePendingId] = useState(null);
  const [backtestPendingDelete, setBacktestPendingDelete] = useState(null);
  const [backtestHistoryStatus, setBacktestHistoryStatus] = useState("");
  const [showBacktestCarouselNav, setShowBacktestCarouselNav] = useState(false);
  const [backtestSymbol, setBacktestSymbol] = useState("");
  const [backtestInitialCash, setBacktestInitialCash] = useState(DEFAULT_BACKTEST_CASH);
  const [backtestRsiWindow, setBacktestRsiWindow] = useState(DEFAULT_BACKTEST_RSI_WINDOW);
  const [backtestLowerBound, setBacktestLowerBound] = useState(DEFAULT_BACKTEST_LOWER);
  const [backtestUpperBound, setBacktestUpperBound] = useState(DEFAULT_BACKTEST_UPPER);
  const [backtestMinStreak, setBacktestMinStreak] = useState(DEFAULT_BACKTEST_MIN_STREAK);
  const completedEpochRef = useRef(0);
  const backtestHistoryBarRef = useRef(null);
  const epochTimingRef = useRef({
    lastCompletedEpoch: 0,
    lastElapsedMs: 0,
    averageEpochMs: null,
  });

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

  const backtestChartPoints = useMemo(() => {
    const rows = Array.isArray(backtestResult?.chartData) ? backtestResult.chartData : [];

    return rows
      .map((row) => ({
        date: row.date,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume || 0),
      }))
      .filter(
        (row) =>
          row.date &&
          Number.isFinite(row.open) &&
          Number.isFinite(row.high) &&
          Number.isFinite(row.low) &&
          Number.isFinite(row.close)
      );
  }, [backtestResult]);

  const backtestTradeMarkers = useMemo(() => {
    const trades = Array.isArray(backtestResult?.trades) ? backtestResult.trades : [];

    return trades
      .map((trade) => ({
        date: trade.date,
        action: String(trade.action || "").toLowerCase(),
        price: Number(trade.price),
        pnl: trade.pnl == null ? null : Number(trade.pnl),
        tradeId: Number(trade.tradeId),
        shares: Number(trade.shares),
      }))
      .filter(
        (trade) =>
          trade.date &&
          (trade.action === "buy" || trade.action === "sell") &&
          Number.isFinite(trade.price)
      );
  }, [backtestResult]);

  const backtestEquityPoints = useMemo(() => {
    const rows = Array.isArray(backtestResult?.equityCurve) ? backtestResult.equityCurve : [];

    return rows
      .map((row) => ({
        date: row.date,
        equity: Number(row.equity),
      }))
      .filter((row) => row.date && Number.isFinite(row.equity));
  }, [backtestResult]);

  const activeBacktestModel = useMemo(() => {
    if (!activeModelFile) {
      return null;
    }

    return trainedModels.find((model) => model.modelFile === activeModelFile) || null;
  }, [trainedModels, activeModelFile]);

  const activeBacktestSymbol = useMemo(() => {
    const symbol = String(activeBacktestModel?.symbol || "")
      .trim()
      .toUpperCase();

    return symbol;
  }, [activeBacktestModel]);

  useEffect(() => {
    if (activeMenu === "dataset") {
      void loadTrackedSymbols();
    }

    if (activeMenu === "train") {
      void loadTrainStocks();
      void loadTrainedModels();
    }

    if (activeMenu === "backtest") {
      void loadTrainedModels();
      void loadBacktestHistory();
      setBacktestStatus("");
    }
  }, [activeMenu]);

  useEffect(() => {
    if (activeBacktestSymbol) {
      setBacktestSymbol((current) => (current === activeBacktestSymbol ? current : activeBacktestSymbol));
      return;
    }

    setBacktestSymbol("");
  }, [activeBacktestSymbol]);

  useEffect(() => {
    if (!isTrainingModel || !isEpochTrainingActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setEpochProgressPct((previousPct) => Math.min(99, (Number(previousPct) || 0) + epochProgressIncrement));
    }, EPOCH_PROGRESS_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isTrainingModel, isEpochTrainingActive, epochProgressIncrement]);

  useEffect(() => {
    if (activeMenu !== "backtest") {
      setShowBacktestCarouselNav(false);
      return;
    }

    function updateCarouselNavVisibility() {
      const strip = backtestHistoryBarRef.current;
      if (!strip) {
        setShowBacktestCarouselNav(false);
        return;
      }

      const hasHorizontalOverflow = strip.scrollWidth - strip.clientWidth > 1;
      setShowBacktestCarouselNav(hasHorizontalOverflow);
    }

    updateCarouselNavVisibility();
    const rafId = window.requestAnimationFrame(updateCarouselNavVisibility);

    const strip = backtestHistoryBarRef.current;
    const resizeObserver =
      strip && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            updateCarouselNavVisibility();
          })
        : null;

    if (strip && resizeObserver) {
      resizeObserver.observe(strip);
    }

    window.addEventListener("resize", updateCarouselNavVisibility);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", updateCarouselNavVisibility);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [activeMenu, backtestHistory.length, isLoadingBacktestHistory]);

  async function loadTrainedModels() {
    setIsLoadingTrainedModels(true);

    try {
      const payload = await getTrainedModels();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setTrainedModels(items);
      setActiveModelFile(payload?.activeModel || "");
      setModelStatus(items.length ? "" : "No trained models found yet.");
    } catch (error) {
      setModelStatus(`Could not load trained models: ${error.message}`);
    } finally {
      setIsLoadingTrainedModels(false);
    }
  }

  async function loadTrainStocks(nextSelectedSymbol = "") {
    setIsLoadingTrainStocks(true);
    setTrainStatus("");

    try {
      const payload = await getTrainableStocks();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setTrainStocks(items);

      if (!items.length) {
        setSelectedTrainStock("");
        return;
      }

      const preferred = nextSelectedSymbol || selectedTrainStock || items[0];
      const finalSymbol = items.includes(preferred) ? preferred : items[0];
      setSelectedTrainStock(finalSymbol);
      setTrainStatus(`Stock selected: ${finalSymbol}`);
    } catch (error) {
      setTrainStatus(`Could not load downloaded stocks: ${error.message}`);
    } finally {
      setIsLoadingTrainStocks(false);
    }
  }

  async function loadBacktestDetails(backtestId) {
    const id = Number(backtestId);
    if (!Number.isFinite(id) || id <= 0) {
      return;
    }

    setIsLoadingBacktestDetails(true);
    try {
      const payload = await getBacktestById(id);
      setBacktestResult(payload || null);
      setSelectedBacktestId(id);
      setBacktestStatus("");
    } catch (error) {
      setBacktestStatus(`Could not load backtest details: ${error.message}`);
    } finally {
      setIsLoadingBacktestDetails(false);
    }
  }

  async function loadBacktestHistory(preferredBacktestId = null) {
    setIsLoadingBacktestHistory(true);
    setBacktestHistoryStatus("");

    try {
      const payload = await getBacktests();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setBacktestHistory(items);

      if (!items.length) {
        setSelectedBacktestId(null);
        setBacktestResult(null);
        setBacktestHistoryStatus("No previous backtests found yet.");
        return;
      }

      const preferred = Number(preferredBacktestId);
      const existingSelected = Number(selectedBacktestId);
      const candidateId =
        (Number.isFinite(preferred) && items.some((item) => Number(item.id) === preferred) && preferred) ||
        (Number.isFinite(existingSelected) && items.some((item) => Number(item.id) === existingSelected) && existingSelected) ||
        Number(items[0].id);

      if (Number.isFinite(candidateId) && candidateId > 0) {
        await loadBacktestDetails(candidateId);
      }
    } catch (error) {
      setBacktestHistoryStatus(`Could not load backtest history: ${error.message}`);
    } finally {
      setIsLoadingBacktestHistory(false);
    }
  }

  async function handleTrainModel() {
    if (!selectedTrainStock) {
      setTrainStatus("Please select a stock first.");
      return;
    }

    if (!Number.isFinite(epochs) || epochs < 1) {
      setTrainStatus("Please enter a valid epochs value (minimum 1).");
      return;
    }

    if (!Number.isFinite(batchSize) || batchSize < 1) {
      setTrainStatus("Please enter a valid batch size value (minimum 1).");
      return;
    }

    if (!Number.isFinite(windowSize) || windowSize < 10) {
      setTrainStatus("Please enter a valid window size value (minimum 10).");
      return;
    }

    setIsTrainingModel(true);
    setTrainSummary(null);
    setTrainProgressSteps(INITIAL_TRAIN_STEPS);
    setRealProgress(0);
    setEpochProgressPct(0);
    setEpochProgressIncrement(1);
    setIsEpochTrainingActive(false);
    completedEpochRef.current = 0;
    epochTimingRef.current = {
      lastCompletedEpoch: 0,
      lastElapsedMs: 0,
      averageEpochMs: null,
    };
    setTrainStatus("Starting training job...");

    try {
      const startPayload = await trainSelectedStock(selectedTrainStock, {
        epochs,
        batchSize,
        windowSize,
        modelType: trainModelType,
      });
      const jobId = startPayload?.jobId;
      if (!jobId) {
        throw new Error("Backend did not return a training job ID.");
      }

      let completedPayload = null;
      for (let i = 0; i < 1200; i += 1) {
        const job = await getTrainingJobStatus(jobId);
        const steps = Array.isArray(job?.steps) ? job.steps : [];
        const trainStep = steps.find((item) => item.key === "train_model");
        const confirmedProgress = Math.max(0, Math.min(100, Number(trainStep?.progressPct) || 0));
        setRealProgress(confirmedProgress);
        const totalEpochsValue = Math.max(1, Number(trainStep?.totalEpochs) || Number(epochs) || 1);
        const completedEpochs = Math.min(totalEpochsValue, Math.floor((confirmedProgress * totalEpochsValue) / 100));
        const elapsedMs = Number(trainStep?.elapsedMs);

        if (completedEpochs > epochTimingRef.current.lastCompletedEpoch && Number.isFinite(elapsedMs) && elapsedMs > 0) {
          const epochDelta = Math.max(1, completedEpochs - epochTimingRef.current.lastCompletedEpoch);
          const elapsedDelta = Math.max(1, elapsedMs - epochTimingRef.current.lastElapsedMs);
          const latestEpochMs = elapsedDelta / epochDelta;

          const previousAverage = epochTimingRef.current.averageEpochMs;
          const nextAverage =
            previousAverage == null ? latestEpochMs : previousAverage * 0.7 + latestEpochMs * 0.3;

          epochTimingRef.current = {
            lastCompletedEpoch: completedEpochs,
            lastElapsedMs: elapsedMs,
            averageEpochMs: nextAverage,
          };
          setEpochProgressIncrement(getEpochProgressIncrement(nextAverage));
        }

        if (completedEpochs > completedEpochRef.current) {
          completedEpochRef.current = completedEpochs;
          setEpochProgressPct(0);
        }

        setIsEpochTrainingActive(trainStep?.status === "in_progress");
        setTrainProgressSteps(
          TRAIN_PROGRESS_STEPS.map((step) => {
            const backendStep = steps.find((item) => item.key === step.key);
            return {
              ...step,
              status: backendStep?.status || "pending",
              durationMs: backendStep?.durationMs ?? null,
              progressPct: backendStep?.progressPct ?? 0,
              currentEpoch: backendStep?.currentEpoch ?? null,
              totalEpochs: backendStep?.totalEpochs ?? null,
              elapsedMs: backendStep?.elapsedMs ?? null,
            };
          })
        );

        const runningStep = steps.find((item) => item.status === "in_progress");
        if (runningStep?.label) {
          if (runningStep.key === "train_model") {
            const pct = Math.max(0, Math.min(100, Number(runningStep.progressPct) || 0));
            const epochText =
              isValidEpochValue(runningStep.currentEpoch) && isValidEpochValue(runningStep.totalEpochs)
                ? ` Epoch ${runningStep.currentEpoch}/${runningStep.totalEpochs}.`
                : "";
            setTrainStatus(`Training model: ${pct}%${epochText}`);
          } else {
            setTrainStatus(runningStep.label);
          }
        }

        if (job?.status === "completed") {
          setRealProgress(100);
          setEpochProgressPct(100);
          setEpochProgressIncrement(1);
          setIsEpochTrainingActive(false);
          completedPayload = job?.result || null;
          break;
        }

        if (job?.status === "failed") {
          const failedMessage = job?.error?.message || "Training failed.";
          throw new Error(failedMessage);
        }

        await new Promise((resolve) => {
          window.setTimeout(resolve, 700);
        });
      }

      if (!completedPayload) {
        throw new Error("Training job timed out before completion.");
      }

      const payload = completedPayload;
      const modelFile = payload?.modelFile || `saved_model_${selectedTrainStock}.keras`;
      setTrainStatus("Training completed successfully.");
      setTrainSummary({
        symbol: payload?.symbol || selectedTrainStock,
        modelType: payload?.modelType || trainModelType,
        epochs: payload?.epochs ?? epochs,
        batchSize: payload?.batchSize ?? batchSize,
        windowSize: payload?.windowSize ?? windowSize,
        accuracy: payload?.metrics?.accuracy,
        modelFile,
      });
      await loadTrainedModels();
    } catch (error) {
      setTrainStatus(`Training failed: ${error.message}`);
    } finally {
      setIsEpochTrainingActive(false);
      setIsTrainingModel(false);
    }
  }

  async function handleActivateModel(modelFile) {
    if (!modelFile) {
      return;
    }

    setIsModelActionPending(true);
    try {
      const payload = await activateTrainedModel(modelFile);
      setActiveModelFile(payload?.activeModel || modelFile);
      setModelStatus(payload?.message || `Active model set to ${modelFile}.`);
      await loadTrainedModels();
    } catch (error) {
      setModelStatus(`Could not activate model: ${error.message}`);
    } finally {
      setIsModelActionPending(false);
    }
  }

  function requestDeleteModel(model) {
    if (!model?.modelFile) {
      return;
    }

    setModelPendingDelete({
      modelFile: model.modelFile,
      symbol: model.symbol || "Unknown",
    });
  }

  function cancelDeleteModel() {
    if (isModelActionPending) {
      return;
    }

    setModelPendingDelete(null);
  }

  async function confirmDeleteModel() {
    const modelFile = modelPendingDelete?.modelFile;
    if (!modelFile) {
      return;
    }

    setIsModelActionPending(true);
    try {
      const payload = await deleteTrainedModel(modelFile);
      setActiveModelFile(payload?.activeModel || "");
      setModelStatus(payload?.message || `Model ${modelFile} deleted.`);
      await loadTrainedModels();
      setModelPendingDelete(null);
    } catch (error) {
      setModelStatus(`Could not delete model: ${error.message}`);
    } finally {
      setIsModelActionPending(false);
    }
  }

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

  function requestDeleteSymbol(symbol) {
    if (!symbol || isSymbolDeletePending) {
      return;
    }

    setSymbolPendingDelete(String(symbol).trim().toUpperCase());
  }

  function cancelDeleteSymbol() {
    if (isSymbolDeletePending) {
      return;
    }

    setSymbolPendingDelete("");
  }

  async function confirmDeleteSymbol() {
    const symbol = String(symbolPendingDelete || "").trim().toUpperCase();
    if (!symbol) {
      return;
    }

    setIsSymbolDeletePending(true);

    try {
      const payload = await deleteTrackedSymbol(symbol);
      setSymbolMessage(
        `Deleted ${payload.deletedRecords || 0} records and ${payload.deletedFiles || 0} files for ${payload.symbol || symbol}.`
      );
      await loadTrackedSymbols("");
      setSymbolPendingDelete("");
    } catch (error) {
      setSymbolMessage(`Delete failed: ${error.message}`);
    } finally {
      setIsSymbolDeletePending(false);
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

    // Clear previous messages and start download
    setDownloadMessage("Downloading data...");
    setIsDownloading(true);

    try {
      const payload = await downloadDataset({ symbols, startDate });
      const downloadedCount = Array.isArray(payload?.downloaded) ? payload.downloaded.length : 0;
      const failedCount = Array.isArray(payload?.failed) ? payload.failed.length : 0;
      const refreshedSymbol = payload?.downloaded?.[0]?.symbol || symbols[0];
      setDownloadMessage(
        `Download completed: ${downloadedCount} succeeded, ${failedCount} failed for ${symbols.join(", ")}.`
      );

      if (downloadedCount > 0) {
        await loadTrackedSymbols(refreshedSymbol);
      }
    } catch (error) {
      // Display the backend error message directly (already includes descriptive context)
      const errorMsg = error.message || "Unknown download error";
      setDownloadMessage(`Download failed: ${errorMsg}`);
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleRunBacktest() {
    if (!activeModelFile) {
      setBacktestStatus("Please activate a trained model in the Train Model step before backtesting.");
      return;
    }

    if (!Number.isFinite(backtestInitialCash) || Number(backtestInitialCash) <= 0) {
      setBacktestStatus("Initial cash must be a positive number.");
      return;
    }

    if (!Number.isFinite(backtestRsiWindow) || Number(backtestRsiWindow) < 2) {
      setBacktestStatus("RSI window must be at least 2.");
      return;
    }

    if (!Number.isFinite(backtestLowerBound) || !Number.isFinite(backtestUpperBound)) {
      setBacktestStatus("RSI bounds must be valid numbers.");
      return;
    }

    if (Number(backtestLowerBound) >= Number(backtestUpperBound)) {
      setBacktestStatus("RSI lower bound must be less than upper bound.");
      return;
    }

    if (!Number.isFinite(backtestMinStreak) || Number(backtestMinStreak) < 1) {
      setBacktestStatus("Minimum consecutive predictions must be at least 1.");
      return;
    }

    setIsBacktesting(true);
    setBacktestRunError("");
    setBacktestResult(null);
    setBacktestStatus("Running backtest with active model...");

    try {
      const payload = await runBacktestStrategy({
        symbol: backtestSymbol || undefined,
        initialCash: Number(backtestInitialCash),
        rsiWindow: Number(backtestRsiWindow),
        lowerBound: Number(backtestLowerBound),
        upperBound: Number(backtestUpperBound),
        minConsecutivePredictions: Number(backtestMinStreak),
      });

      setBacktestResult(payload || null);
      const createdId = Number(payload?.id);
      if (Number.isFinite(createdId) && createdId > 0) {
        setSelectedBacktestId(createdId);
      }
      setBacktestRunError("");
      setBacktestStatus("Backtest completed successfully.");
      await loadBacktestHistory(Number.isFinite(createdId) && createdId > 0 ? createdId : null);
    } catch (error) {
      setBacktestRunError(error.message || "Backtest request failed.");
      setBacktestStatus(`Backtest failed: ${error.message}`);
    } finally {
      setIsBacktesting(false);
    }
  }

  function requestDeleteBacktest(item) {
    const backtestId = Number(item?.id);
    if (!Number.isFinite(backtestId) || backtestId <= 0) {
      return;
    }

    setBacktestPendingDelete(item);
  }

  function cancelDeleteBacktest() {
    if (backtestDeletePendingId != null) {
      return;
    }

    setBacktestPendingDelete(null);
  }

  async function confirmDeleteBacktest() {
    const item = backtestPendingDelete;
    const backtestId = Number(item?.id);
    if (!Number.isFinite(backtestId) || backtestId <= 0) {
      return;
    }

    setBacktestDeletePendingId(backtestId);
    setBacktestHistoryStatus("");

    try {
      await deleteBacktestById(backtestId);

      const remaining = backtestHistory.filter((entry) => Number(entry.id) !== backtestId);
      setBacktestHistory(remaining);

      const wasSelected = Number(selectedBacktestId) === backtestId;
      if (!remaining.length) {
        setSelectedBacktestId(null);
        setBacktestResult(null);
        setBacktestHistoryStatus("No previous backtests found yet.");
      } else if (wasSelected) {
        const fallbackId = Number(remaining[0].id);
        if (Number.isFinite(fallbackId) && fallbackId > 0) {
          await loadBacktestDetails(fallbackId);
        }
      }

      setBacktestStatus("Backtest deleted successfully.");
      setBacktestPendingDelete(null);
    } catch (error) {
      setBacktestHistoryStatus(`Could not delete backtest: ${error.message}`);
    } finally {
      setBacktestDeletePendingId(null);
    }
  }

  function scrollBacktestHistory(direction) {
    if (!backtestHistoryBarRef.current) {
      return;
    }

    const step = Math.max(220, Math.floor(backtestHistoryBarRef.current.clientWidth * 0.55));
    backtestHistoryBarRef.current.scrollBy({
      left: direction === "left" ? -step : step,
      behavior: "smooth",
    });
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
            <h2 className="hero-title mb-2">Welcome to your stock prediction workspace</h2>
            <p className="hero-subtitle mb-0">
              Download data, train with LSTM or TCN, and validate your strategies step by step from one user-friendly dashboard.
            </p>
            <div className="home-quick-actions mt-3">
              <button type="button" className="btn btn-cyan btn-sm" onClick={() => setActiveMenu("dataset")}>
                Start with Dataset
              </button>
              <button type="button" className="btn btn-outline-cyan btn-sm" onClick={() => setActiveMenu("train")}>
                Train LSTM / TCN
              </button>
              <button type="button" className="btn btn-outline-cyan btn-sm" onClick={() => setActiveMenu("backtest")}>
                Run Backtest
              </button>
            </div>
            <div className="home-welcome-grid mt-3">
              <div className="home-welcome-card">
                <p className="home-welcome-title mb-1">Step 1</p>
                <p className="mb-0">Download and preview stock datasets.</p>
              </div>
              <div className="home-welcome-card">
                <p className="home-welcome-title mb-1">Step 2</p>
                <p className="mb-0">Choose your model: keep LSTM or switch to TCN.</p>
              </div>
              <div className="home-welcome-card">
                <p className="home-welcome-title mb-1">Step 3</p>
                <p className="mb-0">Evaluate metrics and backtest before comparing outcomes.</p>
              </div>
            </div>
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
                              onClick={() => requestDeleteSymbol(item.symbol)}
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

                                <LightweightOhlcChart points={allPreviewPoints} theme={theme} showEquityPane={false} />
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
              ) : activeMenu === "train" ? (
                <div className="dataset-form">
                  <div className="row g-3">
                    <div className="col-12 col-xl-4">
                      <div className="trained-models-panel h-100">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <p className="section-tag mb-0">Model History</p>
                          <button
                            type="button"
                            className="btn btn-outline-cyan btn-sm"
                            onClick={loadTrainedModels}
                            disabled={isLoadingTrainedModels || isTrainingModel || isModelActionPending}
                          >
                            {isLoadingTrainedModels ? "Loading..." : "Refresh"}
                          </button>
                        </div>

                        <p className="dataset-help mb-2">
                          Pick exactly one active model for the next backtesting step.
                        </p>

                        {modelStatus ? <p className="dataset-status mb-2">{modelStatus}</p> : null}

                        {isLoadingTrainedModels ? (
                          <p className="dataset-help mb-0">Loading trained models...</p>
                        ) : trainedModels.length === 0 ? (
                          <p className="dataset-help mb-0">No saved .keras model files available.</p>
                        ) : (
                          <div className="trained-model-list" role="list" aria-label="Trained models">
                            {trainedModels.map((model) => {
                              const isActive = model.modelFile === activeModelFile;

                              return (
                                <div
                                  key={model.modelFile}
                                  className={`trained-model-item ${isActive ? "active" : ""}`}
                                  role="listitem"
                                >
                                  <div className="trained-model-header">
                                    <p className="trained-model-name mb-0">{model.symbol || "Unknown"}</p>
                                    {isActive ? <span className="trained-model-badge">Active</span> : null}
                                  </div>

                                  <p className="trained-model-meta mb-1">{model.modelFile}</p>
                                  <p className="trained-model-meta mb-1">Trained: {formatTimestamp(model.trainedAt)}</p>
                                  <p className="trained-model-meta mb-2">
                                    Params: E{model.epochs ?? "--"} / B{model.batchSize ?? "--"} / W{model.windowSize ?? "--"}
                                  </p>
                                  <p className="trained-model-meta mb-2">
                                    Type: {String(model.modelType || "lstm").toUpperCase()}
                                  </p>

                                  <div className="d-flex gap-2">
                                    <button
                                      type="button"
                                      className="btn btn-cyan btn-sm"
                                      onClick={() => handleActivateModel(model.modelFile)}
                                      disabled={isActive || isTrainingModel || isModelActionPending}
                                    >
                                      {isActive ? "Selected" : "Activate"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-outline-danger btn-sm"
                                      onClick={() => requestDeleteModel(model)}
                                      disabled={isTrainingModel || isModelActionPending}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-12 col-xl-8">
                      <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center mb-3">
                        <label className="form-label dataset-label mb-0" htmlFor="train-stock-select">
                          Select Downloaded Stock
                        </label>
                        <button
                          type="button"
                          className="btn btn-outline-cyan btn-sm"
                          onClick={() => loadTrainStocks(selectedTrainStock)}
                          disabled={isLoadingTrainStocks || isTrainingModel}
                        >
                          {isLoadingTrainStocks ? "Loading..." : "Refresh"}
                        </button>
                      </div>

                      <div className="mb-3">
                        <select
                          id="train-stock-select"
                          className="form-select dataset-input"
                          value={selectedTrainStock}
                          onChange={(event) => {
                            setSelectedTrainStock(event.target.value);
                            setTrainStatus(`Stock selected: ${event.target.value}`);
                          }}
                          disabled={isLoadingTrainStocks || isTrainingModel || trainStocks.length === 0}
                        >
                          {trainStocks.length === 0 ? (
                            <option value="">No downloaded stocks found</option>
                          ) : (
                            trainStocks.map((symbol) => (
                              <option key={symbol} value={symbol}>
                                {symbol}
                              </option>
                            ))
                          )}
                        </select>
                        <p className="dataset-help mb-0 mt-2">
                          Only stocks with existing CSV files in the backend data folder are listed.
                        </p>
                      </div>

                      <div className="mb-3">
                        <label className="form-label dataset-label" htmlFor="train-model-type-select">
                          Model Type
                        </label>
                        <select
                          id="train-model-type-select"
                          className="form-select dataset-input"
                          value={trainModelType}
                          onChange={(event) => setTrainModelType(event.target.value)}
                          disabled={isTrainingModel}
                        >
                          {TRAIN_MODEL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="dataset-help mb-0 mt-2">
                          LSTM uses the existing architecture. TCN uses the newly added temporal convolution model.
                        </p>
                      </div>

                      <div className="row g-3 mb-3">
                        <div className="col-12 col-md-4">
                          <label className="form-label dataset-label" htmlFor="epochs-input">
                            Epochs
                          </label>
                          <input
                            id="epochs-input"
                            type="number"
                            min="1"
                            step="1"
                            className="form-control dataset-input"
                            value={epochs}
                            onChange={(event) => setEpochs(Number(event.target.value))}
                            disabled={isTrainingModel}
                          />
                          <p className="dataset-help mb-0 mt-1">Default: {DEFAULT_EPOCHS}</p>
                        </div>

                        <div className="col-12 col-md-4">
                          <label className="form-label dataset-label" htmlFor="batch-size-input">
                            Batch Size
                          </label>
                          <input
                            id="batch-size-input"
                            type="number"
                            min="1"
                            step="1"
                            className="form-control dataset-input"
                            value={batchSize}
                            onChange={(event) => setBatchSize(Number(event.target.value))}
                            disabled={isTrainingModel}
                          />
                          <p className="dataset-help mb-0 mt-1">Default: {DEFAULT_BATCH_SIZE}</p>
                        </div>

                        <div className="col-12 col-md-4">
                          <label className="form-label dataset-label" htmlFor="window-size-input">
                            Window Size
                          </label>
                          <input
                            id="window-size-input"
                            type="number"
                            min="10"
                            step="1"
                            className="form-control dataset-input"
                            value={windowSize}
                            onChange={(event) => setWindowSize(Number(event.target.value))}
                            disabled={isTrainingModel}
                          />
                          <p className="dataset-help mb-0 mt-1">Default: {DEFAULT_WINDOW_SIZE}</p>
                        </div>
                      </div>

                      <div className="d-flex flex-column flex-md-row gap-2 align-items-md-center">
                        <button
                          type="button"
                          className="btn btn-cyan px-4"
                          onClick={handleTrainModel}
                          disabled={isLoadingTrainStocks || isTrainingModel || !selectedTrainStock}
                        >
                          {isTrainingModel ? "Training..." : "Train"}
                        </button>
                        {trainStatus ? <p className="dataset-status mb-0">{trainStatus}</p> : null}
                      </div>

                      {isTrainingModel ? (
                        <ul className="tracked-record-list mt-3 mb-0">
                          {trainProgressSteps.map((step) => (
                            <li key={step.key}>
                              <strong>
                                {step.status === "completed"
                                  ? "Done"
                                  : step.status === "in_progress"
                                    ? "In progress"
                                    : step.status === "failed"
                                      ? "Failed"
                                      : "Pending"}
                              </strong>
                              <span> - {step.label}</span>
                              {step.key === "train_model" ? (
                                <>
                                  <span>{` ${Math.max(0, Math.min(100, Number(epochProgressPct) || 0))}%`}</span>
                                  <span>{` | Overall ${Math.max(0, Math.min(100, Number(realProgress) || 0))}%`}</span>
                                  {isValidEpochValue(step.currentEpoch) && isValidEpochValue(step.totalEpochs) ? (
                                    <span>{` | Epoch ${step.currentEpoch} / ${step.totalEpochs}`}</span>
                                  ) : null}
                                  {Number.isFinite(Number(step.elapsedMs)) ? (
                                    <span>{` | ${formatElapsedSeconds(step.elapsedMs)}s elapsed`}</span>
                                  ) : null}
                                  <div className="progress mt-2" style={{ height: "8px", maxWidth: "420px" }}>
                                    <div
                                      className="progress-bar bg-info"
                                      role="progressbar"
                                      style={{
                                        width: `${Math.max(0, Math.min(100, Number(realProgress) || 0))}%`,
                                      }}
                                      aria-valuenow={Math.max(0, Math.min(100, Number(realProgress) || 0))}
                                      aria-valuemin="0"
                                      aria-valuemax="100"
                                    />
                                  </div>
                                </>
                              ) : null}
                              {step.status === "completed" && Number.isFinite(step.durationMs) ? (
                                <span> ({(step.durationMs / 1000).toFixed(1)}s)</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {trainSummary ? (
                        <div className="tracked-details mt-3">
                          <p className="section-tag mb-2">Training Summary</p>
                          <ul className="tracked-record-list mb-0">
                            <li>
                              <strong>Selected stock</strong>
                              <span> - {trainSummary.symbol}</span>
                            </li>
                            <li>
                              <strong>Model type</strong>
                              <span> - {String(trainSummary.modelType || "lstm").toUpperCase()}</span>
                            </li>
                            <li>
                              <strong>Epochs used</strong>
                              <span> - {trainSummary.epochs}</span>
                            </li>
                            <li>
                              <strong>Batch size used</strong>
                              <span> - {trainSummary.batchSize}</span>
                            </li>
                            <li>
                              <strong>Window size used</strong>
                              <span> - {trainSummary.windowSize}</span>
                            </li>
                            <li>
                              <strong>Accuracy</strong>
                              <span>
                                {" "}
                                -{" "}
                                {Number.isFinite(Number(trainSummary.accuracy))
                                  ? `${Number(trainSummary.accuracy).toFixed(2)}%`
                                  : "--"}
                              </span>
                            </li>
                            <li>
                              <strong>Saved model filename</strong>
                              <span> - {trainSummary.modelFile}</span>
                            </li>
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : activeMenu === "backtest" ? (
                <div className="dataset-form">
                  <div className="backtest-history-topbar mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <p className="section-tag mb-0">Backtest History</p>
                      <span className="dataset-help">{backtestHistory.length} runs</span>
                    </div>

                    {backtestHistoryStatus ? <p className="dataset-status mb-2">{backtestHistoryStatus}</p> : null}

                    <div
                      className={`backtest-history-carousel ${showBacktestCarouselNav ? "has-arrows" : "no-arrows"}`}
                      aria-label="Backtest history carousel"
                    >
                      {showBacktestCarouselNav ? (
                        <button
                          type="button"
                          className="btn btn-outline-cyan btn-sm backtest-carousel-arrow"
                          onClick={() => scrollBacktestHistory("left")}
                          aria-label="Scroll backtest history left"
                          disabled={isLoadingBacktestHistory || backtestHistory.length === 0}
                        >
                          ◀
                        </button>
                      ) : null}

                      <div className="backtest-history-viewport">
                        <div className="backtest-history-row" ref={backtestHistoryBarRef}>
                          {isLoadingBacktestHistory ? (
                            <div className="backtest-history-card muted">Loading history...</div>
                          ) : backtestHistory.length === 0 ? (
                            <div className="backtest-history-card muted">
                              No stored backtests yet. Run one to begin history tracking.
                            </div>
                          ) : (
                            backtestHistory.map((item) => {
                              const isSelected = Number(item.id) === Number(selectedBacktestId);
                              const totalReturn = Number(item.totalReturnPct);
                              const isDeleting = Number(backtestDeletePendingId) === Number(item.id);

                              return (
                                <div key={item.id} className={`backtest-history-card ${isSelected ? "active" : ""}`}>
                                  <button
                                    type="button"
                                    className="backtest-history-card-select"
                                    onClick={() => loadBacktestDetails(item.id)}
                                    disabled={isLoadingBacktestDetails || isDeleting}
                                  >
                                    <div className="d-flex justify-content-between align-items-center">
                                      <strong>{item.symbol}</strong>
                                      <span
                                        className={`backtest-history-return ${
                                          Number.isFinite(totalReturn)
                                            ? totalReturn >= 0
                                              ? "is-positive"
                                              : "is-negative"
                                            : ""
                                        }`}
                                      >
                                        {Number.isFinite(totalReturn) ? `${formatPrice(totalReturn)}%` : "--"}
                                      </span>
                                    </div>
                                    <p className="backtest-history-meta mb-0">{formatTimestamp(item.backtestAt)}</p>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-sm backtest-history-delete-btn"
                                    onClick={() => requestDeleteBacktest(item)}
                                    disabled={isDeleting || isLoadingBacktestDetails}
                                    aria-label={`Delete backtest ${item.id}`}
                                    title="Delete"
                                  >
                                    {isDeleting ? (
                                      "..."
                                    ) : (
                                      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
                                        <path
                                          d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v8h-2V9zm4 0h2v8h-2V9zM7 9h2v8H7V9z"
                                          fill="currentColor"
                                        />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      {showBacktestCarouselNav ? (
                        <button
                          type="button"
                          className="btn btn-outline-cyan btn-sm backtest-carousel-arrow"
                          onClick={() => scrollBacktestHistory("right")}
                          aria-label="Scroll backtest history right"
                          disabled={isLoadingBacktestHistory || backtestHistory.length === 0}
                        >
                          ▶
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="row g-3">
                    <div className="col-12 col-xl-4">
                      <div className="trained-models-panel h-100">
                        <p className="section-tag mb-2">Backtest Inputs</p>
                        <p className="dataset-help mb-3">
                          Configure parameters and run a new backtest. History selection is managed in the top bar.
                        </p>

                        <div className="mb-3">
                          <div className="d-flex align-items-center justify-content-between">
                            <label className="form-label dataset-label mb-1" htmlFor="backtest-symbol-select">
                              Symbol
                            </label>
                            <span className="dataset-help mb-1">Active model shown</span>
                          </div>
                          <input
                            id="backtest-symbol-select"
                            type="text"
                            className="form-control dataset-input"
                            value={backtestSymbol || "No active model selected"}
                            readOnly
                            disabled
                          />
                        </div>

                        <div className="row g-2 mb-2">
                          <div className="col-12">
                            <label className="form-label dataset-label" htmlFor="backtest-cash-input">
                              Initial Cash
                            </label>
                            <input
                              id="backtest-cash-input"
                              type="number"
                              min="1"
                              className="form-control dataset-input"
                              value={backtestInitialCash}
                              onChange={(event) => setBacktestInitialCash(Number(event.target.value))}
                              disabled={isBacktesting}
                            />
                          </div>

                          <div className="col-6">
                            <label className="form-label dataset-label" htmlFor="backtest-rsi-window-input">
                              RSI Window
                            </label>
                            <input
                              id="backtest-rsi-window-input"
                              type="number"
                              min="2"
                              className="form-control dataset-input"
                              value={backtestRsiWindow}
                              onChange={(event) => setBacktestRsiWindow(Number(event.target.value))}
                              disabled={isBacktesting}
                            />
                          </div>

                          <div className="col-6">
                            <label className="form-label dataset-label" htmlFor="backtest-streak-input">
                              Min Streak
                            </label>
                            <input
                              id="backtest-streak-input"
                              type="number"
                              min="1"
                              className="form-control dataset-input"
                              value={backtestMinStreak}
                              onChange={(event) => setBacktestMinStreak(Number(event.target.value))}
                              disabled={isBacktesting}
                            />
                          </div>

                          <div className="col-6">
                            <label className="form-label dataset-label" htmlFor="backtest-lower-input">
                              RSI Lower
                            </label>
                            <input
                              id="backtest-lower-input"
                              type="number"
                              min="1"
                              max="99"
                              className="form-control dataset-input"
                              value={backtestLowerBound}
                              onChange={(event) => setBacktestLowerBound(Number(event.target.value))}
                              disabled={isBacktesting}
                            />
                          </div>

                          <div className="col-6">
                            <label className="form-label dataset-label" htmlFor="backtest-upper-input">
                              RSI Upper
                            </label>
                            <input
                              id="backtest-upper-input"
                              type="number"
                              min="1"
                              max="99"
                              className="form-control dataset-input"
                              value={backtestUpperBound}
                              onChange={(event) => setBacktestUpperBound(Number(event.target.value))}
                              disabled={isBacktesting}
                            />
                          </div>

                        </div>

                        <div className="d-flex flex-column gap-2 mt-3">
                          <button
                            type="button"
                            className="btn btn-cyan"
                            onClick={handleRunBacktest}
                            disabled={isBacktesting || !activeModelFile}
                          >
                            {isBacktesting ? "Running Backtest..." : "Run Backtest"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-cyan"
                            onClick={() => loadBacktestHistory(selectedBacktestId)}
                            disabled={isLoadingBacktestHistory || isBacktesting}
                          >
                            {isLoadingBacktestHistory ? "Refreshing history..." : "Refresh History"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-cyan"
                            onClick={loadTrainedModels}
                            disabled={isLoadingTrainedModels || isBacktesting}
                          >
                            {isLoadingTrainedModels ? "Refreshing models..." : "Refresh Active Model"}
                          </button>
                        </div>

                        <div className="tracked-details mt-3 backtest-model-summary">
                          <p className="section-tag mb-2">Model in Use</p>
                          <p className="dataset-help mb-1 backtest-model-line">
                            Active file: <span className="backtest-model-file">{activeModelFile || "None selected"}</span>
                          </p>
                          <p className="dataset-help mb-1 backtest-model-line">
                            Active symbol: <span className="backtest-model-file">{activeBacktestSymbol || "None selected"}</span>
                          </p>
                          <p className="dataset-help mb-0">{modelStatus || "Activate one model in Train Model step."}</p>
                        </div>

                        {backtestStatus ? <p className="dataset-status mb-0 mt-3">{backtestStatus}</p> : null}
                      </div>
                    </div>

                    <div className="col-12 col-xl-8">
                      {isLoadingBacktestDetails ? (
                        <div className="tracked-details">
                          <p className="section-tag mb-2">Backtest Output</p>
                          <p className="dataset-help mb-0">Loading selected backtest details...</p>
                        </div>
                      ) : isBacktesting ? (
                        <div className="tracked-details backtest-loading-shell">
                          <p className="section-tag mb-2">Backtest Output</p>
                          <div className="backtest-loader" aria-hidden="true" />
                          <p className="dataset-help mb-0">Running backtest...</p>
                        </div>
                      ) : backtestRunError ? (
                        <div className="tracked-details backtest-error-shell">
                          <p className="section-tag mb-2">Backtest Output</p>
                          <p className="dataset-status mb-0">Backtest failed: {backtestRunError}</p>
                        </div>
                      ) : backtestResult ? (
                        <div className="tracked-details">
                          <p className="dataset-help mb-1">
                            Strategy: Combine RSI threshold crossovers with active LSTM direction forecasts to decide entries and exits.
                          </p>
                          <p className="dataset-help mb-2">
                            Buy when RSI is oversold and bullish predictions persist; sell when RSI is overbought and bearish predictions persist.
                          </p>
                          <p className="section-tag mb-2">Backtest Summary</p>
                          <h3 className="mb-3">{backtestResult.symbol}</h3>

                          <div className="row g-2 mb-3">
                            <div className="col-6 col-lg-3">
                              <div className="mini-tile h-100">
                                <p className="mb-1 dataset-help">Total Return</p>
                                <p className="mb-0 backtest-metric">{formatPrice(backtestResult.metrics?.totalReturnPct)}%</p>
                              </div>
                            </div>
                            <div className="col-6 col-lg-3">
                              <div className="mini-tile h-100">
                                <p className="mb-1 dataset-help">CAGR</p>
                                <p className="mb-0 backtest-metric">{formatPrice(backtestResult.metrics?.cagrPct)}%</p>
                              </div>
                            </div>
                            <div className="col-6 col-lg-3">
                              <div className="mini-tile h-100">
                                <p className="mb-1 dataset-help">Directional Accuracy</p>
                                <p className="mb-0 backtest-metric">{formatPrice(backtestResult.metrics?.directionalAccuracyPct)}%</p>
                              </div>
                            </div>
                            <div className="col-6 col-lg-3">
                              <div className="mini-tile h-100">
                                <p className="mb-1 dataset-help">Max Drawdown</p>
                                <p className="mb-0 backtest-metric">{formatPrice(backtestResult.metrics?.maxDrawdownPct)}%</p>
                              </div>
                            </div>
                          </div>

                          <ul className="tracked-record-list mb-3">
                            <li>
                              <strong>Final Equity</strong>
                              <span> - {formatPrice(backtestResult.metrics?.finalEquity)}</span>
                            </li>
                            <li>
                              <strong>Buy and Hold Return</strong>
                              <span> - {formatPrice(backtestResult.metrics?.buyHoldReturnPct)}%</span>
                            </li>
                            <li>
                              <strong>Trades / Win Rate</strong>
                              <span>
                                {" "}
                                - {backtestResult.metrics?.tradeCount ?? 0} / {formatPrice(backtestResult.metrics?.winRatePct)}%
                              </span>
                            </li>
                            <li>
                              <strong>MAE / RMSE / MAPE</strong>
                              <span>
                                {" "}
                                - {formatPrice(backtestResult.metrics?.mae)} / {formatPrice(backtestResult.metrics?.rmse)} / {formatPrice(backtestResult.metrics?.mape)}%
                              </span>
                            </li>
                            <li>
                              <strong>Dataset / Model</strong>
                              <span> - {backtestResult.datasetFile} / {backtestResult.modelFile}</span>
                            </li>
                          </ul>

                          <p className="section-tag mb-2">Active Model Training Details</p>
                          <ul className="tracked-record-list mb-3">
                            <li>
                              <strong>Epochs / Batch / Sequence</strong>
                              <span>
                                {" "}
                                - {backtestResult.trainingContext?.epochs ?? "--"} / {backtestResult.trainingContext?.batchSize ?? "--"} / {backtestResult.trainingContext?.sequenceLength ?? "--"}
                              </span>
                            </li>
                            <li>
                              <strong>Features Used</strong>
                              <span>
                                {" "}
                                - {Array.isArray(backtestResult.trainingContext?.featuresUsed) && backtestResult.trainingContext.featuresUsed.length
                                  ? backtestResult.trainingContext.featuresUsed.join(", ")
                                  : "--"}
                              </span>
                            </li>
                            <li>
                              <strong>Training Date Range</strong>
                              <span>
                                {" "}
                                - {backtestResult.trainingContext?.datasetStartDate || "--"}{" -> "}{backtestResult.trainingContext?.datasetEndDate || "--"}
                              </span>
                            </li>
                          </ul>

                          <p className="section-tag mb-2">Executed Trade Signals</p>
                          <div className="table-responsive backtest-table-wrap">
                            <table className="table table-sm table-dark table-borderless mb-0">
                              <thead>
                                <tr>
                                  <th scope="col">Trade ID</th>
                                  <th scope="col">Date</th>
                                  <th scope="col">Signal</th>
                                  <th scope="col">Price</th>
                                  <th scope="col">Shares</th>
                                  <th scope="col">Returns (P/L)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(backtestResult.trades || []).length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="text-muted">
                                      No buy/sell signals were executed for this backtest run.
                                    </td>
                                  </tr>
                                ) : (
                                  (backtestResult.trades || []).map((trade, index) => (
                                    <tr key={`${trade.tradeId}-${trade.date}-${index}`}>
                                      <td>{trade.tradeId ?? "--"}</td>
                                      <td>{formatTimestamp(trade.date)}</td>
                                      <td>{String(trade.action || "").toUpperCase()}</td>
                                      <td>{formatPrice(trade.price)}</td>
                                      <td>{Number.isFinite(Number(trade.shares)) ? Number(trade.shares).toFixed(4) : "--"}</td>
                                      <td
                                        className={
                                          Number(trade.pnl) > 0
                                            ? "text-success"
                                            : Number(trade.pnl) < 0
                                              ? "text-danger"
                                              : "text-muted"
                                        }
                                      >
                                        {trade.action === "sell" ? formatCurrency(trade.pnl) : "--"}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>

                          <div className="tracked-details mt-3">
                            <p className="section-tag mb-2">Complete Dataset OHLC with Trades</p>
                            <p className="dataset-help mb-2">
                              Full OHLC history for {backtestResult.symbol}. Markers show executed entry and exit trades.
                            </p>

                            <div className="d-flex flex-wrap gap-2 mb-2">
                              <span className="preview-chip">BUY markers: {backtestTradeMarkers.filter((t) => t.action === "buy").length}</span>
                              <span className="preview-chip">SELL markers: {backtestTradeMarkers.filter((t) => t.action === "sell").length}</span>
                              <span className="preview-chip">Data points: {backtestChartPoints.length}</span>
                            </div>

                            {backtestChartPoints.length > 0 ? (
                              <LightweightOhlcChart
                                points={backtestChartPoints}
                                tradeMarkers={backtestTradeMarkers}
                                equityCurve={backtestEquityPoints}
                                theme={theme}
                              />
                            ) : (
                              <p className="dataset-help mb-0">No chart data available in this backtest response.</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="tracked-details">
                          <p className="section-tag mb-2">Backtest Output</p>
                          <p className="dataset-help mb-0">
                            Select a backtest from history or run a new one to view performance metrics, charts, and trades.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : activeMenu === "help" ? (
                <HelpPage onNavigate={setActiveMenu} />
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

      {modelPendingDelete ? (
        <div className="model-delete-modal-overlay" role="presentation">
          <div className="model-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-model-title">
            <p className="section-tag mb-2">Confirm Deletion</p>
            <h3 id="delete-model-title" className="mb-2">Delete trained model?</h3>
            <p className="dataset-help mb-2">
              You are about to delete the model for <strong>{modelPendingDelete.symbol}</strong>.
            </p>
            <div className="model-delete-target mb-3">{modelPendingDelete.modelFile}</div>
            <p className="dataset-help mb-3">This action cannot be undone.</p>

            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-cyan"
                onClick={cancelDeleteModel}
                disabled={isModelActionPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={confirmDeleteModel}
                disabled={isModelActionPending}
              >
                {isModelActionPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {symbolPendingDelete ? (
        <div className="model-delete-modal-overlay" role="presentation">
          <div className="model-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-symbol-title">
            <p className="section-tag mb-2">Confirm Deletion</p>
            <h3 id="delete-symbol-title" className="mb-2">Delete dataset symbol data?</h3>
            <p className="dataset-help mb-2">
              You are about to delete all tracked records and files for <strong>{symbolPendingDelete}</strong>.
            </p>
            <div className="model-delete-target mb-3">{symbolPendingDelete}</div>
            <p className="dataset-help mb-3">This action cannot be undone.</p>

            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-cyan"
                onClick={cancelDeleteSymbol}
                disabled={isSymbolDeletePending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={confirmDeleteSymbol}
                disabled={isSymbolDeletePending}
              >
                {isSymbolDeletePending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {backtestPendingDelete ? (
        <div className="model-delete-modal-overlay" role="presentation">
          <div className="model-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-backtest-title">
            <p className="section-tag mb-2">Confirm Deletion</p>
            <h3 id="delete-backtest-title" className="mb-2">Delete backtest run?</h3>
            <p className="dataset-help mb-2">
              Delete backtest for <strong>{backtestPendingDelete?.symbol || "this stock"}</strong> at {" "}
              {formatTimestamp(backtestPendingDelete?.backtestAt)}.
            </p>
            <div className="model-delete-target mb-3">Backtest ID: {backtestPendingDelete?.id}</div>
            <p className="dataset-help mb-3">This action cannot be undone.</p>

            <div className="d-flex gap-2 justify-content-end">
              <button
                type="button"
                className="btn btn-outline-cyan"
                onClick={cancelDeleteBacktest}
                disabled={backtestDeletePendingId != null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={confirmDeleteBacktest}
                disabled={backtestDeletePendingId != null}
              >
                {backtestDeletePendingId != null ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
