# Architecture — modular Cloudflare Radar

## Composition and execution boundaries

`src/index.js` is the stable public Cloudflare entrypoint. It re-exports the default handler and all three Workflow classes from the **minimal** `src/app/worker.js` composition root. The root wires `scheduled` and `handleFetch` and contains no D1 SQL, AI prompts, Telegram networking, HTML or collector logic.

### HTTP and authentication

- `src/http/router.js` owns the HTTP dispatch tree and protected admin endpoints.
- `src/http/auth.js` manages signed Inbox authentication.
- `src/http/inbox-view.js` owns Inbox HTML and CSS.
- `src/http/telegram-webhook.js` handles Telegram commands.
- `src/http/legacy-evaluate.js` retains the authenticated legacy evaluation endpoint.
- `src/http/responses.js` owns response helpers.

### Data collection and AI

- `src/features/discovery/source-fetch.js` implements RSS/API source adapters.
- `src/features/discovery/job-collector.js` owns D1 queue ingestion and collection cadence.
- `src/features/jobs/job-preselect.js` owns cheap vacancy eligibility checks.
- `src/features/jobs/scan-service.js` orchestrates collection + AI assessment.
- `src/ai/job-evaluation-service.js` owns Workers AI evaluation, batches and D1 result persistence.
- `src/features/prospects/triage-service.js` performs evidence-based client qualification.
- `src/platform/meta.js`, `src/platform/hash.js` and `src/platform/runtime-utils.js` provide shared persistence/formatting utilities.

### Delivery, health and Workflow

- `src/features/delivery/telegram-transport.js` owns Telegram HTTP I/O and verification.
- `src/features/delivery/job-notifications.js` owns vacancy/review alerts.
- `src/features/delivery/lead-notifications.js` owns prospect and commercial evidence delivery. The old `notification-service.js` is a small compatibility re-export facade.
- `src/features/observability/health-service.js` owns stale-workflow detection and alerts.
- `src/scheduler/scheduled-handler.js` contains the original five-minute and hourly Cron dispatch logic.
- `src/workflows/manual-radar.js` owns the durable manual Workflow class and named actions.
- `src/features/dou` and `src/features/reddit` provide independently configured optional browser Workflows.

Retired Upwork OAuth/import/probe actions are removed from the runtime. Manual upwork_* action names remain explicitly disabled (no source scans). Historical D1 rows and standalone eligibility/competition policy tests are preserved.

## Profile and configuration boundary

`scripts/generate-config.mjs` validates JSON schema v2 and produces the Git-ignored `src/config/radar.generated.js`. The public `jobs` and `leads` profiles are independent. The generated object intentionally preserves temporary aliases (`profile/search/sources` for jobs; `reddit/community` for leads) until all legacy modules use the nested schema directly.

OneAIHUB is not part of core RSS/API collection. `src/integrations/oneaihub/capabilities.js` validates explicit browser and separate PC permissions, VPC availability and secret bindings before any browser Workflow runs.

## Proof of structural preservation

Structural regression tests preserve unchanged declarations, Workflow action bodies and Cloudflare handlers via SHA-256. Retired Upwork-only declarations were removed from the active manifest. Intentional changes are documented in the reviewed behavior-changes fixture; prior Git commits preserve the original inventory.

`npm run check:architecture` checks module parsing, imports, the import dependency graph (no cycles), the composition root, and module size. `npm run ci` includes this check and all offline tests. `npm run build:check` and `npm run test:runtime` validate the compiled Worker inside a local Cloudflare-compatible runtime without production secrets.

Manual Workflow commands are dispatched through four action modules, preserving original Cloudflare step names, options and action bodies. Reddit MCP transport, thread parsing and D1 queueing, Telegram inbound HTTP and cross-pipeline delivery are also independently owned. See the functional inventory document for exact correspondence. Module extraction does **not** constitute full production behavioral equivalence; verify all integrations on staging before the cutover.

## Detailed source correspondence

See [Functional inventory](functional-inventory.md) for all active original source files, Workflow commands, HTTP routes and auxiliary VPC diagnostics. Original SQL remains with its owning feature rather than risking query behavior changes during migration.
