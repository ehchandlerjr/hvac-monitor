/**
 * SensorRegistry — Infrastructure Configuration
 * 
 * THE file to edit when you add/move/remove sensors.
 * Everything else in the system reads from this.
 * 
 * This is the single source of truth for:
 * - What zones exist
 * - Which HVAC zone each room belongs to
 * - Which sensors are in each zone
 * - Adjacency relationships (for ΔT analysis)
 * - SVG layout hints (for floor plan rendering)
 * - Thermal resistance estimates per zone (for heat loss calcs)
 * 
 * ┌───────────────────────────────────────────┐
 * │  TO ADD A SENSOR:                         │
 * │  1. Add it to the sensors array in its    │
 * │     zone below                            │
 * │  2. Commit and push                       │
 * │  That's it. Everything else auto-adapts.  │
 * └───────────────────────────────────────────┘
 */

import { Sensor } from '../../domain/entities/Sensor.js';
import { Zone } from '../../domain/entities/Zone.js';

// ── Supabase configuration ────────────────────────
// SET THESE before deploying. The anon key is safe to expose in client code
// as long as you have Row Level Security on your Supabase table.
export const SUPABASE_CONFIG = {
  url: '',       // e.g. 'https://xxxxx.supabase.co'
  anonKey: '',   // e.g. 'eyJhbGciOi...'
  tableName: 'readings',
};

// ── Polling configuration ────────────────────────
export const POLL_INTERVAL_MS = 5 * 60_000;  // 5 minutes (matches GitHub Actions cron)
export const DEFAULT_HISTORY_HOURS = 24;

// ── Thermal resistance estimates (°F·hr/BTU) ─────
// Higher = better insulated. These are rough estimates for comparison.
export const THERMAL_RESISTANCES = new Map([
  ['nursery',     0.8],   // Exterior wall, possibly poor damper
  ['elijah',      0.9],   // Same zone, interior wall benefit
  ['master',      1.0],   // Well-regulated zone
  ['downstairs',  1.1],   // Ground floor, more mass
]);

// ── Zone & Sensor definitions ────────────────────

/**
 * Build the full zone/sensor graph.
 * Called once at startup by the composition root.
 * 
 * @returns {Zone[]}
 */
export function buildZoneGraph() {
  // ── Create sensors ─────────────────────────────
  const nurseryBed = new Sensor({
    sensorId: 'nursery_bed',
    label: 'Nursery (Bed Level)',
  });

  const elijahMid = new Sensor({
    sensorId: 'elijah_mid',
    label: "Elijah's Room (Mid)",
  });

  const masterBassinet = new Sensor({
    sensorId: 'master_bassinet',
    label: 'Master (Bassinet)',
  });

  const downstairsThermo = new Sensor({
    sensorId: 'downstairs_thermo',
    label: 'Downstairs (Thermostat)',
  });

  // ── Create zones ───────────────────────────────
  const nursery = new Zone({
    zoneId: 'nursery',
    name: 'Nursery',
    hvacZone: 'boys_rooms',
    adjacentZoneIds: ['elijah', 'master'],
    svgLayout: {
      // Second floor, left room
      x: 10, y: 10, w: 180, h: 130,
      labelY: 50, tempY: 80, cx: 100,
    },
  });
  nursery.addSensor(nurseryBed);

  const elijah = new Zone({
    zoneId: 'elijah',
    name: "Elijah's Room",
    hvacZone: 'boys_rooms',
    adjacentZoneIds: ['nursery', 'master'],
    svgLayout: {
      // Second floor, right room
      x: 200, y: 10, w: 180, h: 130,
      labelY: 50, tempY: 80, cx: 290,
    },
  });
  elijah.addSensor(elijahMid);

  const master = new Zone({
    zoneId: 'master',
    name: 'Master Bedroom',
    hvacZone: 'master',
    adjacentZoneIds: ['nursery', 'elijah'],
    svgLayout: {
      // Second floor, back
      x: 10, y: 150, w: 180, h: 130,
      labelY: 50, tempY: 80, cx: 100,
    },
  });
  master.addSensor(masterBassinet);

  const downstairs = new Zone({
    zoneId: 'downstairs',
    name: 'Downstairs',
    hvacZone: 'downstairs',
    adjacentZoneIds: [],  // Connected via stairwell, not directly adjacent
    svgLayout: {
      // First floor
      x: 200, y: 150, w: 180, h: 130,
      labelY: 50, tempY: 80, cx: 290,
    },
  });
  downstairs.addSensor(downstairsThermo);

  return [nursery, elijah, master, downstairs];
}
