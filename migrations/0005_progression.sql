-- M5: load auto-progression. Per-set RIR + note; per-plan progression scheme.
-- Columns mirror src/db/schema.ts and functions/sync/[[route]].ts TABLES.

ALTER TABLE setlogs ADD COLUMN rir INTEGER;  -- reps-in-reserve 0-5, NULL = not recorded
ALTER TABLE setlogs ADD COLUMN note TEXT;    -- optional per-set note
ALTER TABLE plans ADD COLUMN scheme TEXT;    -- 'double' | 'linear', NULL = double default
