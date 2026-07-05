-- M8 R1: user-created custom exercises, per-user RxDB-synced (their own collection — the catalog
-- `exercises` is static/unsynced). Array fields (primaryMuscles/secondaryMuscles/instructions) ride
-- as JSON-string TEXT columns through the flat /sync handler, same as bodymetrics.measurements.
-- Columns mirror src/db/schema.ts and functions/sync/[[route]].ts TABLES.

CREATE TABLE IF NOT EXISTS customexercises (
  id               TEXT PRIMARY KEY,
  userId           TEXT NOT NULL,
  name             TEXT NOT NULL,
  primaryMuscles   TEXT NOT NULL,   -- JSON string[]
  secondaryMuscles TEXT,            -- JSON string[]
  equipment        TEXT,
  instructions     TEXT,            -- JSON string[]
  source           TEXT,            -- always 'custom'
  createdAt        TEXT NOT NULL,
  updatedAt        TEXT NOT NULL,
  deletedAt        TEXT
);
CREATE INDEX IF NOT EXISTS idx_customexercises_pull ON customexercises (userId, updatedAt, id);
