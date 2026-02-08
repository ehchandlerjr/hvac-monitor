#!/usr/bin/env python3
"""
SmartThings Temperature Logger
Polls temperature sensors and logs to Supabase with outdoor weather data.
"""

import os
import sys
from datetime import datetime, timezone
import httpx
from supabase import create_client

# === Configuration ===
ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

# Indian Head, MD coordinates
LAT, LON = 38.59, -77.16

# Map SmartThings device names to your sensor_ids
# UPDATE THIS after you pair your sensors and see their names in the discovery output
DEVICE_NAME_TO_SENSOR_ID = {
    # "nursery_bed": "nursery_bed",
    # "elijah_mid": "elijah_mid",
    # "master_bassinet": "master_bassinet",
    # "downstairs_thermo": "downstairs_thermo",
}


def safe_round(val, digits=2):
    """Round a value, returning None if input is None."""
    return round(val, digits) if val is not None else None


def fmt(val, decimals=1, suffix=""):
    """Format a number for printing, returning '—' if None."""
    if val is None:
        return "—"
    return f"{val:.{decimals}f}{suffix}"


def get_outdoor_weather() -> dict:
    """
    Get current outdoor conditions from NWS API.

    Captures all variables relevant to building heat transfer physics:
    - Temperature (conduction driver)
    - Dew point (comfort, condensation risk, radiant sky temp proxy)
    - Wind speed + gust + direction (convection, infiltration)
    - Barometric pressure (air density, stack effect)
    - Humidity (latent heat, comfort)
    - Cloud cover (solar gain, radiative loss)
    - Wind chill (effective outdoor temp for infiltration modeling)
    - Precipitation (wet envelope = worse insulation)
    """
    headers = {"User-Agent": "(hvac-monitor, github-actions)"}

    try:
        with httpx.Client(timeout=10) as client:
            # Get nearest observation station
            points_url = f"https://api.weather.gov/points/{LAT},{LON}"
            points = client.get(points_url, headers=headers).json()
            stations_url = points["properties"]["observationStations"]
            stations = client.get(stations_url, headers=headers).json()

            # Get latest observation
            station_id = stations["features"][0]["properties"]["stationIdentifier"]
            obs_url = f"https://api.weather.gov/stations/{station_id}/observations/latest"
            obs = client.get(obs_url, headers=headers).json()
            props = obs["properties"]

            # === Unit conversions (all None-safe) ===
            def c_to_f(c):
                return (c * 9 / 5 + 32) if c is not None else None

            def kmh_to_mph(kmh):
                return (kmh * 0.621371) if kmh is not None else None

            def pa_to_inhg(pa):
                return (pa * 0.0002953) if pa is not None else None

            # === Extract all fields (any can be None) ===
            temp_c = props["temperature"]["value"]
            temp_f = c_to_f(temp_c)

            dewpoint_c = props["dewpoint"]["value"]
            dewpoint_f = c_to_f(dewpoint_c)

            wind_chill_c = props.get("windChill", {}).get("value")
            wind_chill_f = c_to_f(wind_chill_c)

            wind_speed_kmh = props["windSpeed"]["value"]
            wind_speed_mph = kmh_to_mph(wind_speed_kmh)

            wind_gust_kmh = props.get("windGust", {}).get("value")
            wind_gust_mph = kmh_to_mph(wind_gust_kmh)

            wind_direction_deg = props.get("windDirection", {}).get("value")

            humidity = props["relativeHumidity"]["value"]

            pressure_pa = props.get("barometricPressure", {}).get("value")
            pressure_inhg = pa_to_inhg(pressure_pa)

            # Cloud cover: NWS returns layers, take the most significant
            cloud_layers = props.get("cloudLayers", [])
            cloud_cover = None
            if cloud_layers:
                cover_map = {
                    "CLR": 0, "FEW": 15, "SCT": 40,
                    "BKN": 70, "OVC": 100, "VV": 100,
                }
                for layer in cloud_layers:
                    amount = layer.get("amount", "")
                    mapped = cover_map.get(amount)
                    if mapped is not None:
                        if cloud_cover is None or mapped > cloud_cover:
                            cloud_cover = mapped

            # Precipitation in last hour (mm)
            precip_mm = props.get("precipitationLastHour", {}).get("value")
            precip_in = (precip_mm * 0.03937) if precip_mm is not None else None

            weather = {
                "outdoor_temp_f": safe_round(temp_f),
                "outdoor_humidity_pct": safe_round(humidity),
                "wind_speed_mph": safe_round(wind_speed_mph),
                "wind_gust_mph": safe_round(wind_gust_mph),
                "wind_direction_deg": safe_round(wind_direction_deg, 0),
                "wind_chill_f": safe_round(wind_chill_f),
                "cloud_cover_pct": cloud_cover,
                "dewpoint_f": safe_round(dewpoint_f),
                "pressure_inhg": safe_round(pressure_inhg, 2),
                "precip_last_hour_in": safe_round(precip_in, 3),
            }

            feels = fmt(wind_chill_f if wind_chill_f is not None else temp_f)
            print(
                f"  Outdoor: {fmt(temp_f)}F (feels {feels}F), "
                f"wind {fmt(wind_speed_mph)} mph gusts {fmt(wind_gust_mph)} mph "
                f"from {fmt(wind_direction_deg, 0)}deg, "
                f"{fmt(humidity, 0)}% RH, clouds {cloud_cover or 0}%, "
                f"pressure {fmt(pressure_inhg, 2)} inHg"
            )

            return weather

    except Exception as e:
        print(f"  Warning: Could not fetch weather: {e}", file=sys.stderr)
        return {
            "outdoor_temp_f": None,
            "outdoor_humidity_pct": None,
            "wind_speed_mph": None,
            "wind_gust_mph": None,
            "wind_direction_deg": None,
            "wind_chill_f": None,
            "cloud_cover_pct": None,
            "dewpoint_f": None,
            "pressure_inhg": None,
            "precip_last_hour_in": None,
        }


def get_smartthings_devices() -> list[dict]:
    """Fetch all devices from SmartThings."""
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}

    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{ST_API}/devices", headers=headers)
        resp.raise_for_status()
        return resp.json().get("items", [])


def get_device_status(device_id: str) -> dict:
    """Get current status of a device."""
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}

    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{ST_API}/devices/{device_id}/status", headers=headers
        )
        resp.raise_for_status()
        return resp.json()


def extract_readings(status: dict) -> tuple[float | None, float | None, int | None]:
    """Extract temp, humidity, battery from device status."""
    components = status.get("components", {}).get("main", {})

    temp_f = None
    humidity = None
    battery = None

    # Temperature
    temp_data = components.get("temperatureMeasurement", {}).get("temperature", {})
    if temp_data.get("value") is not None:
        temp_val = float(temp_data["value"])
        unit = temp_data.get("unit", "F")
        if unit == "C":
            temp_f = temp_val * 9 / 5 + 32
        else:
            temp_f = temp_val

    # Humidity
    humid_data = components.get("relativeHumidityMeasurement", {}).get("humidity", {})
    if humid_data.get("value") is not None:
        humidity = float(humid_data["value"])

    # Battery
    batt_data = components.get("battery", {}).get("battery", {})
    if batt_data.get("value") is not None:
        battery = int(batt_data["value"])

    return temp_f, humidity, battery


def main():
    timestamp = datetime.now(timezone.utc)
    print(f"=== Temperature Log: {timestamp.isoformat()} ===")

    # Initialize Supabase
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Get outdoor weather first
    weather = get_outdoor_weather()

    # Get all SmartThings devices
    devices = get_smartthings_devices()

    # Filter to temperature sensors
    temp_sensors = [
        d
        for d in devices
        if any(
            cap.get("id") == "temperatureMeasurement"
            for comp in d.get("components", [])
            for cap in comp.get("capabilities", [])
        )
    ]

    print(f"Found {len(temp_sensors)} temperature sensor(s)")

    rows = []

    for device in temp_sensors:
        device_id = device["deviceId"]
        device_label = device.get("label", device.get("name", "unknown"))

        try:
            status = get_device_status(device_id)
            temp_f, humidity, battery = extract_readings(status)

            # Map device name to sensor_id
            sensor_id = DEVICE_NAME_TO_SENSOR_ID.get(device_label)
            if not sensor_id:
                sensor_id = (
                    device_label.lower().replace(" ", "_").replace("-", "_")
                )

            row = {
                "timestamp": timestamp.isoformat(),
                "sensor_id": sensor_id,
                "device_id": device_id,
                "temp_f": round(temp_f, 2) if temp_f else None,
                "humidity_pct": round(humidity, 2) if humidity else None,
                "battery_pct": battery,
                **weather,
            }
            rows.append(row)

            print(
                f"  {sensor_id}: {fmt(temp_f)}F, {fmt(humidity, 0)}% RH, {battery}% batt"
            )

        except Exception as e:
            print(f"  Error reading {device_label}: {e}", file=sys.stderr)

    # If no sensors found, still log outdoor weather as a baseline row
    if not rows:
        rows.append({
            "timestamp": timestamp.isoformat(),
            "sensor_id": "outdoor_weather",
            "device_id": "nws_api",
            "temp_f": None,
            "humidity_pct": None,
            "battery_pct": None,
            **weather,
        })
        print("  No sensors found - logging outdoor weather only")

    # Batch insert to Supabase
    result = supabase.table("readings").insert(rows).execute()
    print(f"Logged {len(rows)} reading(s) to Supabase")

    # Print device discovery info for first-time setup
    print()
    print("=== Device Discovery (for DEVICE_NAME_TO_SENSOR_ID mapping) ===")
    for device in temp_sensors:
        label = device.get("label", device.get("name"))
        print(f"  '{label}': '{device['deviceId'][:8]}...'")


if __name__ == "__main__":
    main()
