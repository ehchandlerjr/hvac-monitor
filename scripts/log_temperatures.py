#!/usr/bin/env python3
"""
SmartThings Temperature Logger — Self-Healing Edition
Pulls event history via /v1/history/devices + upserts to Supabase
"""
import os, sys, re, time
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs
import httpx
from supabase import create_client

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
LOOKBACK_MINUTES = 30
LAT, LON = 38.59, -77.16

def safe_round(val, digits=2):
    return round(val, digits) if val is not None else None

def fmt(val, decimals=1, suffix=""):
    if val is None: return "\u2014"
    return f"{val:.{decimals}f}{suffix}"

def get_outdoor_weather():
    headers = {"User-Agent": "(hvac-monitor, github-actions)"}
    try:
        with httpx.Client(timeout=15) as client:
            points = client.get(f"https://api.weather.gov/points/{LAT},{LON}", headers=headers).json()
            stations = client.get(points["properties"]["observationStations"], headers=headers).json()
            station_id = stations["features"][0]["properties"]["stationIdentifier"]
            obs = client.get(f"https://api.weather.gov/stations/{station_id}/observations/latest", headers=headers).json()
            props = obs["properties"]
            c2f = lambda c: (c*9/5+32) if c is not None else None
            k2m = lambda k: (k*0.621371) if k is not None else None
            p2i = lambda p: (p*0.0002953) if p is not None else None
            temp_f = c2f(props["temperature"]["value"])
            dewpoint_f = c2f(props["dewpoint"]["value"])
            wind_chill_f = c2f(props.get("windChill",{}).get("value"))
            wind_speed_mph = k2m(props["windSpeed"]["value"])
            wind_gust_mph = k2m(props.get("windGust",{}).get("value"))
            wind_direction_deg = props.get("windDirection",{}).get("value")
            humidity = props["relativeHumidity"]["value"]
            pressure_inhg = p2i(props.get("barometricPressure",{}).get("value"))
            cloud_layers = props.get("cloudLayers",[])
            cloud_cover = None
            if cloud_layers:
                cm = {"CLR":0,"FEW":15,"SCT":40,"BKN":70,"OVC":100,"VV":100}
                for layer in cloud_layers:
                    m = cm.get(layer.get("amount",""))
                    if m is not None and (cloud_cover is None or m > cloud_cover): cloud_cover = m
            precip_mm = props.get("precipitationLastHour",{}).get("value")
            precip_in = (precip_mm*0.03937) if precip_mm is not None else None
            weather = {"outdoor_temp_f":safe_round(temp_f),"outdoor_humidity_pct":safe_round(humidity),
                "wind_speed_mph":safe_round(wind_speed_mph),"wind_gust_mph":safe_round(wind_gust_mph),
                "wind_direction_deg":safe_round(wind_direction_deg,0),"wind_chill_f":safe_round(wind_chill_f),
                "cloud_cover_pct":cloud_cover,"dewpoint_f":safe_round(dewpoint_f),
                "pressure_inhg":safe_round(pressure_inhg,2),"precip_last_hour_in":safe_round(precip_in,3)}
            feels = fmt(wind_chill_f if wind_chill_f is not None else temp_f)
            print(f"  Outdoor: {fmt(temp_f)}F (feels {feels}F), wind {fmt(wind_speed_mph)} mph gusts {fmt(wind_gust_mph)} mph from {fmt(wind_direction_deg,0)}deg, {fmt(humidity,0)}% RH, clouds {cloud_cover or 0}%, pressure {fmt(pressure_inhg,2)} inHg")
            return weather
    except Exception as e:
        print(f"  Warning: Could not fetch weather: {e}", file=sys.stderr)
        return {k:None for k in ["outdoor_temp_f","outdoor_humidity_pct","wind_speed_mph","wind_gust_mph","wind_direction_deg","wind_chill_f","cloud_cover_pct","dewpoint_f","pressure_inhg","precip_last_hour_in"]}

def get_location_id():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/locations", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        loc = resp.json().get("items", [])[0]
        return loc["locationId"]

def get_smartthings_devices():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers={"Authorization": f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        return resp.json().get("items",[])

def st_get(client, url, headers, params):
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

def get_device_history(device_id, location_id):
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    all_items = []
    with httpx.Client(timeout=60) as client:
        params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
        for page in range(1, 20):
            resp = st_get(client, f"{ST_API}/history/devices", headers, params)
            if resp.status_code != 200:
                print(f"    HTTP {resp.status_code} on page {page}")
                break
            data = resp.json()
            items = data.get("items", [])
            if not items:
                break
            all_items.extend(items)
            if page == 1 and items:
                seen_attrs = set(i.get("attribute","") for i in items)
                print(f"    Attributes in history: {sorted(seen_attrs)}")
            nl = data.get("_links", {}).get("next", {}).get("href")
            if nl:
                parsed = parse_qs(urlparse(nl).query)
                params = {"deviceId": device_id, "locationId": location_id, "limit": 200}
                for k in ["after", "afterHash", "before", "beforeHash"]:
                    v = parsed.get(k, [None])[0]
                    if v: params[k] = v
            else:
                break
    return all_items

def history_to_readings(items, since):
    """Parse history items into readings, matching humidity to nearest temp."""
    temp_events = []
    humidity_events = []
    battery_events = []
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
        if ts < since:
            continue
        try:
            if attr == "temperature":
                temp = float(value)
                if "C" in unit and "F" not in unit:
                    temp = temp * 9 / 5 + 32
                temp_events.append({"ts": ts, "temp_f": round(temp, 2)})
            elif attr in ("humidity", "relativeHumidity"):
                humidity_events.append({"ts": ts, "val": round(float(value), 2)})
            elif attr == "battery":
                battery_events.append({"ts": ts, "val": int(float(value))})
        except (ValueError, TypeError):
            pass
    # Build readings from temperature events, attach nearest humidity/battery
    readings = []
    for te in temp_events:
        r = {"timestamp": te["ts"].replace(second=0, microsecond=0).isoformat(), "temp_f": te["temp_f"]}
        # Find closest humidity within 5 minutes
        best_h = None
        best_h_gap = 300  # 5 min max
        for he in humidity_events:
            gap = abs((te["ts"] - he["ts"]).total_seconds())
            if gap < best_h_gap:
                best_h_gap = gap
                best_h = he["val"]
        if best_h is not None:
            r["humidity_pct"] = best_h
        # Find closest battery within 30 minutes
        best_b = None
        best_b_gap = 1800
        for be in battery_events:
            gap = abs((te["ts"] - be["ts"]).total_seconds())
            if gap < best_b_gap:
                best_b_gap = gap
                best_b = be["val"]
        if best_b is not None:
            r["battery_pct"] = best_b
        readings.append(r)
    return readings

def main():
    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=LOOKBACK_MINUTES)
    print(f"=== Temperature Log: {now.isoformat()} ===")
    print(f"  Pulling history since {since.isoformat()} ({LOOKBACK_MINUTES}min lookback)")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    weather = get_outdoor_weather()
    location_id = get_location_id()
    devices = get_smartthings_devices()
    temp_sensors = [d for d in devices if any(cap.get("id")=="temperatureMeasurement" for comp in d.get("components",[]) for cap in comp.get("capabilities",[]))]
    print(f"  Found {len(temp_sensors)} temperature sensor(s)")
    all_rows = []
    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name","unknown"))
        try:
            items = get_device_history(device_id, location_id)
            readings = history_to_readings(items, since)
            sensor_id = device_label.lower().replace("‘","'").replace("’","'").replace("“","'").replace("”","'").replace(" ","_").replace("-","_")
            for reading in readings:
                all_rows.append({"timestamp":reading["timestamp"],"sensor_id":sensor_id,"device_id":device_id,
                    "temp_f":reading.get("temp_f"),"humidity_pct":reading.get("humidity_pct"),
                    "battery_pct":reading.get("battery_pct"),**weather})
            print(f"  {sensor_id}: {len(items)} events -> {len(readings)} readings")
        except Exception as e:
            print(f"  Error reading {device_label}: {e}", file=sys.stderr)
    # Always log outdoor weather
    all_rows.append({"timestamp":now.isoformat(),"sensor_id":"outdoor_weather","device_id":"nws_api","temp_f":None,"humidity_pct":None,"battery_pct":None,**weather})
    # Deduplicate within batch (same sensor_id + timestamp)
    seen = set()
    deduped = []
    for row in all_rows:
        key = (row["sensor_id"], row["timestamp"])
        if key not in seen:
            seen.add(key)
            deduped.append(row)
    total = 0
    for i in range(0, len(deduped), 50):
        batch = deduped[i:i+50]
        try:
            supabase.table("readings").upsert(batch, on_conflict="sensor_id,timestamp").execute()
            total += len(batch)
        except Exception as e:
            print(f"  Error upserting batch {i//50}: {e}", file=sys.stderr)
    print(f"  Upserted {total} rows ({len(deduped)} attempted)")

if __name__ == "__main__":
    main()
