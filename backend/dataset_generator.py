"""
dataset_generator.py - Generates 1000 realistic car black box records with logical sensor correlations
"""
import pandas as pd
import numpy as np
import os

np.random.seed(42)
N = 1000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(BASE_DIR, '..', 'data', 'car_black_box_dataset.xlsx')


def generate_dataset():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    # --- Base distributions ---
    # 70% normal driving, 15% risky, 10% minor accidents, 5% severe accidents
    scenario = np.random.choice(
        ['normal', 'risky', 'minor_accident', 'severe_accident'],
        size=N, p=[0.70, 0.15, 0.10, 0.05]
    )

    records = []
    for i, sc in enumerate(scenario):
        rec = {}

        # ---- Speed (km/h) ----
        if sc == 'normal':
            rec['speed'] = np.clip(np.random.normal(45, 15), 5, 100)
        elif sc == 'risky':
            rec['speed'] = np.clip(np.random.normal(95, 20), 60, 160)
        elif sc == 'minor_accident':
            rec['speed'] = np.clip(np.random.normal(55, 20), 20, 120)
        else:  # severe
            rec['speed'] = np.clip(np.random.normal(120, 25), 80, 200)

        speed = rec['speed']

        # ---- Accelerometer (g) ----
        if sc == 'normal':
            rec['accel_x'] = np.random.normal(0, 0.2)
            rec['accel_y'] = np.random.normal(0, 0.15)
            rec['accel_z'] = np.random.normal(1.0, 0.05)
        elif sc == 'risky':
            rec['accel_x'] = np.random.normal(0, 0.6)
            rec['accel_y'] = np.random.normal(0, 0.5)
            rec['accel_z'] = np.random.normal(1.0, 0.15)
        elif sc == 'minor_accident':
            rec['accel_x'] = np.random.normal(2.5, 1.0)
            rec['accel_y'] = np.random.normal(1.5, 0.8)
            rec['accel_z'] = np.random.normal(1.5, 0.5)
        else:
            rec['accel_x'] = np.random.normal(6.0, 2.0)
            rec['accel_y'] = np.random.normal(4.0, 1.5)
            rec['accel_z'] = np.random.normal(3.0, 1.0)

        # Impact force derived from acceleration magnitude + speed
        mag = np.sqrt(rec['accel_x']**2 + rec['accel_y']**2 + rec['accel_z']**2)
        rec['impact_force'] = np.clip(mag * speed * 0.05 + np.random.normal(0, 0.5), 0, 50)

        # ---- GPS ----
        rec['gps_lat'] = round(np.random.uniform(18.5, 28.5), 6)   # India range
        rec['gps_lon'] = round(np.random.uniform(72.8, 88.3), 6)

        # ---- Alcohol (BAC 0.0-0.4) ----
        if sc == 'normal':
            rec['alcohol_level'] = np.clip(np.random.exponential(0.01), 0, 0.05)
        elif sc == 'risky':
            rec['alcohol_level'] = np.clip(np.random.exponential(0.04), 0, 0.15)
        else:
            # 40% of accidents involve alcohol
            if np.random.rand() < 0.4:
                rec['alcohol_level'] = np.clip(np.random.normal(0.15, 0.05), 0.08, 0.40)
            else:
                rec['alcohol_level'] = np.clip(np.random.exponential(0.02), 0, 0.07)

        # ---- Drowsiness (0-1) ----
        if sc == 'normal':
            rec['drowsiness_score'] = np.clip(np.random.beta(1, 8), 0, 1)
        elif sc == 'risky':
            rec['drowsiness_score'] = np.clip(np.random.beta(2, 4), 0, 1)
        else:
            # 35% of accidents involve drowsiness
            if np.random.rand() < 0.35:
                rec['drowsiness_score'] = np.clip(np.random.beta(5, 2), 0.5, 1)
            else:
                rec['drowsiness_score'] = np.clip(np.random.beta(1, 5), 0, 0.5)

        # ---- Obstacle Distance (meters, 0=collision) ----
        if sc == 'normal':
            rec['obstacle_distance'] = np.clip(np.random.normal(80, 20), 10, 200)
        elif sc == 'risky':
            rec['obstacle_distance'] = np.clip(np.random.normal(25, 10), 5, 60)
        elif sc == 'minor_accident':
            rec['obstacle_distance'] = np.clip(np.random.normal(5, 3), 0, 15)
        else:
            rec['obstacle_distance'] = np.clip(np.random.exponential(2), 0, 8)

        # ---- SOS ----
        rec['sos_triggered'] = int(sc in ['minor_accident', 'severe_accident'] and np.random.rand() < 0.7)

        # ---- Camera ----
        rec['camera_active'] = int(sc != 'severe_accident' or np.random.rand() < 0.6)

        # ---- Audio Level (dB) ----
        if sc == 'normal':
            rec['audio_level'] = np.random.normal(40, 10)
        elif sc == 'risky':
            rec['audio_level'] = np.random.normal(60, 15)
        else:
            rec['audio_level'] = np.random.normal(90, 20)
        rec['audio_level'] = np.clip(rec['audio_level'], 20, 130)

        # ---- Relay/Motor ----
        rec['relay_status'] = 'OFF' if sc == 'severe_accident' and np.random.rand() < 0.5 else 'ON'

        # ---- Accident Probability (0-1) ----
        prob = 0.0
        prob += min(speed / 200, 0.25)
        prob += min(rec['impact_force'] / 50, 0.30)
        prob += min(rec['alcohol_level'] / 0.4, 0.15)
        prob += rec['drowsiness_score'] * 0.15
        prob += max(0, (20 - rec['obstacle_distance']) / 20) * 0.15
        prob = np.clip(prob + np.random.normal(0, 0.03), 0, 1)
        rec['accident_probability'] = round(prob, 4)

        # ---- Accident Status ----
        if sc == 'normal':
            rec['accident_status'] = 0
        elif sc == 'risky':
            rec['accident_status'] = 0
        elif sc == 'minor_accident':
            rec['accident_status'] = 1
        else:
            rec['accident_status'] = 1

        # ---- Severity ----
        if rec['accident_status'] == 0:
            rec['severity'] = 'None'
        elif prob < 0.4:
            rec['severity'] = 'Minor'
        elif prob < 0.6:
            rec['severity'] = 'Moderate'
        elif prob < 0.8:
            rec['severity'] = 'Severe'
        else:
            rec['severity'] = 'Critical'

        # ---- Possible Cause ----
        causes = []
        if rec['alcohol_level'] > 0.08:
            causes.append('Drunk Driving')
        if rec['drowsiness_score'] > 0.6:
            causes.append('Driver Fatigue/Drowsiness')
        if rec['obstacle_distance'] < 10 and rec['accident_status'] == 1:
            causes.append('Collision with Obstacle')
        if speed > 100:
            causes.append('Overspeeding')
        if rec['impact_force'] > 10:
            causes.append('High Impact Force')
        if not causes and rec['accident_status'] == 1:
            causes.append('Sudden Braking')
        if not causes:
            causes.append('No Incident')
        rec['possible_cause'] = ', '.join(causes)

        # ---- Driver Risk Score (0-100) ----
        risk = 0
        risk += min(speed / 180, 1) * 30
        risk += rec['alcohol_level'] / 0.4 * 25
        risk += rec['drowsiness_score'] * 20
        risk += max(0, (15 - rec['obstacle_distance']) / 15) * 15
        risk += min(rec['impact_force'] / 50, 1) * 10
        rec['driver_risk_score'] = round(np.clip(risk * 100, 0, 100), 2)

        # ---- Timestamp ----
        rec['timestamp'] = pd.Timestamp('2024-01-01') + pd.Timedelta(minutes=i * 5)

        records.append(rec)

    df = pd.DataFrame(records)
    # Round floats
    float_cols = ['speed', 'accel_x', 'accel_y', 'accel_z', 'impact_force',
                  'alcohol_level', 'drowsiness_score', 'obstacle_distance', 'audio_level']
    df[float_cols] = df[float_cols].round(4)

    df.to_excel(OUTPUT_PATH, index=False)
    print(f"✅ Dataset generated: {OUTPUT_PATH} ({len(df)} records)")
    print(f"   Accident rate: {df['accident_status'].mean()*100:.1f}%")
    print(f"   Severity distribution:\n{df[df['accident_status']==1]['severity'].value_counts()}")
    return df


if __name__ == '__main__':
    generate_dataset()
