/**
 * Publishes a moving rider to Supabase so you can watch a live gap change with
 * only one phone - or none.
 *
 *   npm run simulate -- --rider rider-b --start 250 --speed 8 --loop
 *
 * Reads the same .env the app uses. Ctrl-C to stop; the rider's last position
 * stays in the table and will show as stale in the app after ~15s.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { ROUTE_ID, ROUTE_LENGTH_M } from '../src/route';
import { createSimulatedRider, DEFAULT_SPEED_MPS } from '../src/simulation';

const PUBLISH_INTERVAL_MS = 2_000;

/** Minimal .env reader - avoids a dependency for one file of KEY=VALUE lines. */
function loadEnvFile(path: string): void {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return; // No .env is fine if the vars are already exported.
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function readNumberFlag(name: string, fallback: number): number {
  const raw = readFlag(name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    console.error(`--${name} expects a number, got "${raw}"`);
    process.exit(1);
  }
  return parsed;
}

loadEnvFile(resolve(process.cwd(), '.env'));

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase credentials. Copy .env.example to .env and fill it in.',
  );
  process.exit(1);
}

const riderId = readFlag('rider') ?? 'rider-b';
const startDistanceM = readNumberFlag('start', 250);
const speedMps = readNumberFlag('speed', DEFAULT_SPEED_MPS + 1);
const loop = process.argv.includes('--loop');

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

const rider = createSimulatedRider({ startDistanceM, speedMps, loop });
const startedAt = Date.now();

console.log(
  `Simulating ${riderId} on ${ROUTE_ID}: starting at ${startDistanceM} m of ` +
    `${ROUTE_LENGTH_M.toFixed(0)} m at ${speedMps} m/s ` +
    `(${(speedMps * 3.6).toFixed(1)} km/h)${loop ? ', looping' : ''}.`,
);
console.log('Ctrl-C to stop.\n');

let announcedFinish = false;

async function publish(): Promise<void> {
  const fix = rider.fixAt(Date.now() - startedAt);

  const { error } = await supabase.from('rider_positions').upsert(
    {
      rider_id: riderId,
      route_id: ROUTE_ID,
      lat: fix.point.lat,
      lng: fix.point.lng,
      accuracy_m: fix.accuracyM,
      speed_mps: fix.speedMps,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'rider_id' },
  );

  if (error) {
    console.error(`publish failed: ${error.message}`);
    return;
  }

  if (fix.finished && !announcedFinish) {
    announcedFinish = true;
    console.log(
      `${riderId} reached the finish. Still reporting - pass --loop to keep it moving.`,
    );
  }

  const progress = ((fix.distanceM / ROUTE_LENGTH_M) * 100).toFixed(1);
  process.stdout.write(
    `\r${riderId}: ${fix.distanceM.toFixed(0)} m (${progress}%)          `,
  );
}

void publish();
const timer = setInterval(() => void publish(), PUBLISH_INTERVAL_MS);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nStopped.');
  process.exit(0);
});
