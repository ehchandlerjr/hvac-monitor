import { Sensor } from '../../domain/entities/Sensor.js';
import { Zone } from '../../domain/entities/Zone.js';

export const SUPABASE_CONFIG = {
  url: 'https://pbidxylxpolvddukhxlr.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWR4eWx4cG9sdmRkdWtoeGxyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzOTM2NTcsImV4cCI6MjA4NTk2OTY1N30.zgCiG43jKnD3v1aKXfWh929I47GnvdkRYs0pOSc6EFo',
  tableName: 'readings',
};

export const POLL_INTERVAL_MS = 5 * 60000;
export const DEFAULT_HISTORY_HOURS = 24;

export const THERMAL_RESISTANCES = new Map([
  ['teddys_room', 0.8],
  ['eliots_room', 0.9],
  ['master', 1.0],
  ['play_room', 1.1],
]);

export function buildZoneGraph() {
  const teddySensor = new Sensor({
    sensorId: "teddy's_room___sensor___temperature_and_relative_humidity",
    label: "Teddy's Room Sensor",
  });
  const eliotSensor = new Sensor({
    sensorId: "eliot's_room___sensor___temperature_and_relative_humidity",
    label: "Eliot's Room Sensor",
  });
  const masterSensor = new Sensor({
    sensorId: 'master_bedroom___sensor___temperature_and_relative_humidity',
    label: 'Master Bedroom Sensor',
  });
  const playSensor = new Sensor({
    sensorId: 'play_room___sensor___temperature_and_relative_humidity',
    label: 'Play Room Sensor',
  });
  const multiSensor = new Sensor({
    sensorId: 'multipurpose_sensor',
    label: 'Multipurpose Sensor',
  });

  const teddys = new Zone({
    zoneId: 'teddys_room', name: "Teddy's Room", hvacZone: 'boys_rooms',
    adjacentZoneIds: ['eliots_room', 'master'],
    svgLayout: { x: 10, y: 10, w: 180, h: 130, labelY: 50, tempY: 80, cx: 100 },
  });
  teddys.addSensor(teddySensor);

  const eliots = new Zone({
    zoneId: 'eliots_room', name: "Eliot's Room", hvacZone: 'boys_rooms',
    adjacentZoneIds: ['teddys_room', 'master'],
    svgLayout: { x: 200, y: 10, w: 180, h: 130, labelY: 50, tempY: 80, cx: 290 },
  });
  eliots.addSensor(eliotSensor);

  const master = new Zone({
    zoneId: 'master', name: 'Master Bedroom', hvacZone: 'master',
    adjacentZoneIds: ['teddys_room', 'eliots_room'],
    svgLayout: { x: 10, y: 150, w: 180, h: 130, labelY: 50, tempY: 80, cx: 100 },
  });
  master.addSensor(masterSensor);

  const playRoom = new Zone({
    zoneId: 'play_room', name: 'Play Room', hvacZone: 'downstairs',
    adjacentZoneIds: [],
    svgLayout: { x: 200, y: 150, w: 180, h: 130, labelY: 50, tempY: 80, cx: 290 },
  });
  playRoom.addSensor(playSensor);
  playRoom.addSensor(multiSensor);

  return [teddys, eliots, master, playRoom];
}
