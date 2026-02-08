#!/usr/bin/env python3
"""One-time backfill via /v1/history/devices"""
import os, sys
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
import httpx
from supabase import create_client

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
BACKFILL_DAYS = 7

def get_location_id():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/locations", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        loc = resp.json().get("items", [])[0]
        print(f"  Location: {loc.get('name')} ({loc['locationId']})")
        return loc["locationId"]

def get_smartthings_devices():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        return resp.json().get("items", [])

def get_device_history(device_id, location_id):
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    all_items = []
    with httpx.Client(timeout=60) as client:
        params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
        page = 0
        while True:
            resp = client.get(f"{ST_API}/history/devices", headers=headers, params=params)
            if resp.status_code != 200:
                print(f"    HTTP {resp.status_code}: {resp.text[:300]}")
                break
            data = resp.json()
            items = data.get("items", [])
            all_items.extend(items)
            page += 1
            print(f"    Page {page}: {len(items)} events (total: {len(all_items)})")
            if len(items) == 0:
                break
            nl = data.get("_links", {}).get("next", {}).get("href")
            if nl:
                parsed = parse_qs(urlparse(nl).query)
                params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
                for k in ["after", "afterHash", "before", "beforeHash"]:
                    v = parsed.get(k, [None])[0]
                    if v:
                        params[k] = v
            else:
                break
    return all_items

def history_to_readings(items):
    """Convert history items to readings.
    
    Confirmed field names from API:
      time: "2026-02-08T12:40:08.000+00:00"
      attribute: "temperature" | "humidity" | "battery"
      value: "71.4" (string)
      unit: "\u00b0F" | "%" etc
    """
    buckets = {}
    skipped = 0
    for item in items:
        attr = item.get("attribute", "")
        value = item.get("value")
        unit = item.get("unit", "")
        ts_str = item.get("time", "")

        if not ts_str or value is None:
            skipped += 1
            continue

        try:
            ts = datetime.fromisoformat(ts_str)
        except Exception as e:
            print(f"    Bad timestamp: {ts_str!r} -> {e}")
            skipped += 1
            continue

        bk = ts.replace(second=0, microsecond=0).isoformat()
        if bk not in buckets:
            buckets[bk] = {"timestamp": bk}

        try:
            if attr == "temperature":
                temp = float(value)
                if "C" in unit and "F" not in unit:
                    temp = temp * 9 / 5 + 32
                buckets[bk]["temp_f"] = round(temp, 2)
            elif attr == "humidity":
                buckets[bk]["humidity_pct"] = round(float(value), 2)
            elif attr == "battery":
                buckets[bk]["battery_pct"] = int(float(value))
        except (ValueError, TypeError) as e:
            print(f"    Bad value: attr={attr} value={value!r} -> {e}")
            skipped += 1

    readings = [b for b in buckets.values() if "temp_f" in b]
    if skipped > 0:
        print(f"    Skipped {skipped} unparseable events")
    return readings

def main():
    now = datetime.now(timezone.utc)
    print(f"=== BACKFILL: {BACKFILL_DAYS} days ===")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    location_id = get_location_id()
    devices = get_smartthings_devices()
    temp_sensors = [
        d for d in devices
        if any(cap.get("id") == "temperatureMeasurement"
               for comp in d.get("components", [])
               for cap in comp.get("capabilities", []))
    ]
    print(f"  Found {len(temp_sensors)} sensor(s)\n")

    no_weather = {k: None for k in [
        "outdoor_temp_f", "outdoor_humidity_pct", "wind_speed_mph",
        "wind_gust_mph", "wind_direction_deg", "wind_chill_f",
        "cloud_cover_pct", "dewpoint_f", "pressure_inhg", "precip_last_hour_in"
    ]}

    total = 0
    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name", "unknown"))
        sensor_id = device_label.lower().replace(" ", "_").replace("-", "_")
        print(f"  {sensor_id}")

        try:
            items = get_device_history(device_id, location_id)
            readings = history_to_readings(items)
            print(f"    {len(items)} events -> {len(readings)} readings")

            rows = []
            for r in readings:
                rows.append({
                    "timestamp": r["timestamp"],
                    "sensor_id": sensor_id,
                    "device_id": device_id,
                    "temp_f": r.get("temp_f"),
                    "humidity_pct": r.get("humidity_pct"),
                    "battery_pct": r.get("battery_pct"),
                    **no_weather,
                })

            for i in range(0, len(rows), 50):
                batch = rows[i:i + 50]
                try:
                    supabase.table("readings").upsert(
                        batch, on_conflict="sensor_id,timestamp"
                    ).execute()
                    total += len(batch)
                    print(f"    Batch {i // 50 + 1}: upserted {len(batch)}")
                except Exception as e:
                    print(f"    Upsert error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"    Error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()
        print()

    print(f"=== DONE: {total} total rows upserted ===")

if __name__ == "__main__":
    main()
