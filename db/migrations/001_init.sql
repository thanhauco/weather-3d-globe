-- TimescaleDB schema for the weather intelligence dashboard.
-- Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ---------------------------------------------------------------------------
-- Reference data: cities we track around the globe.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id          INTEGER PRIMARY KEY,
  name        TEXT        NOT NULL,
  country     TEXT        NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  population  INTEGER     NOT NULL DEFAULT 0,
  tz_offset   INTEGER     NOT NULL DEFAULT 0  -- approximate UTC offset in hours
);

-- ---------------------------------------------------------------------------
-- Time-series fact table. Each row is one hourly reading (observed or forecast)
-- for one city. This becomes a TimescaleDB hypertable partitioned by time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS weather_readings (
  time          TIMESTAMPTZ      NOT NULL,
  city_id       INTEGER          NOT NULL REFERENCES cities (id),
  temp_c        DOUBLE PRECISION NOT NULL,
  feels_like_c  DOUBLE PRECISION NOT NULL,
  humidity      DOUBLE PRECISION NOT NULL,  -- %
  wind_kph      DOUBLE PRECISION NOT NULL,
  pressure_hpa  DOUBLE PRECISION NOT NULL,
  precip_mm     DOUBLE PRECISION NOT NULL,
  cloud_pct     DOUBLE PRECISION NOT NULL,
  condition     TEXT             NOT NULL,  -- clear | clouds | rain | snow | storm
  is_forecast   BOOLEAN          NOT NULL DEFAULT FALSE
);

-- Turn it into a hypertable (time-partitioned). Daily chunks keep each
-- time-range query scanning only the relevant partition.
SELECT create_hypertable(
  'weather_readings',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists       => TRUE
);

-- The slider hits "all cities at a given instant" and "one city across a range".
CREATE INDEX IF NOT EXISTS idx_readings_city_time
  ON weather_readings (city_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_readings_time_city
  ON weather_readings (time DESC, city_id);
