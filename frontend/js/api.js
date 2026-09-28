/**
 * api.js - API communication layer for Car Black Box frontend
 */
const API_BASE = '/api';

const Api = {
  async get(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  },

  async post(endpoint, data = {}) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  },

  async uploadFile(endpoint, formData) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  },

  async download(endpoint, filename) {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },

  // Simulation
  startSimulation: () => Api.post('/simulation/start'),
  stopSimulation: () => Api.post('/simulation/stop'),
  getSimulationStatus: () => Api.get('/simulation/status'),
  setSimulationMode: (mode) => Api.post('/simulation/mode', { mode }),

  // Camera & Snapshots
  saveSnapshot: (image, reason = 'manual', telemetry = {}) =>
    Api.post('/camera/snapshot', { image, reason, telemetry }),

  // Sensors
  getLiveSensors: () => Api.get('/sensors/live'),
  getSensorHistory: (limit = 60) => Api.get(`/sensors/history?limit=${limit}`),

  // Accidents
  getAccidents: (limit = 50, severity = '') =>
    Api.get(`/accidents?limit=${limit}${severity ? `&severity=${severity}` : ''}`),
  getAccident: (id) => Api.get(`/accidents/${id}`),
  clearAccidents: () => Api.post('/accidents/clear'),

  // ML
  predict: (data) => Api.post('/predict', data),
  trainModel: () => Api.post('/ml/train'),
  getMetrics: () => Api.get('/ml/metrics'),

  // Analytics
  getAnalytics: () => Api.get('/analytics'),

  // Dataset
  getDatasetPreview: () => Api.get('/dataset/preview'),
  downloadDataset: () => Api.download('/dataset/download', 'car_black_box_dataset.xlsx'),
  downloadReport: (id) => Api.download(`/report/${id}/pdf`, `accident_report_${id}.pdf`),

  // System
  getSystemInfo: () => Api.get('/system/info'),
};

// ---- Toast Notifications ----
const Toast = {
  container: null,
  init() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  },
  show(message, type = 'info', duration = 4000) {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    this.container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success: (msg) => Toast.show(msg, 'success'),
  error: (msg) => Toast.show(msg, 'error'),
  warning: (msg) => Toast.show(msg, 'warning'),
  info: (msg) => Toast.show(msg, 'info'),
};
