-- M7: readiness check-ins (C5), per-user RxDB-synced. One row per day (userId_date).
-- Columns mirror src/db/schema.ts and functions/sync/[[route]].ts TABLES. sleep/soreness/energy are
-- 0..2 taps; the 0–100 score + load factor are derived client-side (src/lib/readiness.ts), never stored.

CREATE TABLE IF NOT EXISTS readiness (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL,
  date      TEXT NOT NULL,   -- 'YYYY-MM-DD'
  sleep     REAL NOT NULL,   -- 0..2, higher = more recovered
  soreness  REAL NOT NULL,   -- 0..2, higher = fresher
  energy    REAL NOT NULL,   -- 0..2, higher = more energised
  note      TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_readiness_pull ON readiness (userId, updatedAt, id);
