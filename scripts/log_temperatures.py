#!/usr/bin/env python3
"""
SmartThings Temperature Logger — Self-Healing Edition
Pulls event history + upserts to Supabase (idempotent, gap-filling)
"""
import os, sys
from datetime import datetime, timezone, timedelta
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

def get_smartthings_devices():
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers={"Authorization":f"Bearer {ST_TOKEN}"})
        resp.raise_for_status()
        return resp.json().get("items",[])

def get_device_history(device_id, since):
    headers = {"Authorization":f"Bearer {ST_TOKEN}"}
    all_events = []
    with httpx.Client(timeout=30) as client:
        url = f"{ST_API}/devices/{device_id}/events"
        params = {"startDate":since.strftime("%Y-%m-%dT%H:%M:%S.000Z"),"limit":200}
        while url:
            resp = client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("items",[])
            all_events.extend(items)
            nl = data.get("_links",{}).get("next",{}).get("href")
            if nl and len(items)>0: url=nl; params={}
            else: url=None
    return all_events

def events_to_readings(events):
    buckets = {}
    for event in events:
        attr = event.get("attribute","")
        value = event.get("value")
        unit = event.get("unit","")
        ts_str = event.get("eventTime", event.get("stateChange",""))
        if not ts_str or value is None: continue
        try: ts = datetime.fromisoformat(ts_str.replace("Z","+00:00"))
        except: continue
        bk = ts.replace(second=0, microsecond=0).isoformat()
        if bk not in buckets: buckets[bk] = {"timestamp":bk}
        if attr == "temperature":
            temp = float(value)
            if unit == "C": temp = temp*9/5+32
            buckets[bk]["temp_f"] = round(temp,2)
        elif attr == "humidity":
            buckets[bk]["humidity_pct"] = round(float(value),2)
        elif attr == "battery":
            buckets[bk]["battery_pct"] = int(value)
    return [b for b in buckets.values() if "temp_f" in b]

def main():
    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=LOOKBACK_MINUTES)
    print(f"=== Temperature Log: {now.isoformat()} ===")
    print(f"  Pulling history since {since.isoformat()} ({LOOKBACK_MINUTES}min lookback)")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    weather = get_outdoor_weather()
    devices = get_smartthings_devices()
    temp_sensors = [d for d in devices if any(cap.get("id")=="temperatureMeasurement" for comp in d.get("components",[]) for cap in comp.get("capabilities",[]))]
    print(f"  Found {len(temp_sensors)} temperature sensor(s)")
    all_rows = []
    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name","unknown"))
        try:
            events = get_device_history(device_id, since)
            readings = events_to_readings(events)
            sensor_id = device_label.lower().replace(" ","_").replace("-","_")
            for reading in readings:
                row = {"timestamp":reading["timestamp"],"sensor_id":sensor_id,"device_id":device_id,
                    "temp_f":reading.get("temp_f"),"humidity_pct":reading.get("humidity_pct"),
                    "battery_pct":reading.get("battery_pct"),**weather}
                all_rows.append(row)
            print(f"  {sensor_id}: {len(events)} events -> {len(readings)} readings")
        except Exception as e:
            print(f"  Error reading {device_label}: {e}", file=sys.stderr)
    if not all_rows:
        all_rows.append({"timestamp":now.isoformat(),"sensor_id":"outdoor_weather","device_id":"nws_api","temp_f":None,"humidity_pct":None,"battery_pct":None,**weather})
        print("  No sensors found - logging outdoor weather only")
    all_rows.append({"timestamp":now.isoformat(),"sensor_id":"outdoor_weather","device_id":"nws_api","temp_f":None,"humidity_pct":None,"battery_pct":None,**weather})
    total = 0
    for i in range(0, len(all_rows), 50):
        batch = all_rows[i:i+50]
        try:
            supabase.table("readings").upsert(batch, on_conflict="sensor_id,timestamp").execute()
            total += len(batch)
        except Exception as e:
            print(f"  Error upserting batch {i//50}: {e}", file=sys.stderr)
    print(f"  Upserted {total} rows ({len(all_rows)} attempted)")
    print("\n=== Device Discovery ===")
    for device in temp_sensors:
        label = device.get("label",device.get("name"))
        print(f"  '{label}' -> '{device['deviceId'][:8]}...'")

if __name__ == "__main__":
    main()
