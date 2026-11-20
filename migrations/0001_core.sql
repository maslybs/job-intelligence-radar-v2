-- Fresh-install schema for a new, independent Cloudflare D1 database.
-- No user data, historical records, account identifiers, or credentials.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY NOT NULL,
  last_success INTEGER,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  score INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'P3',
  kind TEXT NOT NULL DEFAULT 'unclear',
  geo TEXT NOT NULL DEFAULT 'unknown',
  engagement TEXT NOT NULL DEFAULT 'unknown',
  reason TEXT NOT NULL DEFAULT '',
  assessed_at TEXT,
  alerted_at TEXT,
  read_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  assessed INTEGER NOT NULL DEFAULT 0,
  kept INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS ai_budget_usage (
  day TEXT PRIMARY KEY NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  prospect_used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS telegram_delivery_outbox (
  delivery_key TEXT PRIMARY KEY NOT NULL,
  chat_id TEXT NOT NULL,
  state TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  sent_at TEXT,
  message_id INTEGER,
  error TEXT
);
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
CREATE TABLE IF NOT EXISTS demand_signal_claims (
  job_id TEXT PRIMARY KEY NOT NULL,
  slot TEXT NOT NULL,
  day TEXT NOT NULL,
  state TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs(state,attempts,discovered_at);
CREATE INDEX IF NOT EXISTS idx_jobs_source_time ON jobs(source,discovered_at);
CREATE INDEX IF NOT EXISTS idx_jobs_delivery ON jobs(alerted_at,priority,score);
CREATE INDEX IF NOT EXISTS idx_jobs_published ON jobs(published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_fingerprint ON jobs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
