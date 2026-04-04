import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import {
  getAvailableDatasets,
  trainModel,
} from "../services/trainService";
import "./TrainModelPage.css";

const DEFAULT_PARAMS = {
  window_size: 60,
  epochs: 5,
  batch_size: 2,
  num_units: 150,
};

export default function TrainModelPage({ onNavigate }) {
  const { theme } = useTheme();
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [isLoadingDatasets, setIsLoadingDatasets] = useState(false);
  const [datasetError, setDatasetError] = useState("");

  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingError, setTrainingError] = useState("");
  const [trainingResult, setTrainingResult] = useState(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  async function loadDatasets() {
    setIsLoadingDatasets(true);
    setDatasetError("");
    try {
      const response = await getAvailableDatasets();
      const datasetList = response.datasets || [];
      setDatasets(datasetList);
      if (datasetList.length > 0) {
        setSelectedDataset(datasetList[0]);
      }
    } catch (error) {
      setDatasetError(
        error.message || "Failed to load available datasets"
      );
    } finally {
      setIsLoadingDatasets(false);
    }
  }

  function handleParamChange(paramName, value) {
    setParams((prev) => ({
      ...prev,
      [paramName]: parseInt(value, 10) || DEFAULT_PARAMS[paramName],
    }));
  }

  async function handleTrain() {
    if (!selectedDataset) {
      setTrainingError("Please select a dataset");
      return;
    }

    setIsTraining(true);
    setTrainingError("");
    setTrainingResult(null);

    try {
      const payload = {
        symbol: selectedDataset,
        ...params,
      };

      const result = await trainModel(payload);
      setTrainingResult(result);
    } catch (error) {
      const errorMessage =
        error.response?.data?.detail || error.message || "Training failed";
      setTrainingError(errorMessage);
    } finally {
      setIsTraining(false);
    }
  }

  function resetDefaults() {
    setParams(DEFAULT_PARAMS);
  }

  return (
    <div className={`train-model-page train-model-${theme}`}>
      <div className="train-container">
        {/* Header with back button */}
        <div className="train-header-wrapper">
          <button
            className="btn-back"
            onClick={() => onNavigate && onNavigate("workflow")}
            title="Back to Workflow"
          >
            ← Back
          </button>
        </div>

        {/* Header */}
        <div className="train-header">
          <h1>Train LSTM Model</h1>
          <p>Select a dataset and configure training parameters</p>
        </div>

        {/* Main content */}
        <div className="train-content">
          {/* Left column: Configuration */}
          <div className="train-config">
            {/* Dataset Selection */}
            <div className="config-section">
              <h2>1. Select Dataset</h2>
              {isLoadingDatasets ? (
                <p className="loading-text">Loading datasets...</p>
              ) : datasetError ? (
                <p className="error-text">{datasetError}</p>
              ) : datasets.length === 0 ? (
                <p className="empty-text">
                  No datasets available. Please download datasets first.
                </p>
              ) : (
                <select
                  className="dataset-select"
                  value={selectedDataset}
                  onChange={(e) => setSelectedDataset(e.target.value)}
                  disabled={isTraining}
                >
                  {datasets.map((dataset) => (
                    <option key={dataset} value={dataset}>
                      {dataset}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Training Parameters */}
            <div className="config-section">
              <h2>2. Training Parameters</h2>
              <div className="param-inputs">
                {/* Sequence Length (Window Size) */}
                <div className="param-group">
                  <label htmlFor="window-size">
                    Sequence Length (Lookback Window)
                  </label>
                  <div className="input-with-info">
                    <input
                      id="window-size"
                      type="number"
                      min="10"
                      max="500"
                      value={params.window_size}
                      onChange={(e) =>
                        handleParamChange("window_size", e.target.value)
                      }
                      disabled={isTraining}
                      className="param-input"
                    />
                    <span className="param-default">
                      Default: {DEFAULT_PARAMS.window_size}
                    </span>
                  </div>
                  <p className="param-help">
                    Number of past timesteps to look back (60 = past 60 days)
                  </p>
                </div>

                {/* Epochs */}
                <div className="param-group">
                  <label htmlFor="epochs">Epochs</label>
                  <div className="input-with-info">
                    <input
                      id="epochs"
                      type="number"
                      min="1"
                      max="100"
                      value={params.epochs}
                      onChange={(e) =>
                        handleParamChange("epochs", e.target.value)
                      }
                      disabled={isTraining}
                      className="param-input"
                    />
                    <span className="param-default">
                      Default: {DEFAULT_PARAMS.epochs}
                    </span>
                  </div>
                  <p className="param-help">
                    Number of complete passes through training data
                  </p>
                </div>

                {/* Batch Size */}
                <div className="param-group">
                  <label htmlFor="batch-size">Batch Size</label>
                  <div className="input-with-info">
                    <input
                      id="batch-size"
                      type="number"
                      min="1"
                      max="64"
                      value={params.batch_size}
                      onChange={(e) =>
                        handleParamChange("batch_size", e.target.value)
                      }
                      disabled={isTraining}
                      className="param-input"
                    />
                    <span className="param-default">
                      Default: {DEFAULT_PARAMS.batch_size}
                    </span>
                  </div>
                  <p className="param-help">
                    Number of samples per gradient update
                  </p>
                </div>

                {/* LSTM Units */}
                <div className="param-group">
                  <label htmlFor="num-units">LSTM Units per Layer</label>
                  <div className="input-with-info">
                    <input
                      id="num-units"
                      type="number"
                      min="50"
                      max="500"
                      value={params.num_units}
                      onChange={(e) =>
                        handleParamChange("num_units", e.target.value)
                      }
                      disabled={isTraining}
                      className="param-input"
                    />
                    <span className="param-default">
                      Default: {DEFAULT_PARAMS.num_units}
                    </span>
                  </div>
                  <p className="param-help">
                    Model complexity (higher = more capacity, slower training)
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="action-buttons">
                <button
                  className="btn-reset"
                  onClick={resetDefaults}
                  disabled={isTraining}
                  title="Reset parameters to defaults"
                >
                  Reset Defaults
                </button>
              </div>
            </div>

            {/* Error Message */}
            {trainingError && (
              <div className="error-section">
                <h2>Error</h2>
                <p className="error-text">{trainingError}</p>
              </div>
            )}

            {/* Train Button */}
            <button
              className="btn-train"
              onClick={handleTrain}
              disabled={isTraining || !selectedDataset}
            >
              {isTraining ? "Training..." : "Start Training"}
            </button>
          </div>

          {/* Right column: Results */}
          <div className="train-results">
            {!trainingResult ? (
              <div className="empty-results">
                <p>Training results will appear here</p>
              </div>
            ) : (
              <div className="results-content">
                {/* Metrics */}
                <div className="results-section">
                  <h2>Model Performance Metrics</h2>
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-label">MAE (Mean Absolute Error)</div>
                      <div className="metric-value">
                        {trainingResult.metrics.mae.toFixed(2)}
                      </div>
                      <div className="metric-help">
                        Average absolute error in price units
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">RMSE (Root Mean Squared Error)</div>
                      <div className="metric-value">
                        ${trainingResult.metrics.rmse.toFixed(2)}
                      </div>
                      <div className="metric-help">
                        Penalizes larger errors more than MAE
                      </div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">MAPE (Mean Absolute % Error)</div>
                      <div className="metric-value">
                        {trainingResult.metrics.mape.toFixed(2)}%
                      </div>
                      <div className="metric-help">Scale-independent error measure</div>
                    </div>
                    <div className="metric-card">
                      <div className="metric-label">R² (Coefficient of Determination)</div>
                      <div className="metric-value">
                        {trainingResult.metrics.r2.toFixed(4)}
                      </div>
                      <div className="metric-help">
                        1.0 = perfect fit, 0 = no better than mean
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dataset Info */}
                <div className="results-section">
                  <h2>Dataset Information</h2>
                  <div className="info-grid">
                    <div className="info-card">
                      <div className="info-label">Symbol</div>
                      <div className="info-value">{trainingResult.symbol}</div>
                    </div>
                    <div className="info-card">
                      <div className="info-label">Training Samples</div>
                      <div className="info-value">{trainingResult.train_size}</div>
                    </div>
                    <div className="info-card">
                      <div className="info-label">Testing Samples</div>
                      <div className="info-value">{trainingResult.test_size}</div>
                    </div>
                  </div>
                </div>

                {/* Parameters Used */}
                <div className="results-section">
                  <h2>Training Parameters Used</h2>
                  <div className="params-display">
                    <div className="param-row">
                      <span className="param-name">Sequence Length:</span>
                      <span className="param-val">
                        {trainingResult.parameters.window_size}
                      </span>
                    </div>
                    <div className="param-row">
                      <span className="param-name">Epochs:</span>
                      <span className="param-val">
                        {trainingResult.parameters.epochs}
                      </span>
                    </div>
                    <div className="param-row">
                      <span className="param-name">Batch Size:</span>
                      <span className="param-val">
                        {trainingResult.parameters.batch_size}
                      </span>
                    </div>
                    <div className="param-row">
                      <span className="param-name">LSTM Units:</span>
                      <span className="param-val">
                        {trainingResult.parameters.num_units}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Model Info */}
                <div className="results-section">
                  <h2>Model Information</h2>
                  <div className="model-path">
                    <strong>Path:</strong>
                    <p className="path-text">{trainingResult.model_path}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
