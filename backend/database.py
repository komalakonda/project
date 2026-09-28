"""
database.py - SQLite database models and ORM layer using SQLAlchemy
"""
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, '..', 'data', 'car_blackbox.db')

engine = create_engine(f'sqlite:///{DB_PATH}', echo=False)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)


class SensorReading(Base):
    __tablename__ = 'sensor_readings'
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    speed = Column(Float)
    accel_x = Column(Float)
    accel_y = Column(Float)
    accel_z = Column(Float)
    gps_lat = Column(Float)
    gps_lon = Column(Float)
    alcohol_level = Column(Float)
    drowsiness_score = Column(Float)
    obstacle_distance = Column(Float)
    impact_force = Column(Float)
    sos_triggered = Column(Boolean, default=False)
    camera_active = Column(Boolean, default=True)
    audio_level = Column(Float)
    relay_status = Column(String(20), default='ON')
    accident_probability = Column(Float, default=0.0)
    driver_risk_score = Column(Float, default=0.0)


class AccidentEvent(Base):
    __tablename__ = 'accident_events'
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    speed = Column(Float)
    accel_x = Column(Float)
    accel_y = Column(Float)
    accel_z = Column(Float)
    gps_lat = Column(Float)
    gps_lon = Column(Float)
    alcohol_level = Column(Float)
    drowsiness_score = Column(Float)
    obstacle_distance = Column(Float)
    impact_force = Column(Float)
    sos_triggered = Column(Boolean)
    accident_probability = Column(Float)
    severity = Column(String(20))  # Minor/Moderate/Severe/Critical
    possible_cause = Column(String(100))
    driver_risk_score = Column(Float)
    ai_analysis = Column(Text)
    emergency_alerted = Column(Boolean, default=True)
    location_address = Column(String(200), default='Unknown Location')
    report_path = Column(String(300), nullable=True)


class MLMetrics(Base):
    __tablename__ = 'ml_metrics'
    id = Column(Integer, primary_key=True, autoincrement=True)
    trained_at = Column(DateTime, default=datetime.utcnow)
    accuracy = Column(Float)
    precision = Column(Float)
    recall = Column(Float)
    f1_score = Column(Float)
    dataset_size = Column(Integer)
    model_version = Column(String(50))


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    Base.metadata.create_all(engine)
    print("✅ Database initialized successfully.")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == '__main__':
    init_db()
