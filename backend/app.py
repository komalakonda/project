"""
app.py - Main Flask API server for AI-Powered Car Black Box System
"""
import sys
import os
# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass
import json
import threading
import time
from datetime import datetime
from flask import Flask, jsonify, request, send_file, send_from_directory
from flask_cors import CORS
import pandas as pd
import numpy as np

import base64
from database import init_db, SessionLocal, SensorReading, AccidentEvent, MLMetrics
from sensor_simulator import (start_simulation, stop_simulation,
                               get_current_reading, is_running, get_mode, set_mode)
from ml_model import predict, train_models, get_metrics, load_dataset, FEATURES
from report_generator import generate_accident_report

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')
MODELS_DIR = os.path.join(BASE_DIR, '..', 'models')
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'frontend')
DATASET_PATH = os.path.join(DATA_DIR, 'car_black_box_dataset.xlsx')

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
CORS(app)

# Background thread: save sensor readings & detect accidents
_accident_cooldown = 0  # seconds since last accident saved


def _background_monitor():
    global _accident_cooldown
    while True:
        time.sleep(1)
        if not is_running():
            continue
        reading = get_current_reading()
        if not reading:
            continue

        # Run ML prediction
        result = predict(reading)
        if 'error' in result:
            continue

        reading['accident_probability'] = result['accident_probability']
        reading['driver_risk_score'] = result['driver_risk_score']

        # Save sensor reading
        db = SessionLocal()
        try:
            sr = SensorReading(
                speed=reading.get('speed', 0),
                accel_x=reading.get('accel_x', 0),
                accel_y=reading.get('accel_y', 0),
                accel_z=reading.get('accel_z', 0),
                gps_lat=reading.get('gps_lat', 0),
                gps_lon=reading.get('gps_lon', 0),
                alcohol_level=reading.get('alcohol_level', 0),
                drowsiness_score=reading.get('drowsiness_score', 0),
                obstacle_distance=reading.get('obstacle_distance', 0),
                impact_force=reading.get('impact_force', 0),
                sos_triggered=reading.get('sos_triggered', False),
                camera_active=reading.get('camera_active', True),
                audio_level=reading.get('audio_level', 0),
                relay_status=reading.get('relay_status', 'ON'),
                accident_probability=result['accident_probability'],
                driver_risk_score=result['driver_risk_score'],
            )
            db.add(sr)
            db.commit()

            # Auto-save accident if detected and cooldown passed
            _accident_cooldown -= 1
            if result['is_accident'] and _accident_cooldown <= 0:
                _accident_cooldown = 30  # 30s cooldown
                ev = AccidentEvent(
                    speed=reading.get('speed', 0),
                    accel_x=reading.get('accel_x', 0),
                    accel_y=reading.get('accel_y', 0),
                    accel_z=reading.get('accel_z', 0),
                    gps_lat=reading.get('gps_lat', 0),
                    gps_lon=reading.get('gps_lon', 0),
                    alcohol_level=reading.get('alcohol_level', 0),
                    drowsiness_score=reading.get('drowsiness_score', 0),
                    obstacle_distance=reading.get('obstacle_distance', 0),
                    impact_force=reading.get('impact_force', 0),
                    sos_triggered=reading.get('sos_triggered', False),
                    accident_probability=result['accident_probability'],
                    severity=result['severity'],
                    possible_cause=result['possible_cause'],
                    driver_risk_score=result['driver_risk_score'],
                    ai_analysis=result['ai_analysis'],
                    emergency_alerted=True,
                )
                db.add(ev)
                db.commit()
        except Exception as e:
            db.rollback()
            print(f"DB error: {e}")
        finally:
            db.close()


# =====================================================================
# ROUTES — Static Frontend
# =====================================================================
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


# =====================================================================
# SIMULATION CONTROL
# =====================================================================
@app.route('/api/simulation/start', methods=['POST'])
def api_start():
    if is_running():
        return jsonify({'status': 'already_running', 'message': 'Simulation already running'})
    started = start_simulation()
    return jsonify({'status': 'started' if started else 'error',
                    'message': 'Simulation started' if started else 'Failed to start'})


@app.route('/api/simulation/stop', methods=['POST'])
def api_stop():
    stop_simulation()
    return jsonify({'status': 'stopped', 'message': 'Simulation stopped'})


@app.route('/api/simulation/status', methods=['GET'])
def api_status():
    return jsonify({'running': is_running(), 'mode': get_mode() if is_running() else 'idle'})


@app.route('/api/simulation/mode', methods=['POST'])
def api_set_mode():
    data = request.get_json() or {}
    mode = data.get('mode', 'normal')
    success = set_mode(mode)
    return jsonify({'status': 'ok' if success else 'error', 'mode': get_mode()})


# =====================================================================
# CAMERA SNAPSHOTS
# =====================================================================
SNAPSHOTS_DIR = os.path.join(BASE_DIR, '..', 'reports', 'snapshots')
os.makedirs(SNAPSHOTS_DIR, exist_ok=True)


@app.route('/api/camera/snapshot', methods=['POST'])
def api_save_snapshot():
    try:
        data = request.get_json() or {}
        image_data = data.get('image', '')
        reason = data.get('reason', 'manual')
        telemetry = data.get('telemetry', {})
        if not image_data:
            return jsonify({'error': 'No image data provided'}), 400

        if ',' in image_data:
            image_data = image_data.split(',', 1)[1]

        filename = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{reason}.jpg"
        filepath = os.path.join(SNAPSHOTS_DIR, filename)

        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(image_data))

        return jsonify({
            'status': 'saved',
            'filename': filename,
            'url': f'/reports/snapshots/{filename}',
            'timestamp': datetime.utcnow().isoformat(),
            'reason': reason
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/reports/snapshots/<path:filename>')
def serve_snapshot(filename):
    return send_from_directory(SNAPSHOTS_DIR, filename)


# =====================================================================
# LIVE SENSORS
# =====================================================================
@app.route('/api/sensors/live', methods=['GET'])
def api_live_sensors():
    if not is_running():
        return jsonify({'running': False, 'data': {}})
    reading = get_current_reading()
    if not reading:
        return jsonify({'running': True, 'data': {}})
    result = predict(reading)
    return jsonify({
        'running': True,
        'data': {**reading, **result}
    })


@app.route('/api/sensors/history', methods=['GET'])
def api_sensor_history():
    limit = int(request.args.get('limit', 60))
    db = SessionLocal()
    try:
        rows = db.query(SensorReading).order_by(SensorReading.id.desc()).limit(limit).all()
        data = []
        for r in reversed(rows):
            data.append({
                'id': r.id,
                'timestamp': r.timestamp.isoformat(),
                'speed': r.speed, 'accel_x': r.accel_x, 'accel_y': r.accel_y,
                'accel_z': r.accel_z, 'alcohol_level': r.alcohol_level,
                'drowsiness_score': r.drowsiness_score,
                'obstacle_distance': r.obstacle_distance,
                'impact_force': r.impact_force,
                'accident_probability': r.accident_probability,
                'driver_risk_score': r.driver_risk_score,
            })
        return jsonify({'count': len(data), 'data': data})
    finally:
        db.close()


# =====================================================================
# ACCIDENTS
# =====================================================================
@app.route('/api/accidents', methods=['GET'])
def api_accidents():
    limit = int(request.args.get('limit', 50))
    severity = request.args.get('severity', None)
    db = SessionLocal()
    try:
        q = db.query(AccidentEvent).order_by(AccidentEvent.id.desc())
        if severity:
            q = q.filter(AccidentEvent.severity == severity)
        rows = q.limit(limit).all()
        data = [_accident_to_dict(r) for r in rows]
        return jsonify({'count': len(data), 'accidents': data})
    finally:
        db.close()


@app.route('/api/accidents/<int:acc_id>', methods=['GET'])
def api_accident_detail(acc_id):
    db = SessionLocal()
    try:
        row = db.query(AccidentEvent).filter(AccidentEvent.id == acc_id).first()
        if not row:
            return jsonify({'error': 'Not found'}), 404
        return jsonify(_accident_to_dict(row))
    finally:
        db.close()


@app.route('/api/accidents/clear', methods=['POST'])
def api_clear_accidents():
    db = SessionLocal()
    try:
        count = db.query(AccidentEvent).count()
        db.query(AccidentEvent).delete()
        db.commit()
        return jsonify({'status': 'ok', 'deleted': count})
    except Exception as e:
        db.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


def _accident_to_dict(r):
    return {
        'id': r.id,
        'timestamp': r.timestamp.isoformat() if r.timestamp else None,
        'speed': r.speed, 'accel_x': r.accel_x, 'accel_y': r.accel_y,
        'accel_z': r.accel_z, 'gps_lat': r.gps_lat, 'gps_lon': r.gps_lon,
        'alcohol_level': r.alcohol_level, 'drowsiness_score': r.drowsiness_score,
        'obstacle_distance': r.obstacle_distance, 'impact_force': r.impact_force,
        'sos_triggered': r.sos_triggered,
        'accident_probability': r.accident_probability,
        'severity': r.severity, 'possible_cause': r.possible_cause,
        'driver_risk_score': r.driver_risk_score, 'ai_analysis': r.ai_analysis,
        'emergency_alerted': r.emergency_alerted,
    }


# =====================================================================
# ML — PREDICT & TRAIN & METRICS
# =====================================================================
@app.route('/api/predict', methods=['POST'])
def api_predict():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    result = predict(data)
    return jsonify(result)


@app.route('/api/ml/train', methods=['POST'])
def api_train():
    try:
        dataset_path = DATASET_PATH
        df = load_dataset(dataset_path)
        metrics = train_models(df)
        # Save to DB
        db = SessionLocal()
        try:
            m = MLMetrics(accuracy=metrics['accuracy'], precision=metrics['precision'],
                          recall=metrics['recall'], f1_score=metrics['f1_score'],
                          dataset_size=metrics['dataset_size'],
                          model_version=metrics['model_version'])
            db.add(m)
            db.commit()
        finally:
            db.close()
        return jsonify({'status': 'success', 'metrics': metrics})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/ml/metrics', methods=['GET'])
def api_metrics():
    metrics = get_metrics()
    if not metrics:
        return jsonify({'error': 'Model not trained yet'}), 404
    # Convert numpy types
    return jsonify({k: (v.tolist() if hasattr(v, 'tolist') else v)
                    for k, v in metrics.items()})


# =====================================================================
# ANALYTICS
# =====================================================================
@app.route('/api/analytics', methods=['GET'])
def api_analytics():
    db = SessionLocal()
    try:
        accidents = db.query(AccidentEvent).all()
        readings = db.query(SensorReading).order_by(SensorReading.id.desc()).limit(500).all()

        severity_counts = {'Minor': 0, 'Moderate': 0, 'Severe': 0, 'Critical': 0, 'None': 0}
        cause_counts = {}
        for a in accidents:
            sev = a.severity or 'None'
            severity_counts[sev] = severity_counts.get(sev, 0) + 1
            for c in (a.possible_cause or '').split(','):
                c = c.strip()
                if c:
                    cause_counts[c] = cause_counts.get(c, 0) + 1

        speeds = [r.speed for r in readings if r.speed]
        alcohols = [r.alcohol_level for r in readings if r.alcohol_level is not None]
        probs = [r.accident_probability for r in readings if r.accident_probability is not None]

        # Timeline: accidents per day
        timeline = {}
        for a in accidents:
            day = a.timestamp.strftime('%Y-%m-%d') if a.timestamp else 'Unknown'
            timeline[day] = timeline.get(day, 0) + 1

        return jsonify({
            'total_accidents': len(accidents),
            'total_readings': db.query(SensorReading).count(),
            'severity_distribution': severity_counts,
            'cause_distribution': cause_counts,
            'speed_stats': {
                'mean': round(float(np.mean(speeds)), 2) if speeds else 0,
                'max': round(float(np.max(speeds)), 2) if speeds else 0,
                'min': round(float(np.min(speeds)), 2) if speeds else 0,
            },
            'alcohol_stats': {
                'mean': round(float(np.mean(alcohols)), 4) if alcohols else 0,
                'max': round(float(np.max(alcohols)), 4) if alcohols else 0,
            },
            'avg_accident_probability': round(float(np.mean(probs)), 4) if probs else 0,
            'accident_timeline': dict(sorted(timeline.items())[-30:]),  # last 30 days
        })
    finally:
        db.close()


# =====================================================================
# DATASET MANAGEMENT
# =====================================================================
@app.route('/api/dataset/upload', methods=['POST'])
def api_upload_dataset():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ['.xlsx', '.csv']:
        return jsonify({'error': 'Only .xlsx and .csv files are supported'}), 400

    os.makedirs(DATA_DIR, exist_ok=True)
    dest = os.path.join(DATA_DIR, 'car_black_box_dataset' + ext)
    f.save(dest)

    # Validate
    try:
        df = pd.read_excel(dest) if ext == '.xlsx' else pd.read_csv(dest)
        required = ['speed', 'accel_x', 'alcohol_level', 'drowsiness_score',
                    'accident_status']
        missing = [c for c in required if c not in df.columns]
        if missing:
            return jsonify({'error': f'Missing columns: {missing}', 'columns': list(df.columns)}), 400

        preview = df.head(10).fillna('').to_dict(orient='records')
        return jsonify({
            'status': 'success',
            'rows': len(df),
            'columns': list(df.columns),
            'preview': preview,
            'accident_rate': round(df['accident_status'].mean() * 100, 2)
        })
    except Exception as e:
        return jsonify({'error': f'Parse error: {str(e)}'}), 400


@app.route('/api/dataset/preview', methods=['GET'])
def api_dataset_preview():
    if not os.path.exists(DATASET_PATH):
        return jsonify({'error': 'Dataset not found'}), 404
    df = pd.read_excel(DATASET_PATH)
    preview = df.head(20).fillna('').to_dict(orient='records')
    stats = {
        'rows': len(df), 'columns': list(df.columns),
        'accident_rate': round(df['accident_status'].mean() * 100, 2) if 'accident_status' in df.columns else 0,
        'severity_dist': df['severity'].value_counts().to_dict() if 'severity' in df.columns else {},
    }
    return jsonify({'stats': stats, 'preview': preview})


@app.route('/api/dataset/download', methods=['GET'])
def api_download_dataset():
    if not os.path.exists(DATASET_PATH):
        return jsonify({'error': 'Dataset not found'}), 404
    return send_file(DATASET_PATH, as_attachment=True,
                     download_name='car_black_box_dataset.xlsx')


# =====================================================================
# PDF REPORT
# =====================================================================
@app.route('/api/report/<int:acc_id>/pdf', methods=['GET'])
def api_get_pdf(acc_id):
    db = SessionLocal()
    try:
        row = db.query(AccidentEvent).filter(AccidentEvent.id == acc_id).first()
        if not row:
            return jsonify({'error': 'Accident not found'}), 404
        accident = _accident_to_dict(row)
        filepath = generate_accident_report(accident)
        return send_file(filepath, as_attachment=True,
                         download_name=os.path.basename(filepath),
                         mimetype='application/pdf')
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# =====================================================================
# SYSTEM INFO
# =====================================================================
@app.route('/api/system/info', methods=['GET'])
def api_system_info():
    return jsonify({
        'name': 'AI-Powered Car Black Box System',
        'version': '1.0.0',
        'dataset_exists': os.path.exists(DATASET_PATH),
        'model_trained': os.path.exists(os.path.join(MODELS_DIR, 'accident_model.pkl')),
        'simulation_running': is_running(),
        'simulation_mode': get_mode() if is_running() else 'idle',
    })


# =====================================================================
# STARTUP
# =====================================================================
def startup():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, '..', 'reports'), exist_ok=True)
    init_db()

    # Generate dataset if missing
    if not os.path.exists(DATASET_PATH):
        print("📦 Generating dataset...")
        from dataset_generator import generate_dataset
        generate_dataset()

    # Train model if not trained
    model_path = os.path.join(MODELS_DIR, 'accident_model.pkl')
    if not os.path.exists(model_path):
        print("🤖 Training ML model...")
        try:
            df = load_dataset(DATASET_PATH)
            train_models(df)
        except Exception as e:
            print(f"⚠ Model training failed: {e}")

    # Start background monitor
    t = threading.Thread(target=_background_monitor, daemon=True)
    t.start()
    print("✅ Background monitor started.")


if __name__ == '__main__':
    startup()
    print("🚀 Starting AI Car Black Box server on http://localhost:5000")
    app.run(debug=False, port=5000, use_reloader=False)
