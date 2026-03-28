// ── Dummy stock data for now   ----- x--------------------------------------------------------------
// Now, coming from Finnhub API and be passed to the AI for analysis.
const timeLabels = [
  '9:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','13:00','13:30','14:00','14:30','15:00',
  '15:30','16:00'
];

const aaplPrices = [
  188.5, 190.2, 191.8, 190.5, 192.4, 193.1,
  194.6, 195.3, 196.8, 197.4, 198.1, 199.5,
  200.2, 201.2
];

function drawHeroChart() {
  const canvas = document.getElementById('heroChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0,   'rgba(0, 212, 255, 0.3)');
  gradient.addColorStop(1,   'rgba(0, 212, 255, 0.0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [{
        data:            aaplPrices,
        borderColor:     '#00d4ff',
        borderWidth:     2,
        backgroundColor: gradient,
        fill:            true,
        tension:         0.4,        
        pointRadius:     0,           
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(4, 13, 26, 0.95)',
          borderColor:     'rgba(0, 212, 255, 0.3)',
          borderWidth:     1,
          titleColor:      '#a0b4cc',
          bodyColor:       '#ffffff',
          callbacks: {
            label: (ctx) => `$${ctx.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5a7a99', font: { family: 'JetBrains Mono', size: 10 } }
        },
        y: {
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#5a7a99', font: { family: 'JetBrains Mono', size: 10 } }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  drawHeroChart();
});