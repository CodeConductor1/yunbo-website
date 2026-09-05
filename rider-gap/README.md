# Rider Gap

An Expo app for two riders on one fixed route. Each phone reports its GPS
position to Supabase; both phones show the **live gap** between the riders —
how many metres of course separate them, who is ahead, and whether the gap is
opening or closing.

The gap is measured *along the route*, not as the crow flies. Two riders on
opposite sides of a hairpin are metres apart in a straight line but minutes
apart on the road; distance-along-course is the number that actually matters.

> **Note on this repo.** Rider Gap is unrelated to the yunbo-website static
> site it currently sits beside; this session was pinned to that repository.
> The folder is self-contained, so moving it to its own repo is a straight
> copy — nothing outside `rider-gap/` is referenced.

## How it works

1. Each device picks an identity at launch (Rider A or Rider B) and watches its
   own GPS.
2. Every fix is snapped to the hardcoded route — projected onto the nearest
   segment — giving a single number: metres travelled along the course.
3. The raw position is upserted into `public.rider_positions` (one row per
   rider, at most every ~1.5 s).
4. Both devices subscribe to that table over Supabase realtime, so each sees
   the other's position within a second of it being written.
5. `gap = myProgress − theirProgress`. Positive means you are ahead.

Progress is recomputed locally from lat/lng for *both* riders, so the two
phones measure with identical code and always agree.

## Setup

```bash
npm install
```

Create the table — paste `supabase/schema.sql` into the Supabase SQL editor.
It creates `rider_positions`, adds it to the `supabase_realtime` publication
(realtime only forwards tables in that publication), and sets RLS policies.

Add your keys:

```bash
cp .env.example .env   # then fill in URL + anon key from Project Settings -> API
```

Run it:

```bash
npx expo start
```

Open it on **two physical devices** and pick a *different* rider on each. Both
should show `Live` once realtime connects.

No second device? See [Testing without two devices](#testing-without-two-devices).

> Changing `.env` requires `npx expo start -c` to clear the bundler cache;
> `EXPO_PUBLIC_` values are inlined at build time.

## Testing without two devices

Two simulators, usable together or apart. Both are driven by the same motion
model in `src/simulation.ts`, so a simulated rider behaves like a real one all
the way through: snapped to the route, published to Supabase, subscribed to
over realtime.

**The other rider** — a bot that publishes a second rider straight to Supabase:

```bash
npm run simulate                       # rider-b, from 250 m, at 8 m/s
npm run simulate -- --rider rider-b --start 250 --speed 8 --loop
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--rider` | `rider-b` | Which rider id to publish as |
| `--start` | `250` | Where on the route it starts, in metres |
| `--speed` | `8` | Metres per second (8 m/s ≈ 29 km/h) |
| `--loop` | off | Wrap to the start instead of stopping at the finish |

It reads the same `.env` as the app. Ctrl-C to stop — the last position stays
in the table and shows as stale in the app after ~15 s. Run it as the rider you
are *not* using on your phone.

**Your own position** — flip **Simulate my position** on the rider picker. Your
device rolls along the route without touching the GPS, so this works on a
simulator or at a desk. The gap screen shows a `SIMULATED` badge whenever it is
on, so simulated data is never mistaken for a real ride.

Running both together gives a full live gap with no phones at all:

```bash
npm run simulate -- --rider rider-b --start 250 --speed 8
npx expo start          # open as Rider A, simulation on
```

Rider B starts 250 m up the road and rides faster, so the gap opens steadily —
enough to watch the number, the direction, and the closing rate all update.

## The route

The bundled route runs **Deventer → Zwolle**, following the IJssel north through
Olst, Wijhe, Herxen and Windesheim — roughly the N337 dike road riders use
between the two cities.

It is built from six *waypoints*, not a traced road. Each coordinate is the real
position of that town, but the app joins them with straight lines, so the course
cuts every bend the river makes: it measures **29.0 km** against roughly 32 km on
the ground. `OFF_ROUTE_THRESHOLD_M` is therefore widened to 2000 m, because a
rider on the actual road can be more than a kilometre from the straight line
between two towns.

**Before riding it for real, import an accurate trace.** Export the route as GPX
from any planner (Komoot, Strava, RideWithGPS, BRouter) and run:

```bash
npm run import-gpx -- ~/Downloads/deventer-zwolle.gpx --name "Deventer to Zwolle"
npm run verify
```

That rewrites `src/route.ts` with the real geometry and restores the 75 m
off-route threshold, at which point progress and the gap are trustworthy.

| Flag | Default | Meaning |
| --- | --- | --- |
| `--name` | GPX `<name>`, else filename | Display name |
| `--id` | slug of the name | `ROUTE_ID`; change it so old rows don't mix in |
| `--epsilon` | `25` | Simplification tolerance in metres |
| `--threshold` | `75` | Off-route distance in metres |
| `--out` | `src/route.ts` | Where to write |

GPX traces carry a point every few metres. The importer thins them with
Ramer–Douglas–Peucker, dropping only points that sit within `--epsilon` of the
line their neighbours already describe. On a test trace that cut 1931 points to
64 — a 30× reduction — while losing 96 m of a 32.4 km course (0.3%).

To use a different route entirely, import a different GPX, or hand-edit `ROUTE`
in `src/route.ts`. Everything else — length, progress, the track UI — derives
from that array.

Waypoint sources: [Deventer](https://en.wikipedia.org/wiki/Deventer_railway_station)
and [Zwolle](https://en.wikipedia.org/wiki/Zwolle_railway_station) stations,
[Olst](https://en.wikipedia.org/wiki/Olst), [Wijhe](https://en.wikipedia.org/wiki/Wijhe),
[Herxen](https://mapcarta.com/17854310), [Windesheim](https://mapcarta.com/17834400).

## Verifying the math

```bash
npm run verify   # geometry + simulation checks, no device or network needed
npm run typecheck
```

The geometry is the part worth testing: if progress along the course is wrong,
every gap the app reports is wrong. `npm run verify` checks haversine against a
known distance, route length against the real journey, monotonic progress along
the course, midpoint projection, off-route detection, and gap arithmetic.

It also covers the cases the shipped route can't exercise itself. Deventer →
Zwolle never doubles back, so snap tie-breaking is checked against synthetic
courses — a closed loop and an out-and-back — where each position genuinely sits
on two parts of the course at once. And for the simulator: that
`distance -> point -> distance` round-trips, that a simulated rider covers
exactly speed × time, and that its jitter does not distort progress.

## Known limits

- **The bundled route is approximate.** Six waypoints joined by straight lines,
  ~3 km short of the real ride. Import a GPX before trusting the numbers — see
  [The route](#the-route).
- **One lap.** The route is treated as a course from start to finish. On a
  circular route, a rider starting a second lap reads as being back at 0 m.
  Multi-lap tracking needs a lap counter on top of progress.
- **Ambiguity where a course meets itself.** On a loop or an out-and-back, a
  position fits two parts of the course equally well. The app uses the rider's
  previous position to decide; with no history (a cold launch) it assumes the
  earlier one.
- **Foreground only.** Location stops when the app is backgrounded. Continuous
  tracking needs `expo-task-manager` and background location permissions.
- **Demo-grade security.** There is no auth: the anon key reads and writes
  positions directly, so anyone with the key can write any rider's row. Before
  real use, add auth and scope writes to `auth.uid() = rider_id`.
- **Two riders.** The UI is built for a pair. The data model (one row per
  rider) would extend to a bunch, but the gap display assumes one other rider.

## Layout

```
App.tsx                     rider picker, then the gap screen
src/geo.ts                  haversine + point-to-segment projection
src/course.ts               generic polyline progress maths
src/route.ts                the hardcoded route, built on a course
src/simulation.ts           virtual riders, shared by both simulators
src/useRiderGap.ts          GPS watch, publishing, realtime, gap derivation
src/components/             gap screen, rider cards, route track
supabase/schema.sql         table, realtime publication, RLS policies
scripts/import-gpx.ts       turns a GPX trace into src/route.ts
scripts/simulate-rider.ts   bot that publishes a second rider
scripts/verify-route.ts     geometry and simulation checks
```
