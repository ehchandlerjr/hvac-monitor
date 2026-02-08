#!/usr/bin/env python3
"""
One-time backfill: pull SmartThings device history via /v1/history/devices
Requires locationId parameter.
"""
import os, sys
from datetime import datetime, timezone, timedelta
import httpx
from supabase import create_client

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

BACKFILL_DAYS = 7

def get_location_id():
    """Get the first SmartThings location ID."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/locations", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        locations = resp.json().get("items", [])
        if not locations:
            raise Exception("No locations found")
        loc = locations[0]
        print(f"  Location: {loc.get('name')} ({loc['locationId']})")
        return loc["locationId"]

def get_smartthings_devices():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        return resp.json().get("items", [])

def get_device_history(device_id, location_id):
    """Pull device history from /v1/history/devices with locationId."""
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    all_items = []
    with httpx.Client(timeout=60) as client:
        url = f"{ST_API}/history/devices"
        params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
        page = 0
        while url:
            resp = client.get(url, headers=headers, params=params)
            # Print response for debugging if error
            if resp.status_code != 200:
                print(f"    HTTP {resp.status_code}: {resp.text[:500]}")
                resp.raise_for_status()
            data = resp.json()
            items = data.get("items", [])
            all_items.extend(items)
            page += 1
            print(f"    Page {page}: {len(items)} events (total: {len(all_items)})")
            nl = data.get("_links", {}).get("next", {}).get("href")
            if nl and len(items) > 0:
                url = nl
                params = {}
            else:
                url = None
    return all_items

def history_to_readings(items):
    buckets = {}
    for item in items:
        attr = item.get("attribute", item.get("attributeName", ""))
        value = item.get("value")
        unit = item.get("unit", "")
        ts_str = item.get("eventTime") or item.get("createdDate") or item.get("stateChange") or ""
        if not ts_str or value is None: continue
        try: ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except: continue
        bk = ts.replace(second=0, microsecond=0).isoformat()
        if bk not in buckets: buckets[bk] = {"timestamp": bk}
        if attr == "temperature":
            temp = float(value)
            if unit == "C": temp = temp * 9 / 5 + 32
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
    location_id = get_location_id()
    devices = get_smartthings_devices()
    temp_sensors = [
        d for d in devices
        if any(cap.get("id") == "temperatureMeasurement"
               for comp in d.get("components", [])
               for cap in comp.get("capabilities", []))
    ]
    print(f"  Found {len(temp_sensors)} sensor(s)")

    no_weather = {
        "outdoor_temp_f": None, "outdoor_humidity_pct": None,
        "wind_speed_mph": None, "wind_gust_mph": None,
        "wind_direction_deg": None, "wind_chill_f": None,
        "cloud_cover_pct": None, "dewpoint_f": None,
        "pressure_inhg": None, "precip_last_hour_in": None,
    }

    total = 0
    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name", "unknown"))
        sensor_id = device_label.lower().replace(" ", "_").replace("-", "_")
        print(f"\n  {sensor_id} ({device_label})")

        try:
            items = get_device_history(device_id, location_id)
            if items:
                print(f"  Sample keys: {list(items[0].keys())}")
                print(f"  Sample: {items[0]}")
            readings = history_to_readings(items)
            print(f"  {len(items)} events -> {len(readings)} readings")

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
                batch = rows[i:i+50]
                try:
                    supabase.table("readings").upsert(batch, on_conflict="sensor_id,timestamp").execute()
                    total += len(batch)
                    print(f"    Batch {i//50+1}: upserted {len(batch)}")
                except Exception as e:
                    print(f"    Error: {e}", file=sys.stderr)
        except Exception as e:
            print(f"  Error: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    print(f"\n=== DONE: {total} total rows upserted ===")

if __name__ == "__main__":
    main()
