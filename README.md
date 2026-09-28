# 🚗 AI-Powered Car Black Box System for Accident Analysis

A complete software simulation of an IoT Car Black Box system with real-time accident detection, AI-powered analysis, and a premium web dashboard.

> ⚠️ **Disclaimer**: This is a **software simulation** of an IoT car black box, not a certified real-world vehicle safety system.

---

## 📋 Features

| Feature | Description |
|---|---|
| 🔴 **Live Sensor Monitoring** | 10 simulated IoT sensors updating in real-time |
| 🚨 **Accident Detection** | ML-powered accident probability prediction |
| 📊 **Severity Classification** | Minor / Moderate / Severe / Critical |
| 🧠 **AI Analysis** | Natural language accident cause analysis |
| 🛡️ **Driver Risk Score** | 0-100 safety scoring |
| 📈 **Analytics Charts** | 6+ Chart.js visualizations |
| 📜 **Accident History** | SQLite-stored event log with filters |
| 📄 **PDF Reports** | Professional PDF report generation |
| 📂 **Dataset Management** | Upload, preview, validate Excel/CSV datasets |
| 🤖 **ML Model Training** | RandomForest with accuracy/precision/recall/F1 |

---

## 🏗️ Project Structure

```
car_black_box_using_AI/
├── backend/
│   ├── app.py                  # Flask API server (20+ endpoints)
│   ├── database.py             # SQLite models (SQLAlchemy)
│   ├── sensor_simulator.py     # IoT sensor simulation engine
│   ├── ml_model.py             # RandomForest ML model
│   ├── dataset_generator.py    # 1000-record Excel dataset generator
│   ├── report_generator.py     # ReportLab PDF generator
│   └── requirements.txt
├── frontend/
│   ├── index.html              # Single-page dashboard (7 sections)
│   ├── css/styles.css          # Premium dark theme CSS
│   └── js/
│       ├── api.js              # Backend API communication
│       ├── charts.js           # Chart.js definitions
│       └── dashboard.js        # UI controller & live polling
├── data/
│   ├── car_black_box_dataset.xlsx  # 1000-record training dataset
│   └── car_blackbox.db             # SQLite database (auto-created)
├── models/                     # Trained ML model files (.pkl)
├── reports/                    # Generated PDF reports
└── README.md
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Python 3.9+
- pip

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the Backend Server
```bash
cd backend
python app.py
```

The server will automatically:
- Initialize the SQLite database
- Generate the 1000-record Excel dataset
- Train the RandomForest ML model
- Start listening on `http://localhost:5000`

### 3. Open the Frontend
Open `frontend/index.html` in your browser, **or** access it via:
```
http://localhost:5000
```

---

## 🤖 Simulated IoT Sensors

| Sensor | Type | Key Metric |
|---|---|---|
| ADXL345 | Accelerometer | X/Y/Z acceleration (g) |
| GPS Module | Location | Latitude, Longitude |
| GSM Module | Connectivity | Signal strength (%) |
| MQ-3 | Alcohol | BAC level (0.0–0.4) |
| Eye-Blink | Drowsiness | Score (0.0–1.0) |
| Ultrasonic | Obstacle | Distance (meters) |
| SOS Button | Emergency | Triggered / Safe |
| Camera | Visual | Active / Offline |
| Microphone | Audio | Level (dB) |
| Relay/Motor | Control | ON / OFF |

---

## 📊 ML Model Details

- **Algorithm**: RandomForestClassifier (100 estimators)
- **Tasks**: Binary accident classification + severity (4-class) + risk regression
- **Train/Test Split**: 80/20 with stratification
- **Features**: speed, accel_x/y/z, alcohol_level, drowsiness_score, obstacle_distance, impact_force, audio_level, sos_triggered

### Dataset Schema (1000 records)
| Column | Type | Description |
|---|---|---|
| speed | float | Vehicle speed (km/h) |
| accel_x/y/z | float | ADXL345 readings (g) |
| impact_force | float | Derived from accel + speed |
| alcohol_level | float | BAC 0.0–0.4 |
| drowsiness_score | float | Eye-blink metric 0–1 |
| obstacle_distance | float | Ultrasonic distance (m) |
| sos_triggered | int | 0/1 |
| accident_status | int | 0=No, 1=Yes |
| severity | str | None/Minor/Moderate/Severe/Critical |
| possible_cause | str | Text description |
| driver_risk_score | float | 0–100 |

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/simulation/start` | Start sensor simulation |
| POST | `/api/simulation/stop` | Stop simulation |
| GET | `/api/sensors/live` | Current sensor readings + ML predictions |
| GET | `/api/sensors/history` | Historical sensor log |
| GET | `/api/accidents` | Accident history (filterable) |
| GET | `/api/accidents/<id>` | Single accident detail |
| POST | `/api/accidents/clear` | Clear accident history |
| POST | `/api/predict` | Run ML prediction on custom data |
| POST | `/api/ml/train` | Train/retrain ML model |
| GET | `/api/ml/metrics` | Model performance metrics |
| GET | `/api/analytics` | Aggregated statistics |
| POST | `/api/dataset/upload` | Upload Excel/CSV dataset |
| GET | `/api/dataset/preview` | Dataset preview |
| GET | `/api/dataset/download` | Download dataset |
| GET | `/api/report/<id>/pdf` | Generate PDF report |
| GET | `/api/system/info` | System status |

---

## 🎨 Dashboard Pages

1. **Dashboard** — Overview with probability meter, risk gauge, AI analysis
2. **Sensors** — All 10 sensor cards with live values and status bars
3. **Detection** — Accident probability, severity, cause analysis
4. **History** — Filterable accident event table with PDF export
5. **Analytics** — 6 Chart.js charts (severity, causes, timeline, speed, radar)
6. **Dataset** — Upload, generate, preview, download dataset
7. **ML Model** — Train model, view metrics, feature importance

---

## 📝 License
This project is for educational and demonstration purposes only.
