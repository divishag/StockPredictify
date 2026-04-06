import { useEffect, useMemo, useRef } from "react";
import {
  BarSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
} from "lightweight-charts";

function normalizeTime(value) {
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value).slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

export default function LightweightOhlcChart({ points, theme, tradeMarkers = [], equityCurve = [], showEquityPane = true }) {
  const hostRef = useRef(null);
  const equityChartRef = useRef(null);
  const priceChartRef = useRef(null);
  const volumeChartRef = useRef(null);
  const equitySeriesRef = useRef(null);
  const priceSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const markerPrimitiveRef = useRef(null);
  const barSpacingRef = useRef(7);

  const tradeLookupByDate = useMemo(() => {
    const entries = new Map();

    if (!Array.isArray(tradeMarkers)) {
      return entries;
    }

    tradeMarkers.forEach((row) => {
      const timeKey = normalizeTime(row.date);
      const action = String(row.action || "").toLowerCase();
      const price = Number(row.price);
      const pnl = row.pnl == null ? null : Number(row.pnl);

      if (!timeKey || !Number.isFinite(price) || (action !== "buy" && action !== "sell")) {
        return;
      }

      const current = entries.get(timeKey) || [];
      current.push({
        action,
        price,
        pnl: Number.isFinite(pnl) ? pnl : null,
        tradeId: row.tradeId,
      });
      entries.set(timeKey, current);
    });

    return entries;
  }, [tradeMarkers]);

  const markers = useMemo(() => {
    const rawTrades = Array.isArray(tradeMarkers)
      ? tradeMarkers
          .map((row) => ({
            date: row.date,
            action: String(row.action || "").toLowerCase(),
            price: Number(row.price),
          }))
          .filter((row) => (row.action === "buy" || row.action === "sell") && Number.isFinite(row.price))
      : [];

    return rawTrades
      .sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime())
      .map((trade) => ({
        time: normalizeTime(trade.date),
        position: trade.action === "buy" ? "belowBar" : "aboveBar",
        color: trade.action === "buy" ? "#00e5a0" : "#ff4d6d",
        shape: trade.action === "buy" ? "arrowUp" : "arrowDown",
        text: trade.action === "buy" ? "BUY" : "SELL",
      }));
  }, [tradeMarkers]);

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

  const mappedEquity = useMemo(() => {
    if (!mappedData.bars.length || !Array.isArray(equityCurve)) {
      return [];
    }

    const sortedEquity = [...equityCurve]
      .map((row) => ({
        time: normalizeTime(row.date),
        value: Number(row.equity),
      }))
      .filter((row) => Number.isFinite(row.value))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));

    if (!sortedEquity.length) {
      return [];
    }

    const equityByTime = new Map(sortedEquity.map((row) => [row.time, row.value]));
    let carry = sortedEquity[0].value;

    return mappedData.bars.map((bar) => {
      if (equityByTime.has(bar.time)) {
        carry = equityByTime.get(bar.time);
      }

      return {
        time: bar.time,
        value: carry,
      };
    });
  }, [equityCurve, mappedData.bars]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const host = hostRef.current;
    const equityContainer = showEquityPane ? host.querySelector(".lw-equity-chart") : null;
    const priceContainer = host.querySelector(".lw-price-chart");
    const volumeContainer = host.querySelector(".lw-volume-chart");

    if (!priceContainer || !volumeContainer) {
      return;
    }

    if (showEquityPane && !equityContainer) {
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
        minimumWidth: 76,
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

    const equityChart =
      showEquityPane && equityContainer
        ? createChart(equityContainer, {
            ...baseChartOptions,
            height: equityContainer.clientHeight,
            width: equityContainer.clientWidth,
            rightPriceScale: {
              ...baseChartOptions.rightPriceScale,
              scaleMargins: {
                top: 0.2,
                bottom: 0.15,
              },
            },
          })
        : null;

    const priceChart = createChart(priceContainer, {
      ...baseChartOptions,
      height: priceContainer.clientHeight,
      width: priceContainer.clientWidth,
    });

    const volumeChart = createChart(volumeContainer, {
      ...baseChartOptions,
      height: volumeContainer.clientHeight,
      width: volumeContainer.clientWidth,
      rightPriceScale: {
        ...baseChartOptions.rightPriceScale,
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
    });

    const equitySeries =
      equityChart?.addSeries(LineSeries, {
        color: dark ? "#39b7ff" : "#0a84ff",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      }) ?? null;

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

    const charts = [priceChart, volumeChart];
    if (equityChart) {
      charts.unshift(equityChart);
    }
    let isSyncing = false;
    charts.forEach((sourceChart) => {
      sourceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (!range || isSyncing) {
          return;
        }

        isSyncing = true;
        charts.forEach((targetChart) => {
          if (targetChart !== sourceChart) {
            targetChart.timeScale().setVisibleLogicalRange(range);
          }
        });
        isSyncing = false;
      });
    });

    equityChartRef.current = equityChart;
    priceChartRef.current = priceChart;
    volumeChartRef.current = volumeChart;
    equitySeriesRef.current = equitySeries;
    priceSeriesRef.current = priceSeries;
    volumeSeriesRef.current = volumeSeries;

    if (!priceContainer.style.position) {
      priceContainer.style.position = "relative";
    }

    const tooltip = document.createElement("div");
    tooltip.className = "lw-marker-tooltip";
    tooltip.style.display = "none";
    priceContainer.appendChild(tooltip);

    const chartTimeToKey = (timeValue) => {
      if (!timeValue) {
        return null;
      }

      if (typeof timeValue === "string") {
        return String(timeValue).slice(0, 10);
      }

      if (typeof timeValue === "object" && "year" in timeValue && "month" in timeValue && "day" in timeValue) {
        const year = String(timeValue.year);
        const month = String(timeValue.month).padStart(2, "0");
        const day = String(timeValue.day).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }

      return null;
    };

    const formatMoney = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return "--";
      }

      const sign = numeric > 0 ? "+" : "";
      return `${sign}${numeric.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };

    const hideTooltip = () => {
      tooltip.style.display = "none";
    };

    const crosshairHandler = (param) => {
      if (!param || !param.point || !priceContainer) {
        hideTooltip();
        return;
      }

      const key = chartTimeToKey(param.time);
      if (!key) {
        hideTooltip();
        return;
      }

      const dayTrades = tradeLookupByDate.get(key) || [];
      if (!dayTrades.length) {
        hideTooltip();
        return;
      }

      const rows = dayTrades
        .map((trade) => {
          const actionLabel = trade.action === "buy" ? "BUY" : "SELL";
          if (trade.action === "sell") {
            const pnlClass = trade.pnl != null && trade.pnl >= 0 ? "is-positive" : "is-negative";
            return `
              <div class="lw-marker-tooltip-row">
                <span class="lw-marker-tooltip-label ${trade.action === "buy" ? "is-buy" : "is-sell"}">${actionLabel}</span>
                <span>@ ${formatMoney(trade.price)}</span>
                <span class="lw-marker-tooltip-pnl ${pnlClass}">P/L: ${formatMoney(trade.pnl ?? 0)}</span>
              </div>
            `;
          }

          return `
            <div class="lw-marker-tooltip-row">
              <span class="lw-marker-tooltip-label is-buy">${actionLabel}</span>
              <span>@ ${formatMoney(trade.price)}</span>
            </div>
          `;
        })
        .join("");

      tooltip.innerHTML = `
        <div class="lw-marker-tooltip-date">${key}</div>
        ${rows}
      `;
      tooltip.style.display = "block";

      const bounds = priceContainer.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth;
      const tooltipHeight = tooltip.offsetHeight;
      const pointX = Math.max(0, Math.min(param.point.x, bounds.width));
      const pointY = Math.max(0, Math.min(param.point.y, bounds.height));

      let left = pointX + 12;
      if (left + tooltipWidth > bounds.width - 8) {
        left = pointX - tooltipWidth - 12;
      }
      if (left < 8) {
        left = 8;
      }

      let top = pointY - tooltipHeight - 10;
      if (top < 8) {
        top = pointY + 10;
      }
      if (top + tooltipHeight > bounds.height - 8) {
        top = Math.max(8, bounds.height - tooltipHeight - 8);
      }

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };

    priceChart.subscribeCrosshairMove(crosshairHandler);

    const resizeCharts = () => {
      if (!hostRef.current || !priceChartRef.current || !volumeChartRef.current) {
        return;
      }

      if (equityChartRef.current && equityContainer) {
        equityChartRef.current.applyOptions({
          width: equityContainer.clientWidth,
          height: equityContainer.clientHeight,
        });
      }
      priceChartRef.current.applyOptions({
        width: priceContainer.clientWidth,
        height: priceContainer.clientHeight,
      });
      volumeChartRef.current.applyOptions({
        width: volumeContainer.clientWidth,
        height: volumeContainer.clientHeight,
      });
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

      if (equityChartRef.current) {
        equityChartRef.current.remove();
        equityChartRef.current = null;
      }

      if (priceChartRef.current) {
        if (typeof priceChartRef.current.unsubscribeCrosshairMove === "function") {
          priceChartRef.current.unsubscribeCrosshairMove(crosshairHandler);
        }
        priceChartRef.current.remove();
        priceChartRef.current = null;
      }

      if (volumeChartRef.current) {
        volumeChartRef.current.remove();
        volumeChartRef.current = null;
      }

      equitySeriesRef.current = null;
      priceSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markerPrimitiveRef.current = null;

      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    };
  }, [theme, tradeLookupByDate, showEquityPane]);

  useEffect(() => {
    if (!priceSeriesRef.current || !volumeSeriesRef.current) {
      return;
    }

    if (showEquityPane && equitySeriesRef.current) {
      equitySeriesRef.current.setData(mappedEquity);
    }
    priceSeriesRef.current.setData(mappedData.bars);
    volumeSeriesRef.current.setData(mappedData.volume);

    if (showEquityPane && mappedEquity.length) {
      equityChartRef.current?.timeScale().fitContent();
    }

    if (mappedData.bars.length) {
      if (!markerPrimitiveRef.current) {
        markerPrimitiveRef.current = createSeriesMarkers(priceSeriesRef.current, markers);
      } else if (typeof markerPrimitiveRef.current.setMarkers === "function") {
        markerPrimitiveRef.current.setMarkers(markers);
      }
      priceChartRef.current?.timeScale().fitContent();
      volumeChartRef.current?.timeScale().fitContent();
    } else if (markerPrimitiveRef.current && typeof markerPrimitiveRef.current.setMarkers === "function") {
      markerPrimitiveRef.current.setMarkers([]);
    }
  }, [mappedData, mappedEquity, markers, showEquityPane, theme]);

  function zoomIn() {
    barSpacingRef.current = Math.min(32, barSpacingRef.current * 1.25);
    if (showEquityPane) {
      equityChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
    }
    priceChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
    volumeChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
  }

  function zoomOut() {
    barSpacingRef.current = Math.max(2, barSpacingRef.current * 0.8);
    if (showEquityPane) {
      equityChartRef.current?.timeScale().applyOptions({ barSpacing: barSpacingRef.current });
    }
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
        {showEquityPane ? <div className="lw-equity-chart" /> : null}
        <div className="lw-price-chart" />
        <div className="lw-volume-chart" />
      </div>
    </div>
  );
}
