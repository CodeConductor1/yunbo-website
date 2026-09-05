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

Open it on **two physical devices** — GPS is the input, so simulators won't
produce movement. On each device pick a *different* rider. Both should show
`Live` once realtime connects.

> Changing `.env` requires `npx expo start -c` to clear the bundler cache;
> `EXPO_PUBLIC_` values are inlined at build time.

## Changing the route

Everything route-specific lives in `src/route.ts`. Replace the `ROUTE` array
with your own ordered `{ lat, lng }` points and change `ROUTE_ID` so old rows
don't mix with new ones. Nothing else needs to change — lengths, progress and
the track UI all derive from that array.

The bundled route approximates the Central Park loop (~9.9 km, counter-clockwise).

## Verifying the math

```bash
npm run verify   # route geometry checks, no device or network needed
npm run typecheck
```

The geometry is the part worth testing: if progress along the course is wrong,
every gap the app reports is wrong. `npm run verify` checks haversine against a
known distance, route length against the real loop, monotonic progress along
the course, midpoint projection, off-route detection, and gap arithmetic.

## Known limits

- **One lap.** The route is treated as a course from start to finish. A rider
  starting a second lap reads as being back at 0 m. Multi-lap tracking needs a
  lap counter on top of progress.
- **Loop ambiguity at the start line.** Start and finish overlap, so a fix
  there is genuinely ambiguous. The app uses the rider's previous position to
  decide; with no history (a cold launch) it assumes the start.
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
src/route.ts                the hardcoded route and progress-along-it
src/useRiderGap.ts          GPS watch, publishing, realtime, gap derivation
src/components/             gap screen, rider cards, route track
supabase/schema.sql         table, realtime publication, RLS policies
scripts/verify-route.ts     geometry checks
```
