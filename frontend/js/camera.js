/**
 * camera.js - Automotive Dashcam & Driver Monitoring Vision Engine
 * Supports real webcam access (getUserMedia), hardware selection,
 * intelligent road/cabin simulation fallbacks, real-time HUD telemetry overlays,
 * and automated collision snapshot evidence archiving.
 */

class BlackBoxCamera {
  constructor() {
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx = null;
    this.stream = null;
    this.mode = 'road'; // 'webcam' | 'road' | 'cabin'
    this.active = false;
    this.recording = false;
    this.recStartTime = null;
    this.animFrameId = null;
    this.roadOffset = 0;
    this.devices = [];
    this.selectedDeviceId = null;
    this.evidenceLog = [];
    this.lastAutoSnapshotTime = 0;
    this.flashActive = false;

    // Road sim state
    this.roadSpeed = 50;
    this.obstacleDist = 50;
    this.otherCarZ = 80;
    this.starField = [];
    for (let i = 0; i < 40; i++) {
      this.starField.push({
        x: Math.random() * 640,
        y: Math.random() * 160,
        s: Math.random() * 1.5 + 0.5
      });
    }

    // Load saved evidence from localStorage
    try {
      const saved = localStorage.getItem('bbox_evidence_snapshots');
      if (saved) this.evidenceLog = JSON.parse(saved);
    } catch (e) {
      console.warn('Could not read cached snapshots:', e);
    }
  }

  init(videoElementId, canvasElementId) {
    this.videoEl = document.getElementById(videoElementId);
    this.canvasEl = document.getElementById(canvasElementId);
    if (!this.canvasEl) return;
    this.ctx = this.canvasEl.getContext('2d');

    // Auto-enumerate camera devices
    this.enumerateVideoDevices();

    // Start render loop
    this.startRenderLoop();
  }

  async enumerateVideoDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      this.devices = devs.filter(d => d.kind === 'videoinput');
      this.populateDeviceDropdown();
    } catch (e) {
      console.warn('Device enumeration failed:', e);
    }
  }

  populateDeviceDropdown() {
    const sel = document.getElementById('cameraDeviceSelect');
    if (!sel) return;
    sel.innerHTML = '';

    const simRoadOpt = document.createElement('option');
    simRoadOpt.value = 'mode_road';
    simRoadOpt.textContent = '🛣️ Dashcam Highway Simulator';
    sel.appendChild(simRoadOpt);

    const simCabinOpt = document.createElement('option');
    simCabinOpt.value = 'mode_cabin';
    simCabinOpt.textContent = '👤 Cabin Driver Monitor (DMS)';
    sel.appendChild(simCabinOpt);

    if (this.devices.length > 0) {
      this.devices.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.textContent = `📷 ${dev.label || `Camera ${idx + 1}`}`;
        sel.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = 'webcam_default';
      opt.textContent = '📷 Live Webcam (Default)';
      sel.appendChild(opt);
    }

    sel.value = this.mode === 'road' ? 'mode_road' : this.mode === 'cabin' ? 'mode_cabin' : (this.selectedDeviceId || 'webcam_default');
  }

  async setSource(sourceValue) {
    if (sourceValue === 'mode_road') {
      this.stopWebcam();
      this.mode = 'road';
      this.active = true;
      this.updateStatusBadge('SIMULATED HIGHWAY', 'info');
      Toast.info('Switched to Highway Dashcam Simulation');
    } else if (sourceValue === 'mode_cabin') {
      this.stopWebcam();
      this.mode = 'cabin';
      this.active = true;
      this.updateStatusBadge('CABIN DMS ACTIVE', 'info');
      Toast.info('Switched to Cabin Driver Monitoring (DMS)');
    } else {
      this.selectedDeviceId = sourceValue === 'webcam_default' ? null : sourceValue;
      await this.startWebcam(this.selectedDeviceId);
    }
  }

  async startWebcam(deviceId = null) {
    this.updateStatusBadge('REQUESTING PERMISSION...', 'warning');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      Toast.warning('Browser does not support camera access. Falling back to Dashcam Simulator.');
      this.mode = 'road';
      this.active = true;
      this.updateStatusBadge('SIMULATOR FALLBACK', 'warning');
      return false;
    }

    const constraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    };

    try {
      this.stopWebcam();
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoEl) {
        this.videoEl.srcObject = this.stream;
        await this.videoEl.play();
      }
      this.mode = 'webcam';
      this.active = true;
      this.recording = true;
      if (!this.recStartTime) this.recStartTime = Date.now();
      this.updateStatusBadge('LIVE WEBCAM', 'safe');
      Toast.success('Camera access granted! Live Dashcam feed active.');
      // Re-enumerate to get device labels now that permission is granted
      this.enumerateVideoDevices();
      return true;
    } catch (err) {
      console.warn('Webcam access error:', err);
      let errMsg = 'Camera access denied or unavailable.';
      if (err.name === 'NotAllowedError') errMsg = 'Camera permission was denied in browser settings.';
      else if (err.name === 'NotFoundError') errMsg = 'No physical camera detected on this system.';
      Toast.warning(`${errMsg} Switched to Dashcam Simulation mode.`);

      this.mode = 'road';
      this.active = true;
      this.updateStatusBadge('SIMULATED FEED', 'info');
      const sel = document.getElementById('cameraDeviceSelect');
      if (sel) sel.value = 'mode_road';
      return false;
    }
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
  }

  togglePower() {
    if (this.active) {
      this.stopWebcam();
      this.active = false;
      this.updateStatusBadge('CAMERA STANDBY', 'offline');
      Toast.info('Dashcam vision paused.');
    } else {
      if (this.mode === 'webcam') {
        this.startWebcam(this.selectedDeviceId);
      } else {
        this.active = true;
        this.updateStatusBadge(this.mode === 'road' ? 'HIGHWAY SIM' : 'CABIN DMS', 'safe');
        Toast.success('Dashcam vision enabled.');
      }
    }
  }

  updateStatusBadge(text, type = 'safe') {
    const badge = document.getElementById('dashcamStatusBadge');
    if (!badge) return;
    badge.className = `status-badge ${type}`;
    badge.innerHTML = `<span class="dot"></span>${text}`;
  }

  // =====================================================================
  // RENDER PIPELINE & HUD OVERLAYS
  // =====================================================================
  startRenderLoop() {
    const render = () => {
      this.drawFrame();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  drawFrame() {
    if (!this.canvasEl || !this.ctx) return;
    const cw = this.canvasEl.width || 640;
    const ch = this.canvasEl.height || 360;
    const ctx = this.ctx;
    const telemetry = State.currentSensorData || {};

    ctx.clearRect(0, 0, cw, ch);

    // 1. Draw Feed (Webcam OR Procedural Simulator)
    if (!this.active) {
      this.drawStandbyScreen(ctx, cw, ch);
    } else if (this.mode === 'webcam' && this.videoEl && this.videoEl.readyState >= 2) {
      ctx.save();
      // Slight automotive sensor color grade
      ctx.drawImage(this.videoEl, 0, 0, cw, ch);
      ctx.restore();
    } else if (this.mode === 'cabin') {
      this.drawCabinSimulator(ctx, cw, ch, telemetry);
    } else {
      // Default to Road Simulator
      this.drawRoadSimulator(ctx, cw, ch, telemetry);
    }

    // 2. Draw HUD Elements if active
    if (this.active) {
      this.drawAutomotiveHUD(ctx, cw, ch, telemetry);
    }

    // 3. Shutter Flash overlay
    if (this.flashActive) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  drawStandbyScreen(ctx, w, h) {
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    // Cross grid
    ctx.strokeStyle = 'rgba(79, 142, 247, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    ctx.fillStyle = '#556070';
    ctx.font = '14px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VISION SENSOR STANDBY', w / 2, h / 2 - 10);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#3a4454';
    ctx.fillText('Click "Start Feed" or "Start Simulation" to initialize stream', w / 2, h / 2 + 15);
  }

  drawRoadSimulator(ctx, w, h, telemetry) {
    const speed = Math.max(telemetry.speed || 40, 5);
    const horizon = h * 0.45;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    skyGrad.addColorStop(0, '#060a14');
    skyGrad.addColorStop(1, '#0e1a32');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, horizon);

    // Stars/Distant city lights
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    this.starField.forEach(s => {
      ctx.fillRect(s.x, (s.y % horizon), s.s, s.s);
    });

    // Horizon mountain / city silhouettes
    ctx.fillStyle = '#0c1424';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 40) {
      const my = horizon - 8 - Math.sin(x * 0.05) * 6;
      ctx.lineTo(x, my);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();

    // Road surface
    const roadGrad = ctx.createLinearGradient(0, horizon, 0, h);
    roadGrad.addColorStop(0, '#121722');
    roadGrad.addColorStop(1, '#1b2230');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Road Perspective Trapeze
    const topW = 40;
    const bottomW = w * 0.85;
    const cx = w / 2;

    ctx.fillStyle = '#171e2c';
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, horizon);
    ctx.lineTo(cx + topW / 2, horizon);
    ctx.lineTo(cx + bottomW / 2, h);
    ctx.lineTo(cx - bottomW / 2, h);
    ctx.closePath();
    ctx.fill();

    // Side guard rails (neon reflectors)
    ctx.strokeStyle = '#00d4ff33';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - topW / 2, horizon); ctx.lineTo(cx - bottomW / 2, h);
    ctx.moveTo(cx + topW / 2, horizon); ctx.lineTo(cx + bottomW / 2, h);
    ctx.stroke();

    // Animated Lane Dividers
    this.roadOffset = (this.roadOffset + speed * 0.3) % 80;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;

    for (let d = this.roadOffset; d < h - horizon; d += 60) {
      const p = d / (h - horizon);
      const y = horizon + d;
      const lw = 4 + p * 20;
      const curHalf = (topW + (bottomW - topW) * p) * 0.18;

      ctx.beginPath();
      ctx.moveTo(cx - curHalf, y);
      ctx.lineTo(cx - curHalf, y + lw);
      ctx.moveTo(cx + curHalf, y);
      ctx.lineTo(cx + curHalf, y + lw);
      ctx.stroke();
    }

    // Vehicle Ahead (Obstacle Simulation)
    const obsDist = telemetry.obstacle_distance || 45;
    const targetZ = Math.min(Math.max(obsDist, 5), 100);
    const carP = 1 - (targetZ / 100);
    const carY = horizon + (h - horizon) * (0.2 + carP * 0.55);
    const carW = 20 + carP * 70;
    const carH = carW * 0.55;
    const carX = cx - carW / 2 + Math.sin(Date.now() * 0.001) * 20;

    // Draw lead vehicle
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(carX, carY - carH, carW, carH);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(carX + carW * 0.15, carY - carH * 1.4, carW * 0.7, carH * 0.5);

    // Tail lights
    ctx.fillStyle = telemetry.mode === 'accident' || obsDist < 15 ? '#ff0033' : '#cc1133';
    ctx.fillRect(carX + 2, carY - carH * 0.7, carW * 0.2, carH * 0.3);
    ctx.fillRect(carX + carW * 0.8 - 2, carY - carH * 0.7, carW * 0.2, carH * 0.3);

    // Obstacle Distance Bounding Box
    if (obsDist < 30) {
      ctx.strokeStyle = obsDist < 12 ? '#ef4444' : '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(carX - 4, carY - carH * 1.5, carW + 8, carH * 1.6);
      ctx.fillStyle = obsDist < 12 ? '#ef4444' : '#f59e0b';
      ctx.font = '9px Orbitron, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`PROXIMITY: ${obsDist.toFixed(1)}m`, carX - 4, carY - carH * 1.5 - 4);
    }

    // Bottom Hood / Dashboard Silhouette
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.15, h - 35);
    ctx.quadraticCurveTo(w / 2, h - 50, w * 0.85, h - 35);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Center hood crease reflection
    ctx.strokeStyle = 'rgba(79, 142, 247, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 45);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  }

  drawCabinSimulator(ctx, w, h, telemetry) {
    // Cabin dark interior
    ctx.fillStyle = '#0d131f';
    ctx.fillRect(0, 0, w, h);

    // Driver silhouette
    const cx = w * 0.5;
    const cy = h * 0.52;

    // Car seat backrest
    ctx.fillStyle = '#161e2e';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 40, 110, 130, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head / Face
    ctx.fillStyle = '#222f44';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 20, 48, 62, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye Blink / Drowsiness Face Mesh Simulation
    const drowsy = telemetry.drowsiness_score || 0.08;
    const eyeOpenness = Math.max(0.05, 1 - drowsy);
    const boxColor = drowsy > 0.6 ? '#ef4444' : drowsy > 0.35 ? '#f59e0b' : '#10d981';

    // Face Tracking Bounding Box
    ctx.strokeStyle = boxColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 55, cy - 85, 110, 130);

    // Corner brackets
    this.drawCornerBrackets(ctx, cx - 55, cy - 85, 110, 130, boxColor);

    // Eyes
    ctx.fillStyle = boxColor;
    ctx.beginPath();
    // Left eye
    ctx.ellipse(cx - 20, cy - 25, 12, 10 * eyeOpenness, 0, 0, Math.PI * 2);
    // Right eye
    ctx.ellipse(cx + 20, cy - 25, 12, 10 * eyeOpenness, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil tracker dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 20, cy - 25, 3 * eyeOpenness, 0, Math.PI * 2);
    ctx.arc(cx + 20, cy - 25, 3 * eyeOpenness, 0, Math.PI * 2);
    ctx.fill();

    // DMS Status overlay
    ctx.fillStyle = boxColor;
    ctx.font = '10px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`DRIVER STATUS: ${drowsy > 0.6 ? 'FATIGUE ALERT' : drowsy > 0.35 ? 'DROWSY' : 'ATTENTIVE'}`, cx - 55, cy - 92);
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText(`PERCLOS: ${(drowsy * 100).toFixed(1)}% | EYE BLINK: ${drowsy.toFixed(3)}`, cx - 55, cy + 62);
  }

  drawCornerBrackets(ctx, x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    const len = 14;

    // Top-Left
    ctx.beginPath(); ctx.moveTo(x, y + len); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    // Top-Right
    ctx.beginPath(); ctx.moveTo(x + w - len, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + len); ctx.stroke();
    // Bottom-Left
    ctx.beginPath(); ctx.moveTo(x, y + h - len); ctx.lineTo(x, y + h); ctx.lineTo(x + len, y + h); ctx.stroke();
    // Bottom-Right
    ctx.beginPath(); ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len); ctx.stroke();
  }

  drawAutomotiveHUD(ctx, w, h, telemetry) {
    const isAccident = telemetry.mode === 'accident' || (telemetry.accident_probability || 0) > 0.65;
    const isWarning = telemetry.mode === 'risky' || (telemetry.accident_probability || 0) > 0.35;

    // --- 1. Top HUD Header Bar (Glassmorphic) ---
    ctx.fillStyle = 'rgba(10, 14, 26, 0.75)';
    ctx.fillRect(0, 0, w, 28);
    ctx.strokeStyle = 'rgba(79, 142, 247, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 28); ctx.lineTo(w, 28); ctx.stroke();

    // Recording Indicator
    const recDotColor = (Math.floor(Date.now() / 600) % 2 === 0) ? '#ef4444' : 'transparent';
    ctx.fillStyle = recDotColor;
    ctx.beginPath();
    ctx.arc(14, 14, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e8ecf4';
    ctx.font = '10px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('REC', 24, 18);

    // System Timestamp with ms
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 2);
    ctx.fillStyle = '#8899aa';
    ctx.font = '10px Orbitron, sans-serif';
    ctx.fillText(timeStr, 65, 18);

    // Vision Channel ID
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00d4ff';
    const channelName = this.mode === 'webcam' ? 'CAM-01 [LIVE WEBCAM]' : this.mode === 'cabin' ? 'CAM-02 [CABIN DMS]' : 'CAM-01 [FRONT DASHCAM]';
    ctx.fillText(channelName, w - 12, 18);

    // --- 2. Center Crosshairs / Artificial Horizon Indicator ---
    const cx = w / 2;
    const cy = h / 2 - 10;
    const ax = (telemetry.accel_x || 0) * 15;
    const ay = (telemetry.accel_y || 0) * 15;

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.35)';
    ctx.lineWidth = 1;

    // Pitch & roll horizon ladder
    ctx.beginPath();
    ctx.moveTo(cx - 35, cy + ay); ctx.lineTo(cx - 10, cy + ay);
    ctx.moveTo(cx + 10, cy + ay); ctx.lineTo(cx + 35, cy + ay);
    // Center reticle
    ctx.arc(cx + ax, cy, 3, 0, Math.PI * 2);
    ctx.stroke();

    // --- 3. Bottom HUD Telemetry Strip (Black Box Forensics) ---
    ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
    ctx.fillRect(0, h - 34, w, 34);
    ctx.strokeStyle = 'rgba(79, 142, 247, 0.25)';
    ctx.beginPath(); ctx.moveTo(0, h - 34); ctx.lineTo(w, h - 34); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '10px Orbitron, sans-serif';

    // Speed
    const spd = (telemetry.speed || 0).toFixed(1);
    ctx.fillStyle = telemetry.speed > 100 ? '#f59e0b' : '#00d4ff';
    ctx.fillText(`SPD: ${spd} KM/H`, 12, h - 14);

    // G-Force (ADXL345)
    const impact = (telemetry.impact_force || 0).toFixed(2);
    ctx.fillStyle = impact > 5 ? '#ef4444' : '#10d981';
    ctx.fillText(`G-FORCE: ${impact}G`, 120, h - 14);

    // GPS Position
    const lat = (telemetry.gps_lat || 19.076).toFixed(4);
    const lon = (telemetry.gps_lon || 72.8777).toFixed(4);
    ctx.fillStyle = '#8899aa';
    ctx.fillText(`GPS: ${lat}°N, ${lon}°E`, 245, h - 14);

    // Risk / Status
    ctx.textAlign = 'right';
    if (isAccident) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('CRASH ALERT', w - 12, h - 14);
    } else if (isWarning) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('CAUTION: RISKY', w - 12, h - 14);
    } else {
      ctx.fillStyle = '#10d981';
      ctx.fillText('STATUS: SAFE', w - 12, h - 14);
    }

    // --- 4. Emergency / Collision Flashing Watermark Banner ---
    if (isAccident) {
      // Flashing alert border around viewport
      ctx.strokeStyle = (Math.floor(Date.now() / 250) % 2 === 0) ? 'rgba(239, 68, 68, 0.9)' : 'rgba(239, 68, 68, 0.3)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);

      // Warning Badge Center
      ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
      ctx.fillRect(cx - 160, cy - 25, 320, 50);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - 160, cy - 25, 320, 50);

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠️ CRITICAL IMPACT DETECTED', cx, cy - 6);
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('BUFFER LOCKED • EVIDENCE ARCHIVED TO BLACK BOX', cx, cy + 12);
    }
  }

  // =====================================================================
  // SNAPSHOT & EVIDENCE CAPTURE
  // =====================================================================
  captureSnapshot(reason = 'manual') {
    if (!this.canvasEl) return null;

    // Trigger shutter flash
    this.flashActive = true;
    setTimeout(() => { this.flashActive = false; }, 120);

    const dataUrl = this.canvasEl.toDataURL('image/jpeg', 0.88);
    const telemetry = State.currentSensorData || {};
    const timestamp = new Date().toISOString();

    const snapshotItem = {
      id: 'snap_' + Date.now(),
      timestamp,
      reason,
      speed: telemetry.speed || 0,
      impact: telemetry.impact_force || 0,
      severity: telemetry.severity || 'Normal',
      prob: telemetry.accident_probability || 0,
      gps: `${(telemetry.gps_lat || 19.076).toFixed(4)}, ${(telemetry.gps_lon || 72.8777).toFixed(4)}`,
      dataUrl
    };

    // Prepend to evidence log
    this.evidenceLog.unshift(snapshotItem);
    if (this.evidenceLog.length > 20) this.evidenceLog.pop();

    // Cache locally
    try {
      localStorage.setItem('bbox_evidence_snapshots', JSON.stringify(this.evidenceLog.slice(0, 10)));
    } catch (e) {
      console.warn('LocalStorage snapshot quota exceeded:', e);
    }

    // Attempt backend sync
    Api.post('/camera/snapshot', {
      image: dataUrl,
      reason,
      telemetry
    }).catch(err => console.log('Backend snapshot sync notice:', err));

    this.renderEvidenceGallery();

    if (reason === 'auto_collision') {
      Toast.error('🚨 Impact auto-captured! Photographic black box evidence archived.');
    } else {
      Toast.success('📸 Dashcam frame snapshot captured with telemetry stamp!');
    }

    return snapshotItem;
  }

  checkAutoCollisionCapture(telemetry) {
    if (!telemetry) return;
    const isAccident = telemetry.mode === 'accident' || (telemetry.accident_probability || 0) > 0.70;
    const now = Date.now();
    // 15 second cooldown between automatic snapshots
    if (isAccident && (now - this.lastAutoSnapshotTime > 15000)) {
      this.lastAutoSnapshotTime = now;
      this.captureSnapshot('auto_collision');
    }
  }

  renderEvidenceGallery() {
    const container = document.getElementById('cameraEvidenceGrid');
    const countBadge = document.getElementById('evidenceCountBadge');
    if (countBadge) countBadge.textContent = `${this.evidenceLog.length} Records`;
    if (!container) return;

    if (this.evidenceLog.length === 0) {
      container.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--text-muted);font-size:0.85rem">
          <i class="fas fa-camera" style="font-size:2rem;margin-bottom:0.5rem;opacity:0.3;display:block"></i>
          No incident snapshots recorded yet. Capture manually or simulate a collision to archive frames.
        </div>`;
      return;
    }

    container.innerHTML = this.evidenceLog.map(snap => `
      <div class="evidence-card ${snap.reason === 'auto_collision' ? 'collision-snap' : ''}">
        <div class="evidence-thumb-wrap" onclick="CameraApp.openSnapshotModal('${snap.id}')">
          <img src="${snap.dataUrl}" alt="Dashcam snapshot" class="evidence-thumb" />
          <span class="evidence-tag ${snap.reason === 'auto_collision' ? 'tag-alert' : 'tag-manual'}">
            ${snap.reason === 'auto_collision' ? '🚨 CRASH DETECTED' : '📸 MANUAL SNAP'}
          </span>
        </div>
        <div class="evidence-body">
          <div class="evidence-meta">
            <span><i class="fas fa-clock"></i> ${new Date(snap.timestamp).toLocaleTimeString()}</span>
            <span><i class="fas fa-tachometer-alt"></i> ${snap.speed.toFixed(1)} km/h</span>
          </div>
          <div class="evidence-meta" style="margin-top:4px">
            <span><i class="fas fa-bolt"></i> ${snap.impact.toFixed(1)}G</span>
            <span><i class="fas fa-map-marker-alt"></i> ${snap.gps}</span>
          </div>
          <div class="evidence-actions">
            <button class="btn btn-secondary btn-sm" onclick="CameraApp.openSnapshotModal('${snap.id}')">
              <i class="fas fa-expand"></i> View
            </button>
            <a href="${snap.dataUrl}" download="blackbox_${snap.id}.jpg" class="btn btn-primary btn-sm">
              <i class="fas fa-download"></i> Save
            </a>
          </div>
        </div>
      </div>
    `).join('');
  }

  openSnapshotModal(id) {
    const snap = this.evidenceLog.find(s => s.id === id);
    if (!snap) return;

    const modal = document.getElementById('snapshotModal');
    const modalImg = document.getElementById('modalSnapImage');
    const modalDetails = document.getElementById('modalSnapDetails');
    const downloadBtn = document.getElementById('modalSnapDownload');

    if (modalImg) modalImg.src = snap.dataUrl;
    if (downloadBtn) {
      downloadBtn.href = snap.dataUrl;
      downloadBtn.download = `blackbox_incident_${snap.id}.jpg`;
    }
    if (modalDetails) {
      modalDetails.innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><div class="detail-label">Timestamp</div><div class="detail-value">${snap.timestamp}</div></div>
          <div class="detail-item"><div class="detail-label">Capture Event</div><div class="detail-value">${snap.reason}</div></div>
          <div class="detail-item"><div class="detail-label">Vehicle Speed</div><div class="detail-value">${snap.speed.toFixed(1)} km/h</div></div>
          <div class="detail-item"><div class="detail-label">Impact Force</div><div class="detail-value">${snap.impact.toFixed(2)} G</div></div>
          <div class="detail-item"><div class="detail-label">Accident Probability</div><div class="detail-value">${(snap.prob * 100).toFixed(1)}%</div></div>
          <div class="detail-item"><div class="detail-label">GPS Coordinate</div><div class="detail-value">${snap.gps}</div></div>
        </div>
      `;
    }
    if (modal) modal.style.display = 'flex';
  }

  toggleFullscreen() {
    const container = document.getElementById('dashcamViewportContainer');
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => Toast.warning(`Fullscreen failed: ${err.message}`));
    } else {
      document.exitFullscreen();
    }
  }
}

// Global Camera Instance
window.CameraApp = new BlackBoxCamera();
