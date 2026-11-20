# Migration status

This repository is a separate open-source-oriented project derived from an operational Cloudflare job radar. The original local project and production Worker are unchanged.

## Completed foundations

- Replaced the original 2,555-line Worker with a minimal Cloudflare composition root and separately owned HTTP, Cron, Workflow, AI, collection, transport and health modules.
- Verified byte-for-byte SHA-256 body parity of 63 unchanged declarations, 32 unchanged durable Workflow action bodies and both original event handlers, and added cycle-safe import graph checks.
- Ran bundled Worker in a local Cloudflare-compatible runtime for HTTP/auth/Inbox smoke tests.

- Separate Git repository and domain-oriented source folders; old deployment and account material moved to ignored `.local-migration/`.
- Schema-v2 config with independent `jobs` and `leads` profiles, criteria and source lists.
- Private user config ignored by Git, anonymous public example and strict configuration validation; unsupported secrets rejected in JSON.
- AI job and client-lead prompts separated; client commercial-intent scoring has independent thresholds.
- Optional OneAIHUB: browser and local computer configured separately, runtime VPC/credential availability checked and browser Workflows skipped when unavailable.
- DOU searches, job boards, community feeds and Reddit searches configurable without copying another person's private preferences.
- Original source-specific handler and Workflow exports retained; no deliberate loss of active HTTP routes or D1 schema.
- Offline tests for profile isolation, optional gateway, sources, scoring, DOU rotation, source filtering and commercial buyer evidence; Wrangler dry-run compilations for private/public profiles.

- Migrated 37 manual Workflow actions into five domain modules, all Telegram command views, separate Reddit browser transport/post parser/D1 persistence and shared verified delivery.
- Reconciled all 42 original active JavaScript files and 26 HTTP route signatures; preserved the independent VPC connectivity probe and Reddit SQL diagnostic.
- Tests were intentionally not run after this full code migration.

## Remaining before publication or production

1. Extend explicit D1 repositories for remaining inline SQL in the now-extracted HTTP, AI and Workflow services.
2. Add HTTP/D1/Workflow integration tests, golden AI/Telegram fixtures, error and recovery injection, and independent staging environment.
3. Add multilingual Inbox and notification presentation; some existing user-facing strings remain Ukrainian.
4. Finish a source-specific heuristic audit; not all job categories outside technical roles are yet supported by generic first-pass filters.
5. Confirm selected Workers AI model response compatibility and realistic Cloudflare quota/cost bounds.
6. Review source licenses, dependency supply chain, access controls and safety of optional local-computer permissions.
7. Choose a public LICENSE, run privacy scan and publish only a reviewed Git history.
8. Perform deliberate rollout with D1 backup, stop-old/start-new Cron transition, telemetry and rollback exercise.

**Do not claim 100% production functional parity until these gates pass.**

## Privacy migration

Bot/chat identities, private source lists, source polling intervals, Reddit community priorities, skill filters and source exclusion rules have been moved to a local profile excluded from Git. Secrets remain in Cloudflare environment bindings. The anonymized public example provides safe defaults.

There are now 44 offline tests and a separate hash-locked manifest for deliberately changed runtime and Workflow code. Live Cloudflare staging and production integration verification are still pending; the old deployed Worker remains untouched.
