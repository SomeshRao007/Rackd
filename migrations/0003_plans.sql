-- M3: workout plans (per-user, RxDB-synced) + the locked plan-day on a session,
-- + shared_plans (server-only IMMUTABLE snapshots — the one cross-user surface).
-- Columns mirror src/db/schema.ts and functions/sync/[[route]].ts TABLES.

CREATE TABLE IF NOT EXISTS plans (
  id              TEXT PRIMARY KEY,
  userId          TEXT NOT NULL,
  name            TEXT NOT NULL,
  days            TEXT NOT NULL,   -- JSON: [{id,label,slots:[{id,label,exercisePool:[]}]}]
  sourceShareCode TEXT,
  createdAt       TEXT NOT NULL,
  updatedAt       TEXT NOT NULL,
  deletedAt       TEXT
);
-- pull walks (updatedAt, id) per user — the checkpoint tuple
CREATE INDEX IF NOT EXISTS idx_plans_pull ON plans (userId, updatedAt, id);

-- The locked plan day (JSON) on the session it instances; NULL for free-log sessions.
ALTER TABLE sessions ADD COLUMN plannedDay TEXT;

-- Immutable shared snapshot. Single-writer (the owner), keyed by (ownerUserId, planId)
-- so a stable shareCode survives re-publish. No LWW — snapshots never merge.
CREATE TABLE IF NOT EXISTS shared_plans (
  shareCode   TEXT PRIMARY KEY,
  ownerUserId TEXT NOT NULL,
  planId      TEXT NOT NULL,
  name        TEXT NOT NULL,
  planJson    TEXT NOT NULL,
  createdAt   TEXT NOT NULL,
  updatedAt   TEXT NOT NULL,
  UNIQUE (ownerUserId, planId)
);
