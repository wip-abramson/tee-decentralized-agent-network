import json
import threading
from datetime import datetime
from collections import deque

import serial
from fastapi import FastAPI, Query
from typing import Optional

# --- Serial config ---
SERIAL_PORT = "COM4"
BAUD_RATE = 9600  # Must match Serial.begin(9600) in your sketch

# Store last N readings in memory (ring buffer)
MAX_HISTORY = 10_000
readings = deque(maxlen=MAX_HISTORY)
latest = {}

def read_serial():
    """Background thread: continuously parse Arduino output."""
    print("Starting serial reader...")
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2)

    global latest

    while True:
        line = ser.readline().decode("utf-8", errors="ignore").strip()
        print("RAW:", line)   # 👈 ADD THIS

        if "Humidity:" in line and "Temperature:" in line:
            try:
                parts = line.split("|")
                humidity = float(parts[0].split(":")[1].replace("%", "").strip())
                temperature = float(parts[1].split(":")[1].replace("°C", "").strip())

                entry = {
                    "timestamp": datetime.now().isoformat(),
                    "temperature_c": temperature,
                    "humidity_pct": humidity,
                }

                latest = entry
                readings.append(entry)

                print("Parsed:", entry)

            except Exception as e:
                print("Parse error:", e)

# Start the serial reader in a daemon thread
thread = threading.Thread(target=read_serial, daemon=True)
thread.start()

# --- API ---
app = FastAPI(title="DHT11 Sensor API")

@app.get("/current")
def get_current():
    """Latest single reading."""
    if not latest:
        return {"status": "waiting", "message": "No data yet from sensor"}
    return latest

@app.get("/history")
def get_history(last_n: Optional[int] = Query(100, ge=1, le=MAX_HISTORY)):
    """Last N readings."""
    return list(readings)[-last_n:]

@app.get("/stats")
def get_stats():
    """Min/max/avg over buffered readings."""
    if not readings:
        return {"status": "no data"}
    temps = [r["temperature_c"] for r in readings]
    hums = [r["humidity_pct"] for r in readings]
    return {
        "count": len(readings),
        "temperature": {"min": min(temps), "max": max(temps), "avg": round(sum(temps) / len(temps), 2)},
        "humidity": {"min": min(hums), "max": max(hums), "avg": round(sum(hums) / len(hums), 2)},
        "oldest": readings[0]["timestamp"],
        "newest": readings[-1]["timestamp"],
    }