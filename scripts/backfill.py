#!/usr/bin/env python3
"""
One-time backfill: pull full SmartThings event history and upsert to Supabase.
SmartThings keeps ~7 days of events. Run once, then delete.
"""
import os, sys
from datetime import datetime, timezone, timedelta
import httpx
from supabase import create_client

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
LAT, LON = 38.59, -77.16

# How far back to pull (7 days max for SmartThings)
BACKFILL_DAYS = 7

def get_smartthings_devices():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        return resp.json().get("items", [])

def get_device_history(device_id, since):
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    all_events = []
    with httpx.Client(timeout=60) as client:
        url = f"{ST_API}/devices/{device_id}/events"
        params = {"startDate": since.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "limit": 200}
        page = 0
        while url:
            resp = client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items", [])
            all_events.extend(items)
            page += 1
            print(f"    Page {page}: {len(items)} events (total: {len(all_events)})")
            nl = data.get("_links", {}).get("next", {}).get("href")
            if nl and len(items) > 0:
                url = nl
                params = {}
            else:
                url = None
    return all_events

def events_to_readings(events):
    buckets = {}
    for event in events:
        attr = event.get("attribute", "")
        value = event.get("value")
        unit = event.get("unit", "")
        ts_str = event.get("eventTime", event.get("stateChange", ""))
        if not ts_str or value is None:
            continue
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except:
            continue
        bk = ts.replace(second=0, microsecond=0).isoformat()
        if bk not in buckets:
            buckets[bk] = {"timestamp": bk}
        if attr == "temperature":
            temp = float(value)
            if unit == "C":
                temp = temp * 9 / 5 + 32
            buckets[bk]["temp_f"] = round(temp, 2)
        elif attr == "humidity":
            buckets[bk]["humidity_pct"] = round(float(value), 2)
        elif attr == "battery":
            buckets[bk]["battery_pct"] = int(value)
    return [b for b in buckets.values() if "temp_f" in b]

def main():
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=BACKFILL_DAYS)
    print(f"=== BACKFILL: {since.date()} to {now.date()} ({BACKFILL_DAYS} days) ===")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    devices = get_smartthings_devices()
    temp_sensors = [
        d for d in devices
        if any(
            cap.get("id") == "temperatureMeasurement"
            for comp in d.get("components", [])
            for cap in comp.get("capabilities", [])
        )
    ]
    print(f"Found {len(temp_sensors)} sensor(s)")

    # Empty weather dict (we don't have historical weather for each timestamp)
    no_weather = {
        "outdoor_temp_f": None, "outdoor_humidity_pct": None,
        "wind_speed_mph": None, "wind_gust_mph": None,
        "wind_direction_deg": None, "wind_chill_f": None,
        "cloud_cover_pct": None, "dewpoint_f": None,
        "pressure_inhg": None, "precip_last_hour_in": None,
    }

    total_upserted = 0

    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name", "unknown"))
        sensor_id = device_label.lower().replace(" ", "_").replace("-", "_")
        print(f"\n  {sensor_id} ({device_label})")
        print(f"  Pulling events since {since.isoformat()}...")

        try:
            events = get_device_history(device_id, since)
            readings = events_to_readings(events)
            print(f"  {len(events)} events -> {len(readings)} readings")

            rows = []
            for reading in readings:
                rows.append({
                    "timestamp": reading["timestamp"],
                    "sensor_id": sensor_id,
                    "device_id": device_id,
                    "temp_f": reading.get("temp_f"),
                    "humidity_pct": reading.get("humidity_pct"),
                    "battery_pct": reading.get("battery_pct"),
                    **no_weather,
                })

            # Upsert in batches
            for i in range(0, len(rows), 50):
                batch = rows[i:i + 50]
                try:
                    supabase.table("readings").upsert(
                        batch, on_conflict="sensor_id,timestamp"
                    ).execute()
                    total_upserted += len(batch)
                    print(f"    Batch {i // 50 + 1}: upserted {len(batch)} rows")
                except Exception as e:
                    print(f"    Error batch {i // 50}: {e}", file=sys.stderr)

        except Exception as e:
            print(f"  Error: {e}", file=sys.stderr)

    print(f"\n=== DONE: {total_upserted} total rows upserted ===")
    print("You can delete this script now.")

if __name__ == "__main__":
    main()
