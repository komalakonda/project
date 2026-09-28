/**
 * dashboard.js - Main dashboard controller for AI Car Black Box System
 * Handles navigation, live sensor polling, accident detection UI, and all page logic
 */

// =====================================================================
// State
// =====================================================================
const State = {
  simulationRunning: false,
  currentSensorData: {},
  accidentHistory: [],
  sensorInterval: null,
  statusInterval: null,
  clockInterval: null,
};

// =====================================================================
// Navigation
// =====================================================================
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('page-' + target)?.classList.add('active');
      onPageShow(target);
    });
  });
}

function onPageShow(page) {
  if (page === 'analytics') loadAnalytics();
  if (page === 'history') loadAccidentHistory();
  if (page === 'ml') loadMLMetrics();
  if (page === 'dataset') loadDatasetPreview();
  if (page === 'vision') {
    if (window.CameraApp) window.CameraApp.renderEvidenceGallery();
  }
}

// =====================================================================
// Clock
// =====================================================================
function startClock() {
  const el = document.getElementById('liveTime');
  State.clockInterval = setInterval(() => {
    if (el) el.textContent = new Date().toLocaleTimeString();
  }, 1000);
}

// =====================================================================
// Simulation Control
// =====================================================================
async function startSimulation() {
  const btn = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  btn.disabled = true;
  try {
    const res = await Api.startSimulation();
    State.simulationRunning = true;
    Toast.success('🚗 Sensor simulation started!');
    updateSimStatus(true);
    btn.disabled = true;
    btnStop.disabled = false;
    startLivePoll();
  } catch (e) {
    Toast.error('Failed to start simulation: ' + e.message);
    btn.disabled = false;
  }
}

async function stopSimulation() {
  const btn = document.getElementById('btnStop');
  btn.disabled = true;
  try {
    await Api.stopSimulation();
    State.simulationRunning = false;
    Toast.info('⏹ Simulation stopped.');
    updateSimStatus(false);
    document.getElementById('btnStart').disabled = false;
    stopLivePoll();
    setIdleState();
  } catch (e) {
    Toast.error('Failed to stop: ' + e.message);
    btn.disabled = false;
  }
}

function updateSimStatus(running) {
  const badge = document.getElementById('simStatusBadge');
  const modeEl = document.getElementById('modeIndicator');
  if (badge) {
    badge.className = `status-badge${running ? '' : ' offline'}`;
    badge.innerHTML = `<span class="dot"></span>${running ? 'LIVE' : 'OFFLINE'}`;
  }
  if (!running && modeEl) {
    modeEl.className = 'mode-indicator mode-idle';
    modeEl.innerHTML = '<i class="fas fa-circle"></i> IDLE';
  }
}

// =====================================================================
// Live Sensor Polling
// =====================================================================
function startLivePoll() {
  if (State.sensorInterval) clearInterval(State.sensorInterval);
  State.sensorInterval = setInterval(fetchLiveData, 1200);
  fetchLiveData();
}

function stopLivePoll() {
  if (State.sensorInterval) { clearInterval(State.sensorInterval); State.sensorInterval = null; }
}

async function fetchLiveData() {
  try {
    const res = await Api.getLiveSensors();
    if (!res.running) return;
    const d = res.data;
    State.currentSensorData = d;
    updateSensorCards(d);
    updateProbabilityMeter(d.accident_probability || 0);
    updateRiskGauge(d.driver_risk_score || 0);
    updateSeverityDisplay(d.severity || 'None');
    updateModeIndicator(d.mode || 'normal');
    updateAccidentAlert(d);
    updateGPS(d);
    updateQuickStats(d);

    // Auto-capture dashcam frame on accident
    if (window.CameraApp) {
      window.CameraApp.checkAutoCollisionCapture(d);
    }
  } catch (e) {
    console.warn('Sensor fetch error:', e.message);
  }
}

async function triggerTestCrash() {
  try {
    Toast.warning('⚡ Triggering simulated high-speed collision...');
    await Api.setSimulationMode('accident');
    if (window.CameraApp && !window.CameraApp.active) {
      window.CameraApp.active = true;
    }
    setTimeout(fetchLiveData, 300);
  } catch (e) {
    Toast.error('Could not set crash mode: ' + e.message);
  }
}

// =====================================================================
// Sensor Cards Update
// =====================================================================
const sensorDefs = [
  { id: 'sc-speed', key: 'speed', label: 'Speed', unit: 'km/h', icon: '🚗', color: '#4f8ef7', max: 200, thresholds: [80, 120] },
  { id: 'sc-accel-x', key: 'accel_x', label: 'Accel X (ADXL345)', unit: 'g', icon: '📡', color: '#00d4ff', max: 12, thresholds: [2, 5] },
  { id: 'sc-accel-y', key: 'accel_y', label: 'Accel Y', unit: 'g', icon: '📡', color: '#00d4ff', max: 8, thresholds: [1.5, 3.5] },
  { id: 'sc-accel-z', key: 'accel_z', label: 'Accel Z', unit: 'g', icon: '📡', color: '#00d4ff', max: 5, thresholds: [2, 3.5] },
  { id: 'sc-impact', key: 'impact_force', label: 'Impact Force', unit: 'g', icon: '💥', color: '#ef4444', max: 50, thresholds: [5, 15] },
  { id: 'sc-alcohol', key: 'alcohol_level', label: 'Alcohol (MQ-3)', unit: 'BAC', icon: '🍺', color: '#f59e0b', max: 0.4, thresholds: [0.05, 0.08] },
  { id: 'sc-drowsy', key: 'drowsiness_score', label: 'Drowsiness', unit: '', icon: '😴', color: '#8b5cf6', max: 1, thresholds: [0.4, 0.65] },
  { id: 'sc-dist', key: 'obstacle_distance', label: 'Obstacle Dist.', unit: 'm', icon: '📏', color: '#10d981', max: 200, thresholds: [30, 10], inverted: true },
  { id: 'sc-audio', key: 'audio_level', label: 'Microphone', unit: 'dB', icon: '🎙️', color: '#ec4899', max: 130, thresholds: [60, 90] },
  { id: 'sc-gsm', key: 'gsm_signal', label: 'GSM Signal', unit: '%', icon: '📶', color: '#10d981', max: 100, thresholds: [30, 10], inverted: true },
];

function updateSensorCards(d) {
  sensorDefs.forEach(def => {
    const card = document.getElementById(def.id);
    if (!card) return;
    const raw = d[def.key];
    const val = raw !== undefined ? raw : '–';
    const valEl = card.querySelector('.sensor-value');
    if (valEl) valEl.innerHTML = `${typeof val === 'number' ? formatNum(val, def.key) : val}<span class="sensor-unit">${def.unit}</span>`;

    const bar = card.querySelector('.sensor-bar-fill');
    if (bar && typeof val === 'number') {
      const pct = Math.min(Math.abs(val) / def.max * 100, 100);
      bar.style.width = pct + '%';
      bar.style.background = getSensorColor(val, def);
    }
    // Status class
    card.classList.remove('alert', 'warning', 'safe');
    if (typeof val === 'number') {
      const [warn, danger] = def.thresholds;
      const absVal = Math.abs(val);
      const thresh = def.inverted
        ? (absVal < danger ? 'alert' : absVal < warn ? 'warning' : 'safe')
        : (absVal >= danger ? 'alert' : absVal >= warn ? 'warning' : 'safe');
      card.classList.add(thresh);
    }
  });

  // Boolean sensors
  setSensorBool('sc-sos', d.sos_triggered, '🆘 TRIGGERED', '✅ SAFE', 'alert', 'safe');
  setSensorBool('sc-camera', d.camera_active, '✅ ACTIVE', '❌ OFFLINE', 'safe', 'alert');
  setSensorBool('sc-relay', d.relay_status === 'ON', '✅ ON', '⛔ OFF', 'safe', 'alert');
}

function setSensorBool(id, condition, trueLabel, falseLabel, trueClass, falseClass) {
  const card = document.getElementById(id);
  if (!card) return;
  const valEl = card.querySelector('.sensor-value');
  if (valEl) valEl.innerHTML = condition ? trueLabel : falseLabel;
  card.classList.remove('alert', 'warning', 'safe');
  card.classList.add(condition ? trueClass : falseClass);
}

function formatNum(val, key) {
  if (['alcohol_level', 'drowsiness_score', 'accel_x', 'accel_y', 'accel_z', 'impact_force'].includes(key))
    return val.toFixed(4);
  if (key === 'speed') return val.toFixed(1);
  return val.toFixed(2);
}

function getSensorColor(val, def) {
  const absVal = Math.abs(val);
  const [warn, danger] = def.thresholds;
  if (def.inverted) {
    if (absVal < danger) return '#ef4444';
    if (absVal < warn) return '#f59e0b';
    return '#10d981';
  }
  if (absVal >= danger) return '#ef4444';
  if (absVal >= warn) return '#f59e0b';
  return def.color;
}

// =====================================================================
// Probability Meter
// =====================================================================
function updateProbabilityMeter(prob) {
  const pct = Math.round(prob * 100);
  const el = document.getElementById('probValue');
  if (el) el.textContent = pct + '%';
  const elColor = document.getElementById('probColor');
  if (elColor) {
    const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10d981';
    elColor.textContent = pct + '%';
    elColor.style.color = color;
  }
  // SVG arc
  updateArcMeter('probArc', pct, 100);
}

function updateArcMeter(svgId, value, max) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const r = 70, cx = 90, cy = 80;
  const startAngle = -180;
  const endAngle = startAngle + angle;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = angle > 180 ? 1 : 0;
  const path = svg.querySelector('.arc-fill');
  if (path) {
    path.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`);
    const color = pct >= 0.7 ? '#ef4444' : pct >= 0.4 ? '#f59e0b' : '#10d981';
    path.setAttribute('stroke', color);
  }
}

// =====================================================================
// Risk Gauge
// =====================================================================
function updateRiskGauge(score) {
  const el = document.getElementById('riskScore');
  if (el) {
    el.textContent = Math.round(score);
    const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10d981';
    el.style.color = color;
  }
  const label = document.getElementById('riskLabel');
  if (label) {
    label.textContent = score >= 70 ? 'HIGH RISK' : score >= 40 ? 'MODERATE' : 'LOW RISK';
    label.style.color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10d981';
  }
  updateArcMeter('riskArc', score, 100);
}

// =====================================================================
// Severity Display
// =====================================================================
function updateSeverityDisplay(severity) {
  const el = document.getElementById('severityBadge');
  if (!el) return;
  const classMap = { None: 'severity-none', Minor: 'severity-minor', Moderate: 'severity-moderate', Severe: 'severity-severe', Critical: 'severity-critical' };
  el.className = `severity-badge ${classMap[severity] || 'severity-none'}`;
  const icons = { None: '✅', Minor: '⚠', Moderate: '⚠', Severe: '🚨', Critical: '🚨' };
  el.innerHTML = `${icons[severity] || ''} ${severity}`;
}

// =====================================================================
// Mode Indicator
// =====================================================================
function updateModeIndicator(mode) {
  const el = document.getElementById('modeIndicator');
  if (!el) return;
  const modeMap = {
    normal: { cls: 'mode-normal', icon: '🟢', label: 'NORMAL' },
    risky: { cls: 'mode-risky', icon: '🟡', label: 'RISKY' },
    accident: { cls: 'mode-accident', icon: '🔴', label: 'ACCIDENT' },
    idle: { cls: 'mode-idle', icon: '⚫', label: 'IDLE' },
  };
  const m = modeMap[mode] || modeMap.idle;
  el.className = `mode-indicator ${m.cls}`;
  el.innerHTML = `${m.icon} ${m.label}`;
}

// =====================================================================
// Accident Alert
// =====================================================================
function updateAccidentAlert(d) {
  const box = document.getElementById('accidentAlertBox');
  if (!box) return;
  const prob = d.accident_probability || 0;
  const isAccident = prob > 0.5;
  const isWarning = prob > 0.3 && !isAccident;

  if (isAccident) {
    box.className = 'alert-box alert-accident';
    box.innerHTML = `
      <span class="alert-icon">🚨</span>
      <div>
        <div class="alert-title">ACCIDENT DETECTED!</div>
        <div class="alert-msg">Severity: <strong>${d.severity || 'Unknown'}</strong> | Cause: ${d.possible_cause || 'N/A'} | Prob: ${(prob * 100).toFixed(1)}%</div>
        <div class="alert-msg" style="margin-top:4px">${d.sos_triggered ? '🆘 SOS Alert sent to emergency services' : '📡 Emergency protocols activated'}</div>
      </div>`;
    box.style.display = 'flex';
  } else if (isWarning) {
    box.className = 'alert-box alert-warning';
    box.innerHTML = `
      <span class="alert-icon">⚠️</span>
      <div>
        <div class="alert-title">Elevated Risk Detected</div>
        <div class="alert-msg">Accident probability: ${(prob * 100).toFixed(1)}% — ${d.possible_cause || 'Monitor driving conditions'}</div>
      </div>`;
    box.style.display = 'flex';
  } else {
    box.className = 'alert-box alert-safe';
    box.innerHTML = `<span class="alert-icon">✅</span><div><div class="alert-title">All Systems Normal</div><div class="alert-msg">Vehicle operating safely. Probability: ${(prob * 100).toFixed(1)}%</div></div>`;
    box.style.display = 'flex';
  }

  // AI Analysis
  const aiBox = document.getElementById('aiAnalysisBox');
  if (aiBox && d.ai_analysis) {
    aiBox.textContent = d.ai_analysis;
  }
}

// =====================================================================
// GPS Display
// =====================================================================
function updateGPS(d) {
  const lat = document.getElementById('gpsLat');
  const lon = document.getElementById('gpsLon');
  if (lat && d.gps_lat !== undefined) lat.textContent = d.gps_lat.toFixed(6);
  if (lon && d.gps_lon !== undefined) lon.textContent = d.gps_lon.toFixed(6);
}

// =====================================================================
// Quick Stats (header stats)
// =====================================================================
function updateQuickStats(d) {
  setText('qs-speed', d.speed ? d.speed.toFixed(1) + ' km/h' : '–');
  setText('qs-prob', d.accident_probability ? (d.accident_probability * 100).toFixed(1) + '%' : '–');
  setText('qs-risk', d.driver_risk_score ? d.driver_risk_score.toFixed(1) : '–');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// =====================================================================
// Idle State (sim stopped)
// =====================================================================
function setIdleState() {
  updateSeverityDisplay('None');
  updateProbabilityMeter(0);
  updateRiskGauge(0);
  const box = document.getElementById('accidentAlertBox');
  if (box) {
    box.className = 'alert-box alert-safe';
    box.innerHTML = `<span class="alert-icon">⏸</span><div><div class="alert-title">Simulation Stopped</div><div class="alert-msg">Press "Start Simulation" to begin monitoring.</div></div>`;
  }
  const aiBox = document.getElementById('aiAnalysisBox');
  if (aiBox) aiBox.textContent = 'Start simulation to see AI analysis...';
}

// =====================================================================
// Accident History Page
// =====================================================================
async function loadAccidentHistory() {
  const tbody = document.getElementById('accidentTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><div class="spinner" style="margin:0 auto"></div></td></tr>';
  try {
    const res = await Api.getAccidents(100);
    State.accidentHistory = res.accidents || [];
    renderAccidentTable(State.accidentHistory);
    setText('totalAccidentsCount', State.accidentHistory.length);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty text-danger">Error: ${e.message}</td></tr>`;
  }
}

function renderAccidentTable(accidents) {
  const tbody = document.getElementById('accidentTableBody');
  if (!tbody) return;
  if (!accidents.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty"><i class="fas fa-car-crash"></i><br>No accidents recorded yet.<br><span class="text-sm text-muted">Start simulation to generate data.</span></td></tr>';
    return;
  }
  tbody.innerHTML = accidents.map(a => `
    <tr>
      <td><span class="font-mono" style="color:var(--accent-cyan)">#${a.id}</span></td>
      <td><span class="text-sm">${new Date(a.timestamp).toLocaleString()}</span></td>
      <td><span class="font-mono">${(a.speed || 0).toFixed(1)}</span></td>
      <td><span class="severity-badge severity-${(a.severity || 'none').toLowerCase()}">${a.severity || 'N/A'}</span></td>
      <td><span style="color:${(a.accident_probability||0)>0.7?'var(--accent-red)':'var(--accent-yellow)'}; font-weight:700;">${((a.accident_probability||0)*100).toFixed(1)}%</span></td>
      <td><span class="text-sm">${a.possible_cause || 'Unknown'}</span></td>
      <td><span style="color:${(a.driver_risk_score||0)>70?'var(--accent-red)':'var(--accent-green)'}; font-weight:700;">${(a.driver_risk_score||0).toFixed(1)}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="viewAccidentDetail(${a.id})"><i class="fas fa-eye"></i></button>
        <button class="btn btn-primary btn-sm" onclick="downloadPDF(${a.id})"><i class="fas fa-file-pdf"></i></button>
      </td>
    </tr>`).join('');
}

async function viewAccidentDetail(id) {
  try {
    const a = await Api.getAccident(id);
    showAccidentModal(a);
  } catch (e) {
    Toast.error('Failed to load accident details: ' + e.message);
  }
}

function showAccidentModal(a) {
  const existing = document.getElementById('accidentModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay'; modal.id = 'accidentModal';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">📋 Accident Report #${a.id}</div>
        <button class="modal-close" onclick="document.getElementById('accidentModal').remove()">✕</button>
      </div>
      <div class="flex-between mb-2">
        <span class="severity-badge severity-${(a.severity||'none').toLowerCase()}">${a.severity || 'N/A'}</span>
        <span class="text-sm text-muted">${new Date(a.timestamp).toLocaleString()}</span>
      </div>
      <div class="detail-grid mb-2">
        ${[
          ['Speed', (a.speed||0).toFixed(1)+' km/h'],
          ['Impact Force', (a.impact_force||0).toFixed(4)+' g'],
          ['Alcohol (BAC)', (a.alcohol_level||0).toFixed(4)],
          ['Drowsiness', (a.drowsiness_score||0).toFixed(4)],
          ['Obstacle Dist.', (a.obstacle_distance||0).toFixed(2)+' m'],
          ['SOS', a.sos_triggered ? '🆘 TRIGGERED' : '✅ No'],
          ['GPS', `${(a.gps_lat||0).toFixed(4)}, ${(a.gps_lon||0).toFixed(4)}`],
          ['Probability', ((a.accident_probability||0)*100).toFixed(1)+'%'],
          ['Risk Score', (a.driver_risk_score||0).toFixed(1)+'/100'],
          ['Emergency', a.emergency_alerted ? '✅ Alerted' : 'No'],
        ].map(([k,v]) => `<div class="detail-item"><div class="detail-label">${k}</div><div class="detail-value">${v}</div></div>`).join('')}
      </div>
      <div style="margin-bottom:0.8rem">
        <div class="detail-label mb-1">Possible Cause</div>
        <div style="color:var(--accent-yellow); font-weight:600">${a.possible_cause || 'Unknown'}</div>
      </div>
      <div style="margin-bottom:1rem">
        <div class="detail-label mb-1">AI Analysis</div>
        <div class="ai-analysis-box">${a.ai_analysis || 'N/A'}</div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-primary" onclick="downloadPDF(${a.id})"><i class="fas fa-file-pdf"></i> Download PDF Report</button>
        <button class="btn btn-secondary" onclick="document.getElementById('accidentModal').remove()">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function downloadPDF(id) {
  Toast.info('Generating PDF report...');
  try {
    await Api.downloadReport(id);
    Toast.success('PDF report downloaded!');
  } catch (e) {
    Toast.error('PDF generation failed: ' + e.message);
  }
}

// =====================================================================
// Analytics Page
// =====================================================================
async function loadAnalytics() {
  try {
    const [analytics, historyRes] = await Promise.all([
      Api.getAnalytics(),
      Api.getSensorHistory(200)
    ]);

    setText('ana-total-acc', analytics.total_accidents);
    setText('ana-total-reads', analytics.total_readings);
    setText('ana-avg-speed', (analytics.speed_stats?.mean || 0).toFixed(1) + ' km/h');
    setText('ana-avg-prob', ((analytics.avg_accident_probability || 0) * 100).toFixed(1) + '%');

    renderSeverityChart(analytics.severity_distribution || {});
    renderCauseChart(analytics.cause_distribution || {});
    renderTimelineChart(analytics.accident_timeline || {});
    if (historyRes.data && historyRes.data.length) {
      renderSpeedChart(historyRes.data);
    }
    if (State.currentSensorData && Object.keys(State.currentSensorData).length) {
      renderRiskRadar(State.currentSensorData);
    }
  } catch (e) {
    Toast.error('Analytics load failed: ' + e.message);
  }
}

// =====================================================================
// ML Metrics Page
// =====================================================================
async function loadMLMetrics() {
  const container = document.getElementById('mlMetricsContainer');
  try {
    const metrics = await Api.getMetrics();
    if (container) {
      container.innerHTML = `
        <div class="grid-4 mb-3">
          ${[
            ['Accuracy', metrics.accuracy, '#4f8ef7'],
            ['Precision', metrics.precision, '#10d981'],
            ['Recall', metrics.recall, '#f59e0b'],
            ['F1-Score', metrics.f1_score, '#8b5cf6'],
          ].map(([name, val, color]) => `
            <div class="stat-card">
              <div class="accent-line" style="background:${color}"></div>
              <div class="stat-label">${name}</div>
              <div class="stat-value" style="color:${color}">${((val||0)*100).toFixed(1)}%</div>
              <div class="progress-bar mt-1"><div class="progress-fill" style="width:${(val||0)*100}%;background:${color}"></div></div>
            </div>`).join('')}
        </div>
        <div class="grid-2">
          <div class="card"><div class="card-title mb-2">Model Info</div>
            ${[
              ['Model Version', metrics.model_version || 'N/A'],
              ['Dataset Size', metrics.dataset_size + ' records'],
            ].map(([k,v]) => `<div class="metric-row"><span class="metric-label">${k}</span><span class="metric-value" style="color:var(--accent-cyan)">${v}</span></div>`).join('')}
          </div>
          <div class="card"><div class="card-title mb-2">Confusion Matrix</div>
            ${renderConfusionMatrix(metrics.confusion_matrix)}
          </div>
        </div>`;
    }
    renderMetricsChart(metrics);
    if (metrics.feature_importance) renderFeatureImportance(metrics.feature_importance);
  } catch (e) {
    if (container) container.innerHTML = `<div class="empty-state"><i class="fas fa-robot"></i><p>Model not trained yet. Click "Train Model" to begin.</p></div>`;
  }
}

function renderConfusionMatrix(cm) {
  if (!cm || !cm.length) return '<div class="text-muted text-sm">N/A</div>';
  return `<table style="width:100%;font-size:0.85rem"><thead><tr><th></th><th style="color:var(--accent-green)">Pred: No</th><th style="color:var(--accent-red)">Pred: Yes</th></tr></thead><tbody>
    <tr><td style="color:var(--text-secondary)">Actual: No</td><td style="color:var(--accent-green);font-weight:700">${cm[0]?.[0]??0}</td><td style="color:var(--accent-red)">${cm[0]?.[1]??0}</td></tr>
    <tr><td style="color:var(--text-secondary)">Actual: Yes</td><td style="color:var(--accent-orange)">${cm[1]?.[0]??0}</td><td style="color:var(--accent-green);font-weight:700">${cm[1]?.[1]??0}</td></tr>
  </tbody></table>`;
}

async function trainModel() {
  const btn = document.getElementById('btnTrainModel');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Training...'; }
  Toast.info('Training ML model... this may take a moment.');
  try {
    const res = await Api.trainModel();
    Toast.success(`Model trained! Accuracy: ${(res.metrics.accuracy * 100).toFixed(1)}%`);
    loadMLMetrics();
  } catch (e) {
    Toast.error('Training failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-brain"></i> Train Model'; }
  }
}

// =====================================================================
// Dataset Page
// =====================================================================
async function loadDatasetPreview() {
  const statsEl = document.getElementById('datasetStats');
  const tableEl = document.getElementById('datasetPreviewTable');
  try {
    const res = await Api.getDatasetPreview();
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="grid-4 mb-2">
          ${[
            ['Total Records', res.stats.rows, '#4f8ef7'],
            ['Columns', res.stats.columns?.length || 0, '#10d981'],
            ['Accident Rate', res.stats.accident_rate + '%', '#ef4444'],
            ['Severities', Object.keys(res.stats.severity_dist || {}).length, '#8b5cf6'],
          ].map(([k,v,c]) => `<div class="stat-card"><div class="accent-line" style="background:${c}"></div><div class="stat-label">${k}</div><div class="stat-value" style="color:${c}">${v}</div></div>`).join('')}
        </div>`;
    }
    if (tableEl && res.preview && res.preview.length) {
      const cols = Object.keys(res.preview[0]);
      tableEl.innerHTML = `<table>
        <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${res.preview.map(row => `<tr>${cols.map(c => `<td>${row[c] !== null ? row[c] : '–'}</td>`).join('')}</tr>`).join('')}
        </tbody></table>`;
    }
  } catch (e) {
    if (statsEl) statsEl.innerHTML = `<div class="empty-state"><i class="fas fa-table"></i><p>Dataset not found. Click "Generate Dataset" below.</p></div>`;
  }
}

async function generateDataset() {
  const btn = document.getElementById('btnGenDataset');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Generating...'; }
  Toast.info('Generating dataset... please wait.');
  try {
    await Api.trainModel(); // This also regenerates dataset on server side
    Toast.success('Dataset generated and model trained!');
    loadDatasetPreview();
  } catch (e) {
    Toast.error('Generation failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-database"></i> Generate Dataset'; }
  }
}

// File upload
function initUpload() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) uploadFile(input.files[0]);
  });
}

async function uploadFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'csv'].includes(ext)) {
    Toast.error('Only .xlsx and .csv files are supported.');
    return;
  }
  const formData = new FormData();
  formData.append('file', file);
  Toast.info(`Uploading ${file.name}...`);
  try {
    const res = await Api.uploadFile('/dataset/upload', formData);
    Toast.success(`Dataset uploaded! ${res.rows} records, ${res.accident_rate}% accident rate`);
    loadDatasetPreview();
  } catch (e) {
    Toast.error('Upload failed: ' + e.message);
  }
}

// =====================================================================
// System Info Check on Load
// =====================================================================
async function checkSystemStatus() {
  try {
    const info = await Api.getSystemInfo();
    if (info.simulation_running) {
      State.simulationRunning = true;
      updateSimStatus(true);
      document.getElementById('btnStart').disabled = true;
      document.getElementById('btnStop').disabled = false;
      startLivePoll();
    }
    const modelStatus = document.getElementById('modelStatus');
    if (modelStatus) {
      modelStatus.textContent = info.model_trained ? '✅ Model Trained' : '⚠ Not Trained';
      modelStatus.style.color = info.model_trained ? 'var(--accent-green)' : 'var(--accent-yellow)';
    }
  } catch (e) {
    Toast.error('Cannot connect to backend. Is Flask running?');
  }
}

// =====================================================================
// Severity Filter for History
// =====================================================================
function filterAccidents() {
  const sev = document.getElementById('severityFilter')?.value || '';
  const filtered = sev
    ? State.accidentHistory.filter(a => a.severity === sev)
    : State.accidentHistory;
  renderAccidentTable(filtered);
}

// =====================================================================
// INIT
// =====================================================================
document.addEventListener('DOMContentLoaded', async () => {
  Toast.init();
  initNav();
  startClock();
  initUpload();

  // Wire up buttons
  document.getElementById('btnStart')?.addEventListener('click', () => {
    startSimulation();
    if (window.CameraApp && !window.CameraApp.active) {
      window.CameraApp.active = true;
    }
  });
  document.getElementById('btnStop')?.addEventListener('click', stopSimulation);
  document.getElementById('btnTrainModel')?.addEventListener('click', trainModel);
  document.getElementById('btnGenDataset')?.addEventListener('click', generateDataset);
  document.getElementById('btnDownloadDataset')?.addEventListener('click', () => Api.downloadDataset().catch(e => Toast.error(e.message)));
  document.getElementById('btnClearAccidents')?.addEventListener('click', async () => {
    if (!confirm('Clear all accident records?')) return;
    try {
      const r = await Api.clearAccidents();
      Toast.success(`Cleared ${r.deleted} records.`);
      loadAccidentHistory();
    } catch (e) { Toast.error(e.message); }
  });
  document.getElementById('severityFilter')?.addEventListener('change', filterAccidents);
  document.getElementById('btnRefreshAnalytics')?.addEventListener('click', loadAnalytics);

  // Wire up Camera and Mission Toolbar
  document.getElementById('btnTestCrash')?.addEventListener('click', triggerTestCrash);
  document.getElementById('btnCameraToggle')?.addEventListener('click', () => {
    if (window.CameraApp) window.CameraApp.togglePower();
  });
  document.getElementById('btnQuickSnap')?.addEventListener('click', () => {
    if (window.CameraApp) window.CameraApp.captureSnapshot('manual');
  });
  document.getElementById('cameraDeviceSelect')?.addEventListener('change', (e) => {
    if (window.CameraApp) window.CameraApp.setSource(e.target.value);
  });
  document.getElementById('btnCameraFullscreen')?.addEventListener('click', () => {
    if (window.CameraApp) window.CameraApp.toggleFullscreen();
  });
  document.getElementById('modalSnapClose')?.addEventListener('click', () => {
    const modal = document.getElementById('snapshotModal');
    if (modal) modal.style.display = 'none';
  });

  // Initialize Camera App
  if (window.CameraApp) {
    window.CameraApp.init('dashcamVideo', 'dashcamCanvas');
    window.CameraApp.renderEvidenceGallery();
  }

  // Initial status check
  await checkSystemStatus();
  setIdleState();
});
