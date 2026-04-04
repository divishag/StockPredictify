const STEPS = [
  {
    title: "Download historical prices",
    body: "On Dataset Preparation, enter one or more ticker symbols (for example AAPL, MSFT) and pick how far back you want data. Submit Download Data and wait for the success message.",
    tabKey: "dataset",
    tabLabel: "Dataset Preparation",
  },
  {
    title: "Review what you saved",
    body: "Tracked symbols appear in the list on the left. Select a symbol to see a price chart, latest OHLC values, and file details. Use Recent Close Comparison to scan all symbols at a glance.",
    tabKey: "dataset",
    tabLabel: "Dataset Preparation",
  },
  {
    title: "Train an LSTM model",
    body: "Open Train Model, choose a downloaded stock, adjust epochs, batch size, and window size if you like, then press Train. When training finishes, note the saved model filename shown in the summary.",
    tabKey: "train",
    tabLabel: "Train Model",
  },
  {
    title: "Explore further",
    body: "Backtest Strategy and Compare Results are here for the full research workflow. Use the Home tab anytime for a high-level overview of the stages.",
    tabKey: "home",
    tabLabel: "Home",
  },
];

const TAB_GUIDES = [
  {
    key: "home",
    name: "Home",
    summary: "Your starting point and overview of the whole workflow.",
    points: [
      "Read the welcome message to see how Predictify fits together.",
      "Use the top navigation to jump to any stage in one click.",
    ],
  },
  {
    key: "dataset",
    name: "Dataset Preparation",
    summary: "Pull market data from the backend and inspect it before training.",
    points: [
      "Symbols: type tickers separated by commas or spaces. They are normalized to uppercase.",
      "Start date: data is fetched from this date up to the latest available point the backend supports.",
      "After a successful download, symbols are tracked automatically; use Refresh if the list looks stale.",
      "Select a symbol to load the candlestick chart and row counts. Delete removes that symbol’s stored data (you will be asked to confirm).",
    ],
  },
  {
    key: "train",
    name: "Train Model",
    summary: "Train a sequence model on CSV data that already exists for a symbol.",
    points: [
      "Only stocks that already have data files on the server appear in the dropdown. If the list is empty, download data first on Dataset Preparation.",
      "Epochs: how many full passes over the training data; higher values can improve fit but take longer.",
      "Batch size: how many samples are processed together; affects speed and stability.",
      "Window size: how many past days feed each training example; must be at least 10.",
      "Progress messages walk you through loading, scaling, building the LSTM, and saving the model.",
    ],
  },
  {
    key: "backtest",
    name: "Backtest Strategy",
    summary: "Reserved for testing strategies on historical windows once that flow is connected.",
    points: [
      "This tab outlines the backtesting stage in the product roadmap.",
      "When implemented, you will set time ranges, capital, and rules, then review an equity curve and risk metrics.",
    ],
  },
  {
    key: "compare",
    name: "Compare Results",
    summary: "Reserved for side-by-side comparison of models or strategies.",
    points: [
      "This tab describes how you will compare variants (for example Sharpe ratio, drawdown, hit rate).",
      "Use Dataset and Train today to produce models you can later compare here.",
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: "Why is my symbol list empty?",
    a: "You need to download data first on Dataset Preparation. Make sure the backend server is running and your symbols are valid exchange tickers.",
  },
  {
    q: "Why does Train Model say there are no stocks?",
    a: "Training only lists symbols whose data files exist on the backend. Complete a successful download for at least one symbol, then press Refresh on Train Model.",
  },
  {
    q: "What if training fails or takes a long time?",
    a: "Larger epoch counts and bigger datasets increase runtime. If you see an error message, read the text for details (for example invalid parameters or a server issue). Try smaller epochs first to verify the pipeline works.",
  },
  {
    q: "How do I switch appearance?",
    a: "Use the Light Theme / Dark Theme button in the top bar. Your choice is stored for this session via the app theme setting.",
  },
];

export default function HelpPage({ onNavigate }) {
  return (
    <div className="help-page">
      <div className="help-intro mini-tile mb-4">
        <p className="section-tag mb-2">How Predictify works</p>
        <p className="help-lead mb-0">
          Predictify helps you download stock history, inspect charts, and train an LSTM model from one workspace. Follow the steps below in order the first time you use the app; after that you can jump to any tab from the top menu.
        </p>
      </div>

      <h3 className="help-section-title mb-3">Quick start</h3>
      <ol className="help-steps list-unstyled mb-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="help-step-row mini-tile mb-3">
            <div className="help-step-badge" aria-hidden="true">
              {index + 1}
            </div>
            <div className="help-step-body">
              <h4 className="help-step-heading mb-2">{step.title}</h4>
              <p className="help-step-text mb-3 mb-md-2">{step.body}</p>
              {typeof onNavigate === "function" ? (
                <button
                  type="button"
                  className="btn btn-outline-cyan btn-sm"
                  onClick={() => onNavigate(step.tabKey)}
                >
                  Go to {step.tabLabel}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <h3 className="help-section-title mb-3">Tour of each tab</h3>
      <div className="row g-3 mb-4">
        {TAB_GUIDES.map((tab) => (
          <div className="col-12 col-lg-6" key={tab.key}>
            <article className="help-tab-card mini-tile h-100">
              <div className="d-flex align-items-start justify-content-between gap-2 mb-2 flex-wrap">
                <h4 className="help-tab-card-title mb-0">{tab.name}</h4>
                {typeof onNavigate === "function" ? (
                  <button
                    type="button"
                    className="btn btn-outline-cyan btn-sm flex-shrink-0"
                    onClick={() => onNavigate(tab.key)}
                  >
                    Open tab
                  </button>
                ) : null}
              </div>
              <p className="help-tab-summary mb-3">{tab.summary}</p>
              <ul className="help-bullet-list mb-0">
                {tab.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-4">
        <div className="col-12 col-lg-6">
          <div className="help-callout mini-tile h-100">
            <h3 className="help-callout-title mb-2">Tips for better results</h3>
            <ul className="help-bullet-list mb-0">
              <li>Use several years of history when possible so patterns are not dominated by one short period.</li>
              <li>Try a window size around 60 days for medium-term context; compare with a shorter window if you want more reactive sequences.</li>
              <li>Start with modest epochs, confirm training completes, then increase if you need finer fit and can wait longer.</li>
            </ul>
          </div>
        </div>
        <div className="col-12 col-lg-6">
          <div className="help-callout help-callout--muted mini-tile h-100">
            <h3 className="help-callout-title mb-2">Important notice</h3>
            <p className="help-disclaimer mb-0">
              Predictify is an educational and research tool. Model outputs are not investment advice, guarantees of future performance, or replacements for professional financial guidance. Always verify results and understand the risks before making real trading decisions.
            </p>
          </div>
        </div>
      </div>

      <h3 className="help-section-title mb-3">Frequently asked questions</h3>
      <div className="help-faq">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="help-faq-item mini-tile mb-2">
            <summary className="help-faq-summary">{item.q}</summary>
            <p className="help-faq-answer mb-0">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
