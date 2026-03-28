
const AnalyzerChart = {

  _chartInstance: null,  // holds the Chart.js instance

  draw(candles, ticker, isPositive = true) {
    const canvas = document.getElementById('liveChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }

    const lineColor = isPositive ? '#00d4ff' : '#ff4d6d';
    const glowColor = isPositive
      ? 'rgba(0, 212, 255, 0.3)'
      : 'rgba(255, 77, 109, 0.25)';
    const glowFade  = isPositive
      ? 'rgba(0, 212, 255, 0.0)'
      : 'rgba(255, 77, 109, 0.0)';

    // Gradient fill below the line
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, glowColor);
    gradient.addColorStop(1, glowFade);

    const labels = candles.labels;
    const prices = candles.prices;

    this._chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label:           ticker,
          data:            prices,
          borderColor:     lineColor,
          borderWidth:     2,
          backgroundColor: gradient,
          fill:            true,
          tension:         0.35,
          pointRadius:     0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: '#040d1a',
          pointHoverBorderWidth: 2,
        }]
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        animation: {
          duration: 600,
          easing: 'easeInOutQuart',
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode:        'index',
            intersect:   false,
            backgroundColor: 'rgba(4, 13, 26, 0.95)',
            borderColor:     'rgba(0, 212, 255, 0.25)',
            borderWidth:     1,
            titleColor:      '#a0b4cc',
            bodyColor:       '#ffffff',
            padding:         10,
            callbacks: {
              title: (items) => {
                const raw = items[0]?.label || '';
                const d = new Date(raw);
                if (isNaN(d.getTime())) return raw;
                return d.toLocaleString('en-US', {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                });
              },
              label: (item) => ` $${item.parsed.y.toFixed(2)}`,
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              tooltipFormat: 'MMM d, yyyy HH:mm',
            },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color:       '#5a7a99',
              font:        { family: 'JetBrains Mono', size: 10 },
              maxTicksLimit: 8,
              maxRotation: 0,
            },
          },
          y: {
            position: 'right',
            grid:  { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#5a7a99',
              font:  { family: 'JetBrains Mono', size: 10 },
              callback: (val) => `$${val.toFixed(0)}`,
            },
          }
        },
        interaction: {
          mode:      'nearest',
          axis:      'x',
          intersect: false,
        },
      }
    });
  },

  destroy() {
    if (this._chartInstance) {
      this._chartInstance.destroy();
      this._chartInstance = null;
    }
  },

};
