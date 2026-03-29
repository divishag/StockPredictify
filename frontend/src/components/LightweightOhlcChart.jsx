import { useEffect, useMemo, useRef } from "react";
import { BarSeries, ColorType, CrosshairMode, HistogramSeries, createChart } from "lightweight-charts";

function normalizeTime(value) {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

export default function LightweightOhlcChart({ points, theme }) {
  const hostRef = useRef(null);
  const priceChartRef = useRef(null);
  const volumeChartRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const barSpacingRef = useRef(7);

  const mappedData = useMemo(() => {
    if (!Array.isArray(points)) {
      return { bars: [], volume: [] };
    }

    const sorted = [...points].sort((a, b) => {
      const ta = new Date(String(a.date)).getTime();
      const tb = new Date(String(b.date)).getTime();
      if (Number.isNaN(ta) || Number.isNaN(tb)) {
        return String(a.date).localeCompare(String(b.date));
      }
      return ta - tb;
    });

    const bars = sorted.map((row) => ({
      time: normalizeTime(row.date),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }));

    const volume = sorted.map((row) => ({
      time: normalizeTime(row.date),
      value: Number(row.volume || 0),
      color: Number(row.close) >= Number(row.open) ? "rgba(0, 229, 160, 0.42)" : "rgba(255, 77, 109, 0.42)",
    }));

    return { bars, volume };
  }, [points]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const host = hostRef.current;
    const priceContainer = host.querySelector(".lw-price-chart");
    const volumeContainer = host.querySelector(".lw-volume-chart");

    if (!priceContainer || !volumeContainer) {
      return;
    }

    const dark = theme !== "light";

    const baseChartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: dark ? "#061122" : "#ffffff" },
        textColor: dark ? "#8ba4c2" : "#375f89",
      },
      grid: {
        vertLines: { color: dark ? "rgba(129, 160, 191, 0.14)" : "rgba(20, 61, 101, 0.12)" },
        horzLines: { color: dark ? "rgba(129, 160, 191, 0.14)" : "rgba(20, 61, 101, 0.12)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: dark ? "rgba(137, 166, 193, 0.35)" : "rgba(29, 80, 130, 0.35)",
      },
      timeScale: {
        borderColor: dark ? "rgba(137, 166, 193, 0.35)" : "rgba(29, 80, 130, 0.35)",
        rightOffset: 4,
        barSpacing: barSpacingRef.current,
        fixLeftEdge: false,
        fixRightEdge: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        dateFormat: "yyyy-MM-dd",
      },
    };

    const priceChart = createChart(priceContainer, {
      ...baseChartOptions,
      height: Math.max(260, Math.floor(host.clientHeight * 0.7)),
      width: host.clientWidth,
    });

    const volumeChart = createChart(volumeContainer, {
      ...baseChartOptions,
      height: Math.max(110, Math.floor(host.clientHeight * 0.3)),
      width: host.clientWidth,
      rightPriceScale: {
        ...baseChartOptions.rightPriceScale,
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
    });

    const priceSeries = priceChart.addSeries(BarSeries, {
      upColor: "#00e5a0",
      downColor: "#ff4d6d",
      openVisible: true,
      thinBars: false,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Keep price and volume panes horizontally synchronized.
    const syncVisibleRange = (sourceChart, targetChart) => {
      sourceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range) {
          return;
        }
        targetChart.timeScale().setVisibleLogicalRange(range);
      });
    };

    syncVisibleRange(priceChart, volumeChart);
    syncVisibleRange(volumeChart, priceChart);

    priceChartRef.current = priceChart;
    volumeChartRef.current = volumeChart;
    priceSeriesRef.current = priceSeries;
    volumeSeriesRef.current = volumeSeries;

    const resizeCharts = () => {
      if (!hostRef.current || !priceChartRef.current || !volumeChartRef.current) {
        return;
      }

      const width = hostRef.current.clientWidth;
      const height = hostRef.current.clientHeight;
      const priceHeight = Math.max(240, Math.floor(height * 0.72));
      const volumeHeight = Math.max(90, height - priceHeight - 8);

      priceChartRef.current.applyOptions({ width, height: priceHeight });
      volumeChartRef.current.applyOptions({ width, height: volumeHeight });
    };

    resizeObserverRef.current = new ResizeObserver(() => {
      resizeCharts();
    });
    resizeObserverRef.current.observe(host);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }

      if (priceChartRef.current) {
        priceChartRef.current.remove();
        priceChartRef.current = null;
      }

      if (volumeChartRef.current) {
        volumeChartRef.current.remove();
        volumeChartRef.current = null;
      }

      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    if (!priceSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    priceSeriesRef.current.setData(mappedData.bars);
    volumeSeriesRef.current.setData(mappedData.volume);

    if (mappedData.bars.length) {
      priceChartRef.current?.timeScale().fitContent();
      volumeChartRef.current?.timeScale().fitContent();
    }
  }, [mappedData, theme]);

  function zoomIn() {
    barSpacingRef.current = Math.min(32, barSpacingRef.current * 1.25);
    priceChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
    volumeChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
  }

  function zoomOut() {
    barSpacingRef.current = Math.max(2, barSpacingRef.current * 0.8);
    priceChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
    volumeChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
  }

  return (
    <div className="lw-chart-shell">
      <div className="lw-chart-toolbar">
        <button type="button" className="btn btn-outline-cyan btn-sm" onClick={zoomIn}>
          Zoom In
        </button>
        <button type="button" className="btn btn-outline-cyan btn-sm" onClick={zoomOut}>
          Zoom Out
        </button>
      </div>

      <div className="lw-chart-host" ref={hostRef}>
        <div className="lw-price-chart" />
        <div className="lw-volume-chart" />
      </div>
    </div>
  );
}
