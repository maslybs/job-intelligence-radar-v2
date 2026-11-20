# Safe deployment, staging and rollback

**Never rename the template Worker to an existing production radar or reuse an existing D1.** The public template uses a fresh D1 database name and no database ID, an hourly Cron, Workers AI, and three Workflow bindings. Optional Reddit and DOU browser features and Telegram remain disabled. A successful `--dry-run` is not a live deployment. Use the [one-click guide](one-click.md) when installing from GitHub.

Before a staging deployment: create an independent Cloudflare Worker, D1 database and three separate Workflow bindings; use a test Telegram bot/chat and test secrets. Supply a separate validated private config with the staging instance's `app.publicBaseUrl`. If testing OneAIHUB, connect an explicitly authorized VPC/browser session and verify that local filesystem and command permissions are not granted implicitly. For anyone without OneAIHUB, leave those capabilities disabled and verify normal public-source collection.

Characterize HTTP routes, D1 migrations/transactions, Cron timing, Workflow retries, source outage handling, scoring, client-intent AI, Telegram and deduplication on isolated staging data. Repeat with gateway unavailable and confirm that only optional browser scans are skipped.

For an eventual production switch: record the existing deployment/version and D1 backup, preserve all required secrets and bindings, disable the old Cron before enabling the new scheduler, then verify health and rollback. **Do not run two schedulers against one D1 / Telegram destination simultaneously.**

If you already run a radar, keep that deployment and its existing D1 outside this installation. For migrations or replacements, make your own backups and rollback plan; a public-template install is not a production migration.
