export const MENU_OPTIONS = [
  {
    key: "home",
    label: "Home",
    description: "Your command center for preparing data, training models, and testing ideas.",
    bullets: ["Quickly jump into each stage", "Track outcomes in one flow", "Turn market noise into signals"],
  },
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
