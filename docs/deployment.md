# Safe deployment, staging and rollback

**Never deploy this project's sample Wrangler config directly over an existing production radar.** It has no Cron triggers, no active Reddit or DOU browser binding, a unique non-production Worker name and a dummy D1 UUID. A successful `--dry-run` is not a live deployment.

Before a staging deployment: create an independent Cloudflare Worker, D1 database and three separate Workflow bindings; use a test Telegram bot/chat and test secrets. Supply a separate validated private config with the staging instance's `app.publicBaseUrl`. If testing OneAIHUB, connect an explicitly authorized VPC/browser session and verify that local filesystem and command permissions are not granted implicitly. For anyone without OneAIHUB, leave those capabilities disabled and verify normal public-source collection.

Characterize HTTP routes, D1 migrations/transactions, Cron timing, Workflow retries, source outage handling, scoring, client-intent AI, Telegram and deduplication on isolated staging data. Repeat with gateway unavailable and confirm that only optional browser scans are skipped.

For an eventual production switch: record the existing deployment/version and D1 backup, preserve all required secrets and bindings, disable the old Cron before enabling the new scheduler, then verify health and rollback. **Do not run two schedulers against one D1 / Telegram destination simultaneously.**

Production status on 2026-11-20: v2 is already running on the existing Worker and D1. The old Worker version, SQL backup and rollback manifest are retained in the ignored local migration directory. Never remove the SQL export or rollback manifest during cleanup.
