-- Post-M8: user profile. Adds name + dob (YYYY-MM-DD) and makes passwordHash NULLABLE so Google
-- accounts get a local row too (identity is still the JWT `sub`; Google users have no password).
-- SQLite can't drop NOT NULL in place → rebuild the table. Editing name/dob/email/password
-- re-mints the JWT (functions/auth/account.ts). Existing rows get name/dob = NULL (login falls
-- back to email for the display name until the user sets one).
CREATE TABLE users_new (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT,
  name         TEXT,
  dob          TEXT,
  createdAt    TEXT NOT NULL
);
INSERT INTO users_new (id, email, passwordHash, createdAt)
  SELECT id, email, passwordHash, createdAt FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
