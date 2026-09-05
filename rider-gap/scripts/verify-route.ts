/**
 * Checks the geometry the whole app rests on: if progress along the course is
 * wrong, every gap it reports is wrong too. Pure maths, no device or network
 * needed. Run with `npm run verify`.
 */
import { createCourse } from '../src/course';
import { haversineMeters } from '../src/geo';
import {
  ROUTE,
  ROUTE_LENGTH_M,
  pointAtDistance,
  progressAlongRoute,
} from '../src/route';
import { createSimulatedRider } from '../src/simulation';

let failures = 0;

function check(name: string, passed: boolean, detail: string): void {
  console.log(`${passed ? 'ok  ' : 'FAIL'}  ${name} :: ${detail}`);
  if (!passed) failures += 1;
}

// --- Core distance maths -------------------------------------------------

// A degree of latitude is ~111.2 km anywhere on Earth.
const oneDegree = haversineMeters({ lat: 52, lng: 6 }, { lat: 53, lng: 6 });
check(
  'haversine matches one degree of latitude',
  Math.abs(oneDegree - 111195) < 500,
  `${oneDegree.toFixed(0)} m`,
);

// Deventer -> Zwolle is ~32 km by road; the waypoint course cuts the bends, so
// it should come in a little under that but nowhere near a different journey.
check(
  'route length is plausible for Deventer -> Zwolle',
  ROUTE_LENGTH_M > 27_000 && ROUTE_LENGTH_M < 35_000,
  `${(ROUTE_LENGTH_M / 1000).toFixed(2)} km`,
);

const start = progressAlongRoute(ROUTE[0]!);
check(
  'the start reads as zero',
  start.distanceM < 5 && !start.isOffRoute,
  `${start.distanceM.toFixed(1)} m`,
);

const finish = progressAlongRoute(ROUTE[ROUTE.length - 1]!, ROUTE_LENGTH_M);
check(
  'the finish reads as the full length',
  Math.abs(finish.distanceM - ROUTE_LENGTH_M) < 5,
  `${(finish.distanceM / 1000).toFixed(2)} km`,
);

// Walking the waypoints in order must give increasing, on-route progress.
let previous = -1;
let monotonic = true;
let worstOffRoute = 0;
for (const waypoint of ROUTE) {
  const result = progressAlongRoute(waypoint, previous < 0 ? undefined : previous);
  if (result.distanceM < previous - 1) monotonic = false;
  worstOffRoute = Math.max(worstOffRoute, result.offRouteM);
  previous = result.distanceM;
}
check(
  'progress increases along the route and every waypoint snaps to it',
  monotonic && worstOffRoute < 1,
  `worst off-route ${worstOffRoute.toFixed(3)} m`,
);

// A point halfway along a segment should read half that segment's length.
const [first, second] = [ROUTE[0]!, ROUTE[1]!];
const midpoint = {
  lat: (first.lat + second.lat) / 2,
  lng: (first.lng + second.lng) / 2,
};
const expectedMidpoint = haversineMeters(first, second) / 2;
check(
  'a segment midpoint reads as half the segment',
  Math.abs(progressAlongRoute(midpoint, 0).distanceM - expectedMidpoint) < 2,
  `${progressAlongRoute(midpoint, 0).distanceM.toFixed(1)} m vs ${expectedMidpoint.toFixed(1)} m`,
);

// Apeldoorn is ~20 km off this course.
const offRoute = progressAlongRoute({ lat: 52.2112, lng: 5.9699 });
check(
  'a point far from the course is flagged off-route',
  offRoute.isOffRoute,
  `off by ${(offRoute.offRouteM / 1000).toFixed(1)} km`,
);

// The gap between two riders is the route distance between them.
const ahead = progressAlongRoute(ROUTE[3]!);
const behind = progressAlongRoute(ROUTE[1]!);
const summed =
  haversineMeters(ROUTE[1]!, ROUTE[2]!) + haversineMeters(ROUTE[2]!, ROUTE[3]!);
check(
  'the gap equals the summed segments between two riders',
  Math.abs(ahead.distanceM - behind.distanceM - summed) < 2,
  `${(ahead.distanceM - behind.distanceM).toFixed(0)} m vs ${summed.toFixed(0)} m`,
);

// --- distance <-> point round-trip ---------------------------------------

// `pointAtDistance` must invert `progressAlongRoute`. Simulated riders are
// built on this, so drift here would fake a gap that isn't real.
let worstRoundTripM = 0;
for (let fraction = 0; fraction <= 1.0001; fraction += 0.05) {
  const target = ROUTE_LENGTH_M * Math.min(1, fraction);
  const returned = progressAlongRoute(pointAtDistance(target), target).distanceM;
  worstRoundTripM = Math.max(worstRoundTripM, Math.abs(returned - target));
}
check(
  'distance -> point -> distance round-trips',
  worstRoundTripM < 1,
  `worst drift ${worstRoundTripM.toFixed(3)} m`,
);

check(
  'pointAtDistance clamps beyond the route',
  progressAlongRoute(pointAtDistance(ROUTE_LENGTH_M * 2), ROUTE_LENGTH_M)
    .distanceM > ROUTE_LENGTH_M - 1,
  'past the finish clamps to the finish',
);

// --- Courses that pass close to themselves -------------------------------
// The shipped route runs city to city and never doubles back, so these use
// synthetic courses to keep the snap tie-breaking covered.

// A ~800 m square loop finishing where it starts.
const loop = createCourse([
  { lat: 52, lng: 6 },
  { lat: 52.0018, lng: 6 },
  { lat: 52.0018, lng: 6.00292 },
  { lat: 52, lng: 6.00292 },
  { lat: 52, lng: 6 },
]);
const startLine = { lat: 52, lng: 6 };

check(
  'on a loop, a cold fix at the start line reads as the start',
  loop.progressAt(startLine).distanceM < 1,
  `${loop.progressAt(startLine).distanceM.toFixed(1)} m of ${loop.lengthM.toFixed(0)} m`,
);
check(
  'on a loop, a rider returning to the start line reads as the finish',
  loop.progressAt(startLine, loop.lengthM - 50).distanceM > loop.lengthM - 5,
  `${loop.progressAt(startLine, loop.lengthM - 50).distanceM.toFixed(0)} m of ${loop.lengthM.toFixed(0)} m`,
);

// An out-and-back, where every point sits on two legs at once.
const outAndBack = createCourse([
  { lat: 52, lng: 6 },
  { lat: 52.009, lng: 6 },
  { lat: 52, lng: 6 },
]);
const turnaroundHalf = { lat: 52.0045, lng: 6 };
check(
  'on an out-and-back, the outbound leg is read on the way out',
  Math.abs(outAndBack.progressAt(turnaroundHalf, 0).distanceM - outAndBack.lengthM / 4) < 5,
  `${outAndBack.progressAt(turnaroundHalf, 0).distanceM.toFixed(0)} m`,
);
check(
  'on an out-and-back, the return leg is read on the way back',
  Math.abs(
    outAndBack.progressAt(turnaroundHalf, outAndBack.lengthM * 0.7).distanceM -
      (outAndBack.lengthM * 3) / 4,
  ) < 5,
  `${outAndBack.progressAt(turnaroundHalf, outAndBack.lengthM * 0.7).distanceM.toFixed(0)} m`,
);

// --- Simulation ----------------------------------------------------------

const moving = createSimulatedRider({ startDistanceM: 100, speedMps: 8, jitterM: 0 });
check(
  'a simulated rider covers speed x time',
  Math.abs(moving.fixAt(60_000).distanceM - (100 + 8 * 60)) < 0.5,
  `${moving.fixAt(60_000).distanceM.toFixed(1)} m after 60 s`,
);

// Jitter should perturb the fix without moving it meaningfully along the route.
const jittery = createSimulatedRider({ speedMps: 8, jitterM: 4 });
let worstJitterDriftM = 0;
for (let tick = 0; tick < 60; tick += 1) {
  const fix = jittery.fixAt(tick * 1000);
  const snapped = progressAlongRoute(fix.point, fix.distanceM);
  worstJitterDriftM = Math.max(
    worstJitterDriftM,
    Math.abs(snapped.distanceM - fix.distanceM),
  );
}
check(
  'simulated jitter does not distort progress',
  worstJitterDriftM < 10,
  `worst drift ${worstJitterDriftM.toFixed(1)} m`,
);

const oneLap = createSimulatedRider({ speedMps: 4000, jitterM: 0 });
const stopped = oneLap.fixAt(60_000);
check(
  'a non-looping rider stops at the finish',
  stopped.finished &&
    Math.abs(stopped.distanceM - ROUTE_LENGTH_M) < 0.5 &&
    stopped.speedMps === 0,
  `${(stopped.distanceM / 1000).toFixed(1)} km`,
);

const looping = createSimulatedRider({ speedMps: 4000, jitterM: 0, loop: true });
check(
  'a looping rider wraps past the finish',
  !looping.fixAt(60_000).finished &&
    looping.fixAt(60_000).distanceM < ROUTE_LENGTH_M,
  `${looping.fixAt(60_000).distanceM.toFixed(0)} m into the next lap`,
);

console.log(
  failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
