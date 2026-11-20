-- Additive migration for existing D1 installations; safe to reapply.
-- No changes to legacy jobs, outbox rows, tokens, or existing indexes.
CREATE TABLE IF NOT EXISTS telegram_delivery_retry_schedule (
  delivery_key TEXT PRIMARY KEY NOT NULL,
  next_retry_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_rate_limits (
  bucket TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
