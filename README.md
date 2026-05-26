# Global Forecast Predictor - 3D Weather Intelligence Dashboard

An interactive weather intelligence dashboard with a WebGL **3D Earth**, live
Open-Meteo weather, time travel, place search, global storm tracking, and a
natural-language weather Q&A box.

The app is built with **Next.js App Router**, **React Three Fiber / Three.js**,
**Tailwind CSS**, and **TimescaleDB**. It uses real data where possible and keeps
deterministic synthetic fallbacks so the globe and storm views remain useful even
when upstream feeds are quiet or unavailable.

## Implemented features

- **3D Earth dashboard** with satellite-style land/ocean rendering, night lights,
  stars, atmosphere, clouds, and a daylight terminator driven by UTC time.
- **Real weather markers** for a generated catalog of roughly 300 world cities
  from GeoNames, with zoom-aware marker density and local sun/moon weather icons.
- **Time-travel slider** covering stored history plus forecast hours, with play /
  pause animation and instant globe snapshot updates.
- **Place search** for any location on Earth through Open-Meteo geocoding, plus a
  live focused weather card with temperature, humidity, wind, cloud, pressure,
  precipitation, local time, and sunlight angle.
- **IP-based first-load location** so the globe can gently focus on the user's
  approximate city when the app starts.
- **Manual and scheduled refresh** through `/api/refresh`, with TimescaleDB
  upserts and continuous aggregate refreshes.
- **Storm View** button that opens a global tropical cyclone panel powered by
  GDACS feeds, including alert severity, wind speed, affected countries, movement
  speed, heading, observed track points, and forecast path points.
- **Storm visualization on the globe** with observed track lines, dashed forecast
  paths, coordinate nodes, and a pulsing active cyclone marker that the camera
  can focus automatically.
- **Natural-language weather Q&A** textbox for questions such as "why does
  Seattle get so much rain?". The backend can infer a place, fetch live
  Open-Meteo conditions, pull lightweight public web context, and optionally use
  an OpenAI-compatible chat model when `OPENAI_API_KEY` is configured.
- **Operational fallbacks** for weather and storms: failed Open-Meteo calls fall
  back to synthetic readings, and the storm module can show high-fidelity sample
  cyclone tracks when no real global systems are active.

## Architecture

```text
Open-Meteo live weather/geocoding
        |
        |--> lib/openMeteo.ts       current, hourly, forecast, geocoding support
        |--> scripts/ingest.ts      seed TimescaleDB with city history/forecast
        |--> lib/refresh.ts         upsert latest readings + refresh aggregates
        |
GDACS tropical cyclone feed
        |
        |--> lib/storms.ts          active storm summaries, tracks, movement math
        |
Public web context / optional LLM
        |
        |--> /api/ask               natural-language weather explanation endpoint
        |
Next.js App Router API routes
        |--> /api/meta              slider time window
        |--> /api/snapshot          globe city snapshot at instant T
        |--> /api/series            per-city trend and forecast series
        |--> /api/place             live weather for searched/focused place
        |--> /api/geocode           place search
        |--> /api/iploc             first-load IP location
        |--> /api/refresh           manual/cron data refresh
        |--> /api/storms            active cyclone list
        |--> /api/storms/track      one cyclone's observed/forecast track
        |--> /api/ask               natural-language question answering
        |
React dashboard
        |--> components/Globe.tsx       Three.js Earth, markers, storm paths
        |--> components/Dashboard.tsx   app coordination and controls
        |--> components/StormPanel.tsx  cyclone list and track diagnostics
        |--> components/WeatherAskBox.tsx natural-language Q&A textbox
        |
TimescaleDB
        |--> cities
        |--> weather_readings       hypertable, 1-day chunks
        |--> weather_6h             continuous aggregate
        |--> weather_daily          continuous aggregate
```

## Quick start

Prerequisites: Node 18+ and Docker for local TimescaleDB.

```bash
npm install

# 1. Start TimescaleDB locally. Postgres listens on port 5433.
docker compose up -d

# 2. Apply schema and seed the city catalog with history + forecast data.
npm run db:setup

# 3. Run the dashboard.
npm run dev
# open http://localhost:3000
```

## Managed TimescaleDB / Tiger Cloud

1. Create a TimescaleDB service.
2. Put its connection string in `.env.local`:

   ```env
   DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/dbname?sslmode=require
   ```

3. Run `npm run db:setup`, then `npm run dev`. SSL is enabled automatically for
   non-localhost database hosts.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | local Docker DB | Postgres/TimescaleDB connection string. |
| `SEED_CITIES` | all generated cities | Number of generated cities to seed. The generated catalog is roughly 300 cities by default. |
| `HISTORY_DAYS` | `10` | Days of historical hourly data to ingest. |
| `FORECAST_DAYS` | `3` | Days of forecast hourly data to ingest. |
| `SYNTH_ONLY` | unset | Set to `1` to skip Open-Meteo during ingest and use synthetic readings. |
| `CRON_SECRET` | unset | If set, `/api/refresh` requires this token as Bearer auth or `?secret=`. |
| `REFRESH_INTERVAL_MIN` | `10` | Interval for `npm run cron`. |
| `CITY_TARGET` | `300` | Target city count when regenerating [lib/cities.ts](lib/cities.ts) with `npm run gen:cities`. |
| `OPENAI_API_KEY` | unset | Optional. Enables LLM wording for `/api/ask`; without it the route uses deterministic weather/climate explanations. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Optional OpenAI-compatible API base URL. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Optional model name for natural-language answers. |

## Data and refresh behavior

Weather data comes from Open-Meteo via [lib/openMeteo.ts](lib/openMeteo.ts):

- **Database seeding**: [scripts/ingest.ts](scripts/ingest.ts) batch-fetches
  hourly weather for the generated city catalog and writes it into the
  TimescaleDB hypertable.
- **Searched and located places**: `/api/place`, `/api/geocode`, and `/api/iploc`
  fetch live data on demand.
- **Refresh button**: the top-right "Refresh data" control calls
  `POST /api/refresh`, which upserts latest readings and refreshes aggregates.
- **Cron refresh**: [vercel.json](vercel.json) schedules `/api/refresh` every
  10 minutes on Vercel, and `npm run cron` does the same for a local or always-on
  host.

```bash
npm run cron
# REFRESH_INTERVAL_MIN=5 npm run cron
```

When exposing `/api/refresh` publicly, set `CRON_SECRET` and call the route with
`Authorization: Bearer <secret>` or `?secret=<secret>`.

## Storm tracking

Storm View uses [lib/storms.ts](lib/storms.ts) and GDACS tropical cyclone data to
surface active global systems. It computes track movement with spherical
geodesy, including distance, bearing, and forward speed. The UI shows:

- current active cyclone list;
- Red, Orange, or Green alert level;
- maximum sustained wind;
- threatened countries;
- observed and forecast coordinate steps;
- movement heading and speed;
- globe-rendered observed paths, dashed forecast paths, and active cyclone pins.

When GDACS has no active systems, the module can provide realistic sample storm
tracks so the visualization and forecast-path workflow remain demonstrable.

## Natural-language weather Q&A

The Q&A textbox is rendered by
[components/WeatherAskBox.tsx](components/WeatherAskBox.tsx) and posts to
`/api/ask`.

The route can:

- infer a place mentioned in the question using Open-Meteo geocoding;
- use the currently focused dashboard place for contextual questions;
- fetch live Open-Meteo weather for the inferred/focused coordinate;
- pull lightweight public web context for climate explanations;
- optionally call an OpenAI-compatible chat model when `OPENAI_API_KEY` exists;
- fall back to concise deterministic explanations when no LLM key is configured.

Example questions:

- `Why does Seattle get so much rain?`
- `Is it windy in Tokyo right now?`
- `Why is Dubai so hot?`
- `Will this place feel humid?`

## API reference

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/meta` | GET | Min/max/now time window for the slider. |
| `/api/snapshot` | GET | All city readings at instant `T`. |
| `/api/series` | GET | Per-city trend and forecast series. |
| `/api/place` | GET | Live weather for a lat/lon place. |
| `/api/geocode` | GET | Place search through Open-Meteo geocoding. |
| `/api/iploc` | GET | IP-based approximate location for first load. |
| `/api/refresh` | POST/GET | Pull latest Open-Meteo readings into TimescaleDB. |
| `/api/storms` | GET | Active tropical cyclone summaries. |
| `/api/storms/track` | GET | Detailed track for one cyclone event/episode. |
| `/api/ask` | POST | Natural-language weather and climate Q&A. |

## Why TimescaleDB

The globe needs fast time-slice queries for all cities, while city details need
trend ranges and forecast bands. TimescaleDB keeps those paths efficient:

- `weather_readings` is a hypertable partitioned by time, so snapshots only scan
  the relevant time chunks.
- `(city_id, time DESC)` supports fast nearest-reading lookups and refresh
  upserts.
- `weather_6h` and `weather_daily` continuous aggregates keep trend charts from
  repeatedly scanning raw hourly rows.

## Project layout

```text
app/                  Next.js page and API routes
components/           Dashboard, Globe, Sidebar, StormPanel, WeatherAskBox, controls
db/migrations/        TimescaleDB schema, aggregates, indexes
lib/                  db pool, city catalog, weather, storm, synth, geo, types
scripts/              migrate, ingest, city generation, cron refresh
docker-compose.yml    local TimescaleDB
vercel.json           Vercel cron schedule for /api/refresh
```

## Useful commands

```bash
npm run build        # production build + type check
npm run db:migrate   # apply migrations
npm run db:ingest    # seed weather readings
npm run db:setup     # migrate + ingest
npm run gen:cities   # regenerate city catalog from GeoNames
npm run cron         # run recurring refresh loop
```
