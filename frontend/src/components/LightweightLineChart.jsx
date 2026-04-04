import { useEffect, useRef } from "react";
import { LineSeries, ColorType, CrosshairMode, createChart } from "lightweight-charts";

export default function LightweightLineChart({ data, predictionData, theme = "dark" }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const predictionSeriesRef = useRef(null);
  const resizeObserverRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const dark = theme !== "light";
    
    // Transparent background for elegant look
    const backgroundColor = dark ? "transparent" : "#ffffff";
    const textColor = dark ? "#cbd5e1" : "#334155";
    const gridColor = dark ? "rgba(51, 65, 85, 0.4)" : "rgba(226, 232, 240, 0.8)";

    const chart = createChart(hostRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: gridColor,
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
      },
      // Removed hardcoded height to allow ResizeObserver true 100% fill
      autoSize: true, // Let lightweight-charts handle sizing if possible, or fallback:
    });

    if (hostRef.current) {
        chart.applyOptions({ height: hostRef.current.clientHeight || 500 });
    }

    // Close Price Series (Blue Area for Premium Look)
    const lineSeries = chart.addAreaSeries({
      lineColor: "#3b82f6",
      topColor: "rgba(59, 130, 246, 0.4)",
      bottomColor: "rgba(59, 130, 246, 0.0)",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
    });

    // EMA-20 Series (Orange/Gold dashed style equivalent)
    const emaSeries = chart.addLineSeries({
      color: "#f59e0b",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
      lineStyle: 1, // Dotted/Dashed
    });

    // Prediction Series (Emerald dashed line)
    const predictionSeries = chart.addLineSeries({
      color: "#10b981", 
      lineWidth: 3,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
      lineStyle: 2, // Dashed
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    emaSeriesRef.current = emaSeries;
    predictionSeriesRef.current = predictionSeries;

    const resizeChart = () => {
      if (hostRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: hostRef.current.clientWidth,
          height: hostRef.current.clientHeight
        });
      }
    };

    resizeObserverRef.current = new ResizeObserver(resizeChart);
    resizeObserverRef.current.observe(hostRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [theme]);

  useEffect(() => {
    if (!lineSeriesRef.current || !emaSeriesRef.current || !predictionSeriesRef.current) return;

    if (data && data.length > 0) {
      const closeData = data.map(d => ({ time: d.time, value: d.value }));
      const emaData = data.map(d => ({ time: d.time, value: d.ema20 }));
      lineSeriesRef.current.setData(closeData);
      emaSeriesRef.current.setData(emaData);
    } else {
      lineSeriesRef.current.setData([]);
      emaSeriesRef.current.setData([]);
    }

    if (predictionData && predictionData.length > 0) {
      const predData = predictionData.map(d => ({ time: d.date, value: d.predicted_close }));
      // Connect visualization to the last known real point
      if (data && data.length > 0) {
          const lastHistorical = data[data.length - 1];
          predData.unshift({ time: lastHistorical.time, value: lastHistorical.value });
      }
      predictionSeriesRef.current.setData(predData);
    } else {
      predictionSeriesRef.current.setData([]);
    }
    
    chartRef.current?.timeScale().fitContent();
  }, [data, predictionData, theme]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div 
        ref={hostRef} 
        style={{ width: "100%", height: "100%" }} 
      />
      {/* Custom Legend Overlay */}
      <div style={{ position: "absolute", top: 10, left: 20, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 500, zIndex: 10, color: theme === 'dark' ? '#f8fafc' : '#334155'}}>
         <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}><span style={{width: 24, height: 3, background: '#3b82f6', borderRadius: 2}}></span> Close Price</div>
         <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}><span style={{width: 24, borderBottom: '3px dashed #f59e0b'}}></span> 20-Day EMA</div>
         <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}><span style={{width: 24, borderBottom: '3px dashed #10b981'}}></span> LSTM Prediction</div>
      </div>
    </div>
  );
}
