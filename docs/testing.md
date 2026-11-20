# Validation and tests

`npm run ci` first generates the chosen private or public configuration, checks JS syntax/relative imports and verifies that the checked-in Wrangler configuration cannot target the original production Worker or D1, then runs the offline Node test suite. Network access through global `fetch` is rejected unless explicitly mocked. `npm run build:check` uses Wrangler `--dry-run`, which compiles without uploading the Worker.

`tests/test-profile-separation.mjs` proves that job prompts contain only candidate facts and client-lead prompts contain only consulting facts, with independent scoring decisions. `tests/test-oneaihub-optional.mjs` proves that the gateway, browser and local computer remain unavailable unless separately configured and actually connected. DOU tests cover configurable search rotation. Prospect tests retain strict evidence-based commercial classification. Source fixtures are synthetic; raw third-party advertising content is not distributed.

Run both configurations before release:

```bash
npm run ci
npm run build:check

# Anonymous example (without your own config)
RADAR_CONFIG_FILE=config/does-not-exist.json npm run ci
RADAR_CONFIG_FILE=config/does-not-exist.json npm run build:check

# Restore your private generated settings:
npm run config:generate
```

## Verified architecture and runtime gates

- npm run check:architecture: resolves imports and ensures no cycles or oversized hand-authored modules.
- tests/test-refactor-parity.mjs: SHA-256 checks for unchanged declarations/Workflow actions and reviewed behavior-change hashes for deliberately modified handlers.
- npm run test:runtime (after npm run build:check): bundled Worker smoke tests for health, protected admin, Inbox, retired Upwork, optional OneAIHUB, signed login and Reddit diagnostic route.
- npm run audit:public: privacy scan of staged files; local user config and historical backups stay ignored.

The local Miniflare workerd packaged with the pinned Wrangler version only supports compatibility date 2026-05-03; the smoke fixture uses this local-only date. Production compatibility date remains 2026-09-22. These checks do not substitute for Cloudflare staging with the actual compatibility date.

A clean checkout without private files should also pass with `npm ci`, `npm run ci` and `npm run build:check`.

**Unit tests and a successful Wrangler bundle do not prove production parity.** Required staging gates are listed in [Feature parity](feature-parity.md). In particular test HTTP authentication, Telegram callbacks, D1 schema/leases, scheduled retries, AI response compatibility and the connected/unavailable OneAIHUB paths before enabling a real Cron schedule.

## Other verification gates

## Verified portability baseline

- 50/50 offline tests pass with both local private and anonymous sample profiles.
- Both configurations pass Wrangler build:check; anonymous sample passes nine real bundled Worker HTTP smoke scenarios.
- The core migration was applied twice and insert/update smoke tested on a fresh SQLite database.
- Unchanged legacy declaration hashes are preserved in tests/fixtures/worker-structural-baseline.json; intentional portability edits are SHA-256 locked in tests/fixtures/intentional-behavior-changes.json.
- New regression tests cover separated jobs/client profiles, global AI budget contention, public profile privacy and Telegram delivery ambiguity.
- Real Cloudflare staging with Workflows, scheduled Crons, live AI and Telegram delivery is still unverified. No production migration has been performed.
