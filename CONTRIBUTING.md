# Contributing

Run `npm ci`, `npm run ci` and `npm run build:check` before opening a pull request.

Keep employment matching and consulting/client qualification independent. New source adapters must be opt-in through config and have deterministic tests with synthetic data. Do not add personal profiles, Cloudflare account IDs, customer information, private browser sessions or credentials to the repository.

Never introduce unapproved access to the user's computer. Browser, filesystem and command execution are distinct permissions; default all optional integrations to off. No scraping restrictions, authentication challenges or publisher limits should be bypassed.

Changes to D1 schema, scheduled Cron handlers, Workflow identifiers and Telegram delivery need isolated staging tests and a rollback strategy. Report security issues privately after a security advisory channel is established.
