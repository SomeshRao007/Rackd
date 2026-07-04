-- M6: goals (R6/R7) + body metrics (Part G), per-user RxDB-synced.
-- Columns mirror src/db/schema.ts and functions/sync/[[route]].ts TABLES. Nested data (emphasis,
-- outcome, measurements) rides as JSON TEXT so it stays on the flat-column sync handler.

CREATE TABLE IF NOT EXISTS goals (
  id               TEXT PRIMARY KEY,
  userId           TEXT NOT NULL,
  type             TEXT NOT NULL,   -- 'hypertrophy' | 'strength' | 'fatloss'
  title            TEXT,
  emphasis         TEXT,            -- JSON array of muscle-group ids, or NULL
  targetMetric     TEXT NOT NULL,   -- 'volume' | 'e1rm' | 'bodyweight'
  targetExerciseId TEXT,            -- the lift, for e1rm goals
  targetValue      REAL NOT NULL,
  baselineValue    REAL,
  deadline         TEXT,            -- 'YYYY-MM-DD' or NULL
  status           TEXT NOT NULL,   -- 'active' | 'completed' | 'abandoned'
  outcome          TEXT,            -- JSON {finalValue,hitTarget,pct} stamped at close, or NULL
  createdAt        TEXT NOT NULL,
  updatedAt        TEXT NOT NULL,
  deletedAt        TEXT
);
CREATE INDEX IF NOT EXISTS idx_goals_pull ON goals (userId, updatedAt, id);

CREATE TABLE IF NOT EXISTS bodymetrics (
  id           TEXT PRIMARY KEY,
  userId       TEXT NOT NULL,
  date         TEXT NOT NULL,   -- 'YYYY-MM-DD'
  weightKg     REAL,            -- canonical kg, or NULL
  measurements TEXT,            -- JSON map {waist,chest,…} in cm, or NULL
  note         TEXT,
  createdAt    TEXT NOT NULL,
  updatedAt    TEXT NOT NULL,
  deletedAt    TEXT
);
CREATE INDEX IF NOT EXISTS idx_bodymetrics_pull ON bodymetrics (userId, updatedAt, id);
