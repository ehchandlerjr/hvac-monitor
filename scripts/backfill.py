#!/usr/bin/env python3
"""One-time backfill via /v1/history/devices"""
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
        url = f"{ST_API}/history/devices"
        params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
        page = 0
        while True:
            resp = client.get(url, headers=headers, params=params)
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
            # Pagination: use afterHash if available, otherwise stop
            nl = data.get("_links", {}).get("next", {}).get("href")
            if nl:
                # Reset to base URL but keep locationId + deviceId
                # Extract afterHash from next link
                from urllib.parse import urlparse, parse_qs
                parsed = parse_qs(urlparse(nl).query)
                after = parsed.get("afterHash", [None])[0]
                if after:
                    params = {"deviceId": device_id, "locationId": location_id, "limit": 200, "afterHash": after}
                else:
                    break
            else:
                break
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
    print(f"  Found {len(temp_sensors)} sensor(s)")
    no_weather = {k: None for k in ["outdoor_temp_f","outdoor_humidity_pct","wind_speed_mph","wind_gust_mph","wind_direction_deg","wind_chill_f","cloud_cover_pct","dewpoint_f","pressure_inhg","precip_last_hour_in"]}
    total = 0
    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name", "unknown"))
        sensor_id = device_label.lower().replace(" ", "_").replace("-", "_")
        print(f"\n  {sensor_id}")
        try:
            items = get_device_history(device_id, location_id)
            if items and len(items) > 0:
                print(f"  Sample keys: {list(items[0].keys())}")
            readings = history_to_readings(items)
            print(f"  {len(items)} events -> {len(readings)} readings")
            rows = []
            for r in readings:
                rows.append({"timestamp": r["timestamp"], "sensor_id": sensor_id, "device_id": device_id,
                    "temp_f": r.get("temp_f"), "humidity_pct": r.get("humidity_pct"),
                    "battery_pct": r.get("battery_pct"), **no_weather})
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
            import traceback; traceback.print_exc()
    print(f"\n=== DONE: {total} total rows upserted ===")

if __name__ == "__main__":
    main()
