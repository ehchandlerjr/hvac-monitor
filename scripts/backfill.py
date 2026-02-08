#!/usr/bin/env python3
"""One-time backfill via /v1/history/devices — with rate limiting + date cutoff"""
import os, sys, re, time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
import httpx
from supabase import create_client

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
BACKFILL_DAYS = 7
MAX_PAGES = 100

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

def st_get(client, url, headers, params):
    """GET with rate-limit retry."""
    for _ in range(3):
        resp = client.get(url, headers=headers, params=params)
        if resp.status_code == 429:
            try:
                msg = resp.json().get("error",{}).get("details",[{}])[0].get("message","")
                match = re.search(r'retry in (\d+) millis', msg)
                wait = int(match.group(1)) / 1000 + 1 if match else 60
            except:
                wait = 60
            print(f"    Rate limited, waiting {wait:.0f}s...")
            time.sleep(wait)
            continue
        return resp
    return resp

def get_device_history(device_id, location_id, cutoff):
    """Pull history, stopping when events are older than cutoff."""
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    all_items = []
    hit_cutoff = False
    with httpx.Client(timeout=60) as client:
        params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
        for page in range(1, MAX_PAGES + 1):
            resp = st_get(client, f"{ST_API}/history/devices", headers, params)
            if resp.status_code != 200:
                print(f"    HTTP {resp.status_code} on page {page}")
                break
            data = resp.json()
            items = data.get("items", [])
            if not items:
                break
            # Check if oldest item in this page is before cutoff
            for item in items:
                ts_str = item.get("time", "")
                if ts_str:
                    try:
                        ts = datetime.fromisoformat(ts_str)
                        if ts < cutoff:
                            hit_cutoff = True
                    except:
                        pass
                all_items.append(item)
            if page % 10 == 0:
                print(f"    Page {page}: {len(all_items)} events...")
            if hit_cutoff:
                print(f"    Reached cutoff at page {page}")
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
            time.sleep(1.5)
    print(f"    Total: {len(all_items)} events")
    return all_items

def history_to_readings(items, cutoff):
    buckets = {}
    for item in items:
        attr = item.get("attribute", "")
        value = item.get("value")
        unit = item.get("unit", "")
        ts_str = item.get("time", "")
        if not ts_str or value is None:
            continue
        try:
            ts = datetime.fromisoformat(ts_str)
        except:
            continue
        if ts < cutoff:
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
        except (ValueError, TypeError):
            pass
    return [b for b in buckets.values() if "temp_f" in b]

def main():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=BACKFILL_DAYS)
    print(f"=== BACKFILL: {BACKFILL_DAYS} days (cutoff: {cutoff.isoformat()}) ===")
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
            items = get_device_history(device_id, location_id, cutoff)
            readings = history_to_readings(items, cutoff)
            print(f"    {len(items)} events -> {len(readings)} readings")
            rows = [{
                "timestamp": r["timestamp"], "sensor_id": sensor_id,
                "device_id": device_id, "temp_f": r.get("temp_f"),
                "humidity_pct": r.get("humidity_pct"),
                "battery_pct": r.get("battery_pct"), **no_weather,
            } for r in readings]
            for i in range(0, len(rows), 50):
                batch = rows[i:i + 50]
                try:
                    supabase.table("readings").upsert(batch, on_conflict="sensor_id,timestamp").execute()
                    total += len(batch)
                except Exception as e:
                    print(f"    Upsert error: {e}", file=sys.stderr)
            print(f"    Upserted {len(rows)} rows\n")
        except Exception as e:
            print(f"    Error: {e}", file=sys.stderr)
            import traceback; traceback.print_exc()
    print(f"=== DONE: {total} total rows upserted ===")

if __name__ == "__main__":
    main()
