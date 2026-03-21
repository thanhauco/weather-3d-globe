-- Enable idempotent upserts of hourly readings so the "refresh latest data"
-- button and the every-10-minutes cron can update rows in place.
-- A unique index on a hypertable must include the time partition column.
CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_city_time
  ON weather_readings (city_id, time);
