"""
sensor_simulator.py - Simulates all IoT sensors for the Car Black Box system.
Sensors: ADXL345, GPS, GSM, MQ-3 (alcohol), Eye-blink (drowsiness),
         Ultrasonic, SOS, Camera, Microphone, Relay/Motor
"""
import numpy as np
import random
import time
import threading
from datetime import datetime

_state = {
    'running': False,
    'mode': 'normal',      # normal | risky | accident
    'mode_timer': 0,
    'current': {},
    'lock': threading.Lock()
}

# GPS center (Mumbai area)
GPS_CENTER = (19.0760, 72.8777)
_gps_path = {'lat': GPS_CENTER[0], 'lon': GPS_CENTER[1], 'heading': 0}


def _next_mode():
    """Randomly transition driving modes."""
    r = random.random()
    if _state['mode'] == 'normal':
        if r < 0.05:
            return 'risky', random.randint(5, 15)
        return 'normal', random.randint(10, 30)
    elif _state['mode'] == 'risky':
        if r < 0.20:
            return 'accident', random.randint(2, 5)
        elif r < 0.50:
            return 'normal', random.randint(10, 25)
        return 'risky', random.randint(5, 15)
    else:  # accident
        return 'normal', random.randint(15, 30)


def _simulate_sensors():
    """Generate one tick of sensor readings based on current mode."""
    mode = _state['mode']
    r = lambda mu, sigma, lo=None, hi=None: float(
        np.clip(np.random.normal(mu, sigma), lo if lo is not None else -999,
                hi if hi is not None else 999))

    # Speed (km/h)
    if mode == 'normal':
        speed = r(45, 12, 5, 95)
    elif mode == 'risky':
        speed = r(100, 20, 60, 160)
    else:
        speed = r(120, 30, 60, 200)

    # ADXL345 Accelerometer (g)
    if mode == 'normal':
        ax, ay, az = r(0, 0.15, -1, 1), r(0, 0.1, -1, 1), r(1.0, 0.05, 0.8, 1.2)
    elif mode == 'risky':
        ax, ay, az = r(0, 0.5, -2, 2), r(0, 0.4, -2, 2), r(1.0, 0.15, 0.5, 1.5)
    else:
        ax = r(0, 0, -1, 1) + random.choice([-1, 1]) * r(5, 2, 2, 12)
        ay = r(0, 0, -1, 1) + random.choice([-1, 1]) * r(3, 1.5, 1, 8)
        az = r(1.0, 1.0, 0, 5)

    impact_force = float(np.clip(np.sqrt(ax**2 + ay**2 + az**2) * speed * 0.05, 0, 50))

    # GPS — simulate movement
    _gps_path['heading'] += random.uniform(-5, 5)
    speed_ms = speed / 3.6 * 0.00001  # rough deg/s
    _gps_path['lat'] += speed_ms * np.cos(np.radians(_gps_path['heading']))
    _gps_path['lon'] += speed_ms * np.sin(np.radians(_gps_path['heading']))
    gps_lat = round(_gps_path['lat'], 6)
    gps_lon = round(_gps_path['lon'], 6)
    gsm_signal = random.randint(60, 100) if mode != 'accident' else random.randint(20, 70)

    # MQ-3 Alcohol Sensor (BAC 0.0 - 0.4)
    if mode == 'normal':
        alcohol = max(0, np.random.exponential(0.005))
    elif mode == 'risky':
        alcohol = max(0, np.random.exponential(0.03))
    else:
        alcohol = float(np.clip(np.random.normal(0.12, 0.05) if random.random() < 0.4
                                else np.random.exponential(0.01), 0, 0.4))

    # Eye-blink / Drowsiness (0-1, higher = more drowsy)
    if mode == 'normal':
        drowsiness = float(np.clip(np.random.beta(1, 8), 0, 1))
    elif mode == 'risky':
        drowsiness = float(np.clip(np.random.beta(2, 4), 0, 1))
    else:
        drowsiness = float(np.clip(np.random.beta(4, 2) if random.random() < 0.35
                                   else np.random.beta(1, 4), 0, 1))

    # Ultrasonic obstacle distance (meters)
    if mode == 'normal':
        obstacle_dist = r(90, 25, 15, 200)
    elif mode == 'risky':
        obstacle_dist = r(30, 12, 5, 80)
    else:
        obstacle_dist = r(4, 3, 0, 15)

    # SOS button
    sos_triggered = bool(mode == 'accident' and random.random() < 0.7)

    # Camera
    camera_active = bool(mode != 'accident' or random.random() < 0.6)

    # Microphone / Audio (dB)
    if mode == 'normal':
        audio_level = r(38, 8, 20, 65)
    elif mode == 'risky':
        audio_level = r(65, 12, 40, 90)
    else:
        audio_level = r(95, 15, 60, 130)

    # Relay/Motor control
    relay_status = 'OFF' if (mode == 'accident' and random.random() < 0.5) else 'ON'

    return {
        'timestamp': datetime.utcnow().isoformat(),
        'mode': mode,
        'speed': round(speed, 2),
        'accel_x': round(ax, 4),
        'accel_y': round(ay, 4),
        'accel_z': round(az, 4),
        'impact_force': round(impact_force, 4),
        'gps_lat': gps_lat,
        'gps_lon': gps_lon,
        'gsm_signal': gsm_signal,
        'alcohol_level': round(float(np.clip(alcohol, 0, 0.4)), 4),
        'drowsiness_score': round(drowsiness, 4),
        'obstacle_distance': round(float(np.clip(obstacle_dist, 0, 200)), 2),
        'sos_triggered': sos_triggered,
        'camera_active': camera_active,
        'audio_level': round(float(np.clip(audio_level, 20, 130)), 2),
        'relay_status': relay_status,
    }


def _simulation_loop(interval=1.0):
    global _state
    mode_time = random.randint(10, 30)
    ticks = 0
    while _state['running']:
        ticks += 1
        if ticks >= mode_time:
            new_mode, mode_time = _next_mode()
            ticks = 0
            with _state['lock']:
                _state['mode'] = new_mode
        reading = _simulate_sensors()
        with _state['lock']:
            _state['current'] = reading
        time.sleep(interval)


def start_simulation():
    global _state
    if _state['running']:
        return False
    _state['running'] = True
    _state['mode'] = 'normal'
    t = threading.Thread(target=_simulation_loop, daemon=True)
    t.start()
    return True


def stop_simulation():
    global _state
    _state['running'] = False
    _state['current'] = {}
    return True


def get_current_reading():
    with _state['lock']:
        return dict(_state['current'])


def is_running():
    return _state['running']


def get_mode():
    return _state['mode']


def set_mode(mode):
    global _state
    if mode in ['normal', 'risky', 'accident']:
        with _state['lock']:
            _state['mode'] = mode
        return True
    return False
