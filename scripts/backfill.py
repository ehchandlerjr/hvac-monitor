#!/usr/bin/env python3
"""Diagnostic backfill — dump raw event data"""
import os, json
from datetime import datetime, timezone
import httpx

ST_API = "https://api.smartthings.com/v1"
ST_TOKEN = os.environ["SMARTTHINGS_TOKEN"]

def main():
    headers = {"Authorization": f"Bearer {ST_TOKEN}"}
    with httpx.Client(timeout=30) as client:
        # Get location
        loc = client.get(f"{ST_API}/locations", headers=headers).json()["items"][0]
        location_id = loc["locationId"]
        print(f"Location: {loc['name']} ({location_id})")

        # Get devices
        devices = client.get(f"{ST_API}/devices", headers=headers).json()["items"]
        temp_sensors = [
            d for d in devices
            if any(cap.get("id") == "temperatureMeasurement"
                   for comp in d.get("components", [])
                   for cap in comp.get("capabilities", []))
        ]

        # For FIRST sensor only, dump first 5 raw events
        device = temp_sensors[0]
        device_id = device["deviceId"]
        label = device.get("label", "unknown")
        print(f"\nDevice: {label} ({device_id})")

        resp = client.get(f"{ST_API}/history/devices",
            headers=headers,
            params={"deviceId": device_id, "locationId": location_id, "limit": 5})
        print(f"HTTP {resp.status_code}")
        data = resp.json()
        items = data.get("items", [])
        print(f"Got {len(items)} items\n")

        for i, item in enumerate(items):
            print(f"--- Event {i} ---")
            print(json.dumps(item, indent=2, default=str))
            print()

if __name__ == "__main__":
    main()
