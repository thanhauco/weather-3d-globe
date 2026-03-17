-- Continuous aggregates: pre-computed rollups so trend charts and the forecast
-- layer never rescan raw hourly rows. TimescaleDB keeps these materialized and
-- incrementally refreshed.

-- ---------------------------------------------------------------------------
-- Hourly is already our raw grain, so we roll up to 6-hour and daily buckets.
-- ---------------------------------------------------------------------------

-- 6-hour rollup: smooth series for the globe trend sparkline.
CREATE MATERIALIZED VIEW IF NOT EXISTS weather_6h
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('6 hours', time) AS bucket,
  city_id,
  avg(temp_c)        AS temp_c,
  avg(feels_like_c)  AS feels_like_c,
  avg(humidity)      AS humidity,
  avg(wind_kph)      AS wind_kph,
  avg(pressure_hpa)  AS pressure_hpa,
  sum(precip_mm)     AS precip_mm,
  avg(cloud_pct)     AS cloud_pct,
  bool_or(is_forecast) AS is_forecast
FROM weather_readings
GROUP BY bucket, city_id
WITH NO DATA;

-- Daily rollup: min/avg/max temperature drives the 10-day + 3-day forecast band.
CREATE MATERIALIZED VIEW IF NOT EXISTS weather_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  city_id,
  min(temp_c)        AS temp_min,
  avg(temp_c)        AS temp_avg,
  max(temp_c)        AS temp_max,
  avg(humidity)      AS humidity,
  avg(wind_kph)      AS wind_kph,
  sum(precip_mm)     AS precip_mm,
  avg(cloud_pct)     AS cloud_pct,
  bool_or(is_forecast) AS is_forecast
FROM weather_readings
GROUP BY bucket, city_id
WITH NO DATA;

-- Refresh policies keep the aggregates current as new readings land.
SELECT add_continuous_aggregate_policy('weather_6h',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);

SELECT add_continuous_aggregate_policy('weather_daily',
  start_offset      => INTERVAL '30 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE);
