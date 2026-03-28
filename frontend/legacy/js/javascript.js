function initScrollReveal() {
  const revealEls = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); 
      }
    });
  }, { threshold: 0.15 });

  revealEls.forEach(el => observer.observe(el));
}

function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });
}

const nvdaTimes  = ['9:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00'];
const nvdaPrices = [128.4,129.2,130.5,131.0,130.3,131.8,132.4,133.0,133.5,134.2,134.8,135.5,136.0,137.1];

function drawReportChart() {
  const canvas = document.getElementById('reportChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0,   'rgba(0, 229, 160, 0.28)');
  gradient.addColorStop(1,   'rgba(0, 229, 160, 0.0)');
/*chart config*/
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: nvdaTimes,
      datasets: [{
        data:            nvdaPrices,
        borderColor:     '#00e5a0',
        borderWidth:     2,
        backgroundColor: gradient,
        fill:            true,
        tension:         0.4,
        pointRadius:     0,
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive:           true,
      maintainAspectRatio:  false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(4, 13, 26, 0.95)',
          borderColor:     'rgba(0,229,160,0.3)',
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
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  drawHeroChart();    
  drawReportChart();  
  initScrollReveal(); 
  initNavbar();       
});