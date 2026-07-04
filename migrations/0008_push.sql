-- M7: Web Push subscriptions (Part G reminders). SERVER-ONLY state — NOT an RxDB-synced collection
-- (a push endpoint is device infrastructure, not user content). One row per browser push endpoint.
-- Populated by functions/push/subscribe.ts; read by a Cron Worker at deploy to send streak nudges.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint  TEXT PRIMARY KEY,          -- the browser push service URL (unique per device/browser)
  userId    TEXT NOT NULL,             -- forced from the JWT, never the client body
  p256dh    TEXT NOT NULL,             -- subscription public key (payload encryption)
  auth      TEXT NOT NULL,             -- subscription auth secret
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (userId);
