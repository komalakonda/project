"""
ml_model.py - Machine Learning model for accident prediction, severity classification,
and driver risk scoring. Uses RandomForest with train/test split and full metrics.
"""
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, classification_report, confusion_matrix)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, '..', 'models')
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')
DATASET_PATH = os.path.join(DATA_DIR, 'car_black_box_dataset.xlsx')
ACCIDENT_MODEL_PATH = os.path.join(MODEL_DIR, 'accident_model.pkl')
SEVERITY_MODEL_PATH = os.path.join(MODEL_DIR, 'severity_model.pkl')
RISK_MODEL_PATH = os.path.join(MODEL_DIR, 'risk_model.pkl')
LABEL_ENCODER_PATH = os.path.join(MODEL_DIR, 'label_encoder.pkl')
METRICS_PATH = os.path.join(MODEL_DIR, 'metrics.pkl')

FEATURES = ['speed', 'accel_x', 'accel_y', 'accel_z', 'alcohol_level',
            'drowsiness_score', 'obstacle_distance', 'impact_force',
            'audio_level', 'sos_triggered']


def load_dataset(path=DATASET_PATH):
    df = pd.read_excel(path)
    return df


def train_models(df=None):
    os.makedirs(MODEL_DIR, exist_ok=True)
    if df is None:
        df = load_dataset()

    X = df[FEATURES].fillna(0)
    y_accident = df['accident_status'].astype(int)
    y_severity = df['severity'].fillna('None')
    y_risk = df['driver_risk_score'].fillna(0)

    # Encode severity
    le = LabelEncoder()
    severity_order = ['None', 'Minor', 'Moderate', 'Severe', 'Critical']
    le.fit(severity_order)
    y_severity_enc = le.transform(y_severity)

    # --- Train/Test Split ---
    X_train, X_test, ya_train, ya_test = train_test_split(
        X, y_accident, test_size=0.2, random_state=42, stratify=y_accident)
    _, _, ys_train, ys_test = train_test_split(
        X, y_severity_enc, test_size=0.2, random_state=42)
    _, _, yr_train, yr_test = train_test_split(
        X, y_risk, test_size=0.2, random_state=42)

    # --- Accident Classifier ---
    acc_model = RandomForestClassifier(n_estimators=100, max_depth=10,
                                       random_state=42, class_weight='balanced')
    acc_model.fit(X_train, ya_train)
    ya_pred = acc_model.predict(X_test)

    # --- Severity Classifier ---
    sev_model = RandomForestClassifier(n_estimators=100, max_depth=10,
                                        random_state=42, class_weight='balanced')
    sev_model.fit(X_train, ys_train)

    # --- Risk Regressor ---
    risk_model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    risk_model.fit(X_train, yr_train)

    # --- Metrics ---
    metrics = {
        'accuracy': round(accuracy_score(ya_test, ya_pred), 4),
        'precision': round(precision_score(ya_test, ya_pred, zero_division=0), 4),
        'recall': round(recall_score(ya_test, ya_pred, zero_division=0), 4),
        'f1_score': round(f1_score(ya_test, ya_pred, zero_division=0), 4),
        'confusion_matrix': confusion_matrix(ya_test, ya_pred).tolist(),
        'classification_report': classification_report(ya_test, ya_pred, output_dict=True),
        'feature_importance': dict(zip(FEATURES, acc_model.feature_importances_.tolist())),
        'dataset_size': len(df),
        'model_version': 'RandomForest-v1.0'
    }

    print("=" * 50)
    print("📊 ML MODEL TRAINING RESULTS")
    print("=" * 50)
    print(f"  Accuracy:  {metrics['accuracy'] * 100:.2f}%")
    print(f"  Precision: {metrics['precision'] * 100:.2f}%")
    print(f"  Recall:    {metrics['recall'] * 100:.2f}%")
    print(f"  F1-Score:  {metrics['f1_score'] * 100:.2f}%")
    print(f"  Dataset:   {metrics['dataset_size']} records")
    print("=" * 50)

    # Save models
    joblib.dump(acc_model, ACCIDENT_MODEL_PATH)
    joblib.dump(sev_model, SEVERITY_MODEL_PATH)
    joblib.dump(risk_model, RISK_MODEL_PATH)
    joblib.dump(le, LABEL_ENCODER_PATH)
    joblib.dump(metrics, METRICS_PATH)
    print("✅ Models saved successfully.")
    return metrics


def predict(sensor_data: dict):
    """Run prediction on a single sensor reading dictionary."""
    try:
        acc_model = joblib.load(ACCIDENT_MODEL_PATH)
        sev_model = joblib.load(SEVERITY_MODEL_PATH)
        risk_model = joblib.load(RISK_MODEL_PATH)
        le = joblib.load(LABEL_ENCODER_PATH)
    except FileNotFoundError:
        return {'error': 'Model not trained yet. Please train the model first.'}

    row = pd.DataFrame([[sensor_data.get(f, 0) for f in FEATURES]], columns=FEATURES)
    acc_prob = acc_model.predict_proba(row)[0][1]
    sev_enc = sev_model.predict(row)[0]
    severity = le.inverse_transform([sev_enc])[0]
    risk_score = float(np.clip(risk_model.predict(row)[0], 0, 100))

    # Determine possible cause from sensor data
    causes = []
    if sensor_data.get('alcohol_level', 0) > 0.08:
        causes.append('Drunk Driving')
    if sensor_data.get('drowsiness_score', 0) > 0.6:
        causes.append('Driver Fatigue/Drowsiness')
    if sensor_data.get('obstacle_distance', 100) < 10 and acc_prob > 0.5:
        causes.append('Collision with Obstacle')
    if sensor_data.get('speed', 0) > 100:
        causes.append('Overspeeding')
    if sensor_data.get('impact_force', 0) > 10:
        causes.append('High Impact Force')
    if not causes and acc_prob > 0.5:
        causes.append('Sudden Impact')
    if not causes:
        causes.append('Normal Driving')
    possible_cause = ', '.join(causes)

    # AI Analysis text
    ai_analysis = _generate_ai_analysis(sensor_data, acc_prob, severity, possible_cause, risk_score)

    return {
        'accident_probability': round(float(acc_prob), 4),
        'is_accident': bool(acc_prob > 0.5),
        'severity': severity,
        'possible_cause': possible_cause,
        'driver_risk_score': round(risk_score, 2),
        'ai_analysis': ai_analysis
    }


def _generate_ai_analysis(data, prob, severity, cause, risk):
    lines = []
    speed = data.get('speed', 0)
    alcohol = data.get('alcohol_level', 0)
    drowsiness = data.get('drowsiness_score', 0)
    distance = data.get('obstacle_distance', 100)
    impact = data.get('impact_force', 0)

    lines.append(f"AI Analysis — Accident Probability: {prob*100:.1f}%")
    lines.append(f"Severity Assessment: {severity}")
    lines.append(f"Primary Cause: {cause}")
    lines.append(f"Driver Risk Score: {risk:.1f}/100")
    lines.append("")

    if speed > 120:
        lines.append(f"⚠ Vehicle speed ({speed:.1f} km/h) is critically high — exceeds safe limits.")
    elif speed > 80:
        lines.append(f"⚠ Vehicle speed ({speed:.1f} km/h) is elevated — caution advised.")

    if alcohol > 0.08:
        lines.append(f"🚨 Alcohol level ({alcohol:.3f} BAC) exceeds legal limit of 0.08.")
    if drowsiness > 0.6:
        lines.append(f"😴 High drowsiness detected ({drowsiness:.2f}) — driver fatigue is critical.")
    if distance < 10:
        lines.append(f"📡 Obstacle at {distance:.1f}m — collision zone detected.")
    if impact > 10:
        lines.append(f"💥 Impact force {impact:.2f}g detected — structural impact confirmed.")

    if prob < 0.2:
        lines.append("✅ Vehicle operating within safe parameters.")
    elif prob < 0.5:
        lines.append("⚠ Elevated risk detected — driver should exercise caution.")
    else:
        lines.append("🚨 ACCIDENT DETECTED — Emergency protocols activated.")

    return '\n'.join(lines)


def get_metrics():
    try:
        return joblib.load(METRICS_PATH)
    except FileNotFoundError:
        return None


if __name__ == '__main__':
    from dataset_generator import generate_dataset
    df = generate_dataset()
    train_models(df)
