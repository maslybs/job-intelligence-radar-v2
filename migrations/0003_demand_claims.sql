-- Non-destructive extension: reserve each client lead before Telegram I/O.
CREATE TABLE IF NOT EXISTS demand_signal_claims (
  job_id TEXT PRIMARY KEY NOT NULL,
  slot TEXT NOT NULL,
  day TEXT NOT NULL,
  state TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  sent_at TEXT
);
-- Backfill previously delivered leads so they can never be sent a second time.
INSERT OR IGNORE INTO demand_signal_claims(job_id,slot,day,state,claimed_at,sent_at)
SELECT job_id,slot,day,'sent',sent_at,sent_at FROM demand_signals_sent;
