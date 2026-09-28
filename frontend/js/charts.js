/**
 * charts.js - Chart.js analytics charts for Car Black Box System
 */

const ChartDefaults = {
  color: {
    blue: '#4f8ef7', cyan: '#00d4ff', purple: '#8b5cf6',
    green: '#10d981', yellow: '#f59e0b', orange: '#f97316', red: '#ef4444'
  },
  font: { family: 'Inter', size: 11 },
  grid: 'rgba(79,142,247,0.08)',
  text: '#8899aa',
};

Chart.defaults.color = ChartDefaults.text;
Chart.defaults.font.family = ChartDefaults.font.family;
Chart.defaults.font.size = ChartDefaults.font.size;

const _charts = {};

function _destroyChart(id) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
}

function _baseOptions(title = '') {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: ChartDefaults.text, padding: 16 } },
      title: title ? { display: true, text: title, color: '#e8ecf4', font: { size: 13, weight: '600' }, padding: { bottom: 16 } } : { display: false },
      tooltip: {
        backgroundColor: 'rgba(15,22,40,0.95)',
        borderColor: 'rgba(79,142,247,0.3)', borderWidth: 1,
        titleColor: '#e8ecf4', bodyColor: '#8899aa',
        padding: 10, cornerRadius: 8,
      }
    },
  };
}

// ---- Severity Distribution Doughnut ----
function renderSeverityChart(data, canvasId = 'chartSeverity') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const labels = Object.keys(data);
  const values = Object.values(data);
  const colorMap = {
    None: '#556070', Minor: '#10d981', Moderate: '#f59e0b',
    Severe: '#f97316', Critical: '#ef4444'
  };
  _charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map(l => colorMap[l] || '#4f8ef7'),
        borderColor: 'rgba(0,0,0,0)',
        hoverOffset: 10,
      }]
    },
    options: {
      ..._baseOptions('Accident Severity Distribution'),
      cutout: '62%',
      plugins: {
        ..._baseOptions().plugins,
        title: { display: true, text: 'Severity Distribution', color: '#e8ecf4', font: { size: 13, weight: '600' } }
      }
    }
  });
}

// ---- Cause Distribution Bar ----
function renderCauseChart(data, canvasId = 'chartCause') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const colors = [
    ChartDefaults.color.red, ChartDefaults.color.orange, ChartDefaults.color.yellow,
    ChartDefaults.color.blue, ChartDefaults.color.purple, ChartDefaults.color.green,
    ChartDefaults.color.cyan, '#ec4899'
  ];
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Count',
        data: sorted.map(e => e[1]),
        backgroundColor: sorted.map((_, i) => colors[i % colors.length] + 'bb'),
        borderColor: sorted.map((_, i) => colors[i % colors.length]),
        borderWidth: 1, borderRadius: 6,
      }]
    },
    options: {
      ..._baseOptions('Top Accident Causes'),
      scales: {
        x: { grid: { color: ChartDefaults.grid }, ticks: { maxRotation: 30, font: { size: 10 } } },
        y: { grid: { color: ChartDefaults.grid }, beginAtZero: true }
      }
    }
  });
}

// ---- Speed History Line ----
function renderSpeedChart(readings, canvasId = 'chartSpeed') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const labels = readings.map((_, i) => i + 1);
  const speeds = readings.map(r => r.speed || 0);
  const probs = readings.map(r => (r.accident_probability || 0) * 100);
  _charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Speed (km/h)',
          data: speeds, yAxisID: 'y',
          borderColor: ChartDefaults.color.blue,
          backgroundColor: 'rgba(79,142,247,0.08)',
          fill: true, tension: 0.4, pointRadius: 0,
        },
        {
          label: 'Accident Probability (%)',
          data: probs, yAxisID: 'y2',
          borderColor: ChartDefaults.color.red,
          backgroundColor: 'rgba(239,68,68,0.06)',
          fill: true, tension: 0.4, pointRadius: 0, borderDash: [4, 4],
        }
      ]
    },
    options: {
      ..._baseOptions('Speed & Accident Probability'),
      scales: {
        x: { display: false },
        y: { grid: { color: ChartDefaults.grid }, position: 'left', title: { display: true, text: 'Speed (km/h)', color: ChartDefaults.color.blue } },
        y2: { grid: { display: false }, position: 'right', min: 0, max: 100, title: { display: true, text: 'Prob (%)', color: ChartDefaults.color.red } }
      }
    }
  });
}

// ---- Accident Timeline ----
function renderTimelineChart(timeline, canvasId = 'chartTimeline') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const labels = Object.keys(timeline);
  const values = Object.values(timeline);
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Accidents',
        data: values,
        backgroundColor: 'rgba(239,68,68,0.5)',
        borderColor: ChartDefaults.color.red,
        borderWidth: 1, borderRadius: 4,
      }]
    },
    options: {
      ..._baseOptions('Accident Timeline'),
      scales: {
        x: { grid: { color: ChartDefaults.grid }, ticks: { maxRotation: 45, font: { size: 9 } } },
        y: { grid: { color: ChartDefaults.grid }, beginAtZero: true, ticks: { stepSize: 1 } }
      }
    }
  });
}

// ---- Driver Risk Radar ----
function renderRiskRadar(sensorData, canvasId = 'chartRadar') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const speed_norm = Math.min((sensorData.speed || 0) / 200, 1) * 100;
  const impact_norm = Math.min((sensorData.impact_force || 0) / 50, 1) * 100;
  const alcohol_norm = Math.min((sensorData.alcohol_level || 0) / 0.4, 1) * 100;
  const drowsy_norm = (sensorData.drowsiness_score || 0) * 100;
  const dist_norm = Math.max(0, (20 - (sensorData.obstacle_distance || 20)) / 20) * 100;
  const audio_norm = Math.min((sensorData.audio_level || 0) / 130, 1) * 100;

  _charts[canvasId] = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Speed', 'Impact', 'Alcohol', 'Drowsiness', 'Proximity', 'Noise'],
      datasets: [{
        label: 'Risk Level',
        data: [speed_norm, impact_norm, alcohol_norm, drowsy_norm, dist_norm, audio_norm],
        borderColor: ChartDefaults.color.red,
        backgroundColor: 'rgba(239,68,68,0.15)',
        pointBackgroundColor: ChartDefaults.color.red,
        pointRadius: 4,
      }]
    },
    options: {
      ..._baseOptions(),
      scales: {
        r: {
          grid: { color: ChartDefaults.grid },
          pointLabels: { color: ChartDefaults.text, font: { size: 11 } },
          ticks: { display: false }, min: 0, max: 100,
          angleLines: { color: ChartDefaults.grid }
        }
      }
    }
  });
}

// ---- ML Metrics Bar ----
function renderMetricsChart(metrics, canvasId = 'chartMetrics') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Accuracy', 'Precision', 'Recall', 'F1-Score'],
      datasets: [{
        label: 'Score (%)',
        data: [
          (metrics.accuracy || 0) * 100,
          (metrics.precision || 0) * 100,
          (metrics.recall || 0) * 100,
          (metrics.f1_score || 0) * 100,
        ],
        backgroundColor: [
          'rgba(79,142,247,0.7)', 'rgba(16,217,129,0.7)',
          'rgba(245,158,11,0.7)', 'rgba(139,92,246,0.7)'
        ],
        borderColor: [
          ChartDefaults.color.blue, ChartDefaults.color.green,
          ChartDefaults.color.yellow, ChartDefaults.color.purple
        ],
        borderWidth: 2, borderRadius: 8,
      }]
    },
    options: {
      ..._baseOptions('ML Model Performance'),
      scales: {
        x: { grid: { color: ChartDefaults.grid } },
        y: { grid: { color: ChartDefaults.grid }, beginAtZero: true, max: 100,
             ticks: { callback: v => v + '%' } }
      }
    }
  });
}

// ---- Feature Importance ----
function renderFeatureImportance(importances, canvasId = 'chartFeatures') {
  _destroyChart(canvasId);
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return;
  const sorted = Object.entries(importances).sort((a, b) => b[1] - a[1]);
  _charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(e => e[0]),
      datasets: [{
        label: 'Importance',
        data: sorted.map(e => +(e[1] * 100).toFixed(2)),
        backgroundColor: 'rgba(139,92,246,0.65)',
        borderColor: ChartDefaults.color.purple,
        borderWidth: 1, borderRadius: 5,
        indexAxis: 'y',
      }]
    },
    options: {
      ..._baseOptions('Feature Importance'),
      indexAxis: 'y',
      scales: {
        x: { grid: { color: ChartDefaults.grid }, ticks: { callback: v => v + '%' } },
        y: { grid: { color: ChartDefaults.grid } }
      }
    }
  });
}
