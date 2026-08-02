-- M8.4: a custom exercise can now declare what KIND of movement it is, so a user-authored
-- stretch gets derived into a session's warm-up/cooldown exactly like a catalog one.
-- Borrows the catalog's own vocabulary (src/db/schema.ts exerciseSchema.category):
--   'stretching' = mobility move, '' = ordinary strength lift (what every existing row means).
-- Mirrors src/db/schema.ts customexercises v1 and functions/sync/[[route]].ts TABLES.

ALTER TABLE customexercises ADD COLUMN category TEXT;
