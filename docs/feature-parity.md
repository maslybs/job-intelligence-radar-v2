# Feature parity and migration gates

This is a **migration tracker**, not a declaration of production equivalence. The original Cloudflare Worker and its D1 database, Cron schedule, secrets and Telegram destination remain unchanged.

| Feature carried from existing radar | Current v2 state | Proof still required |
| --- | --- | --- |
| Job source collection (RSS, ATS, API, marketplaces) | Moved into discovery modules, configurable list | Each adapter end-to-end on staging |
| Job deduplication, queue and D1 metadata | Original SQL and workflow logic retained | Staging D1 schema and migration fixtures |
| AI fit / priority, interview gaps and salary filters | Job-specific profile prompt, configurable thresholds, original output fields | Recorded AI parity and model format |
| DOU discovery and detail | Original browser workflow retained, configurable queries | OneAIHUB staging browser + DOU policy tests |
| Reddit collection and adaptive discovery | Browser workflow retained; lead profile and queries separate | Staging authorization, retries, rate-limit handling |
| Community technical-problem discovery | Sources configurable in lead pipeline | Community RSS contract tests |
| Buyer qualification and commercial evidence | Lead-specific AI instructions; original intent rules retained | Golden datasets for real vs speculative buyer intent |
| Daily demand digest, direct-contact and prospect review | Original handlers retained | D1 + notification integration tests |
| Telegram delivery, digests, commands, webhook | Original authenticated handlers retained; feature flag and configurable URL | Test-chat snapshots, duplicate prevention and webhook checks |
| Inbox, administrative routes and authentication | Original routes retained | HTTP route and permission characterization |
| Cron every five minutes + hourly Workflow | Handler logic retained in source; local Wrangler Cron disabled | Separate staging Cron, leases, retry/catch-up/rollback |
| Daily AI budget, error detection and health checks | Original modules retained | Real Cloudflare limits and failure-injection tests |
| OneAIHUB + browser + local PC | Optional, guarded capability detection | Connected private environment tests; no privilege escalation |
| Independent user profiles | Config schema v2 with separate jobs and leads | Public and private config CI plus staging tests |
| Retired Upwork health check | No active gateway/scan; retired broker/probe handlers removed, action names explicitly disabled | Ensure no stale alerts after production cutover |

## Release requirements

1. All current offline tests pass in both anonymous and private configurations.
2. Wrangler dry-run builds each configuration.
3. HTTP and D1 tests run against **independent staging data**.
4. Compare recorded inputs in the original Worker and v2, including AI, geo, scoring, Reddit source priority and Telegram outputs.
5. Test OneAIHUB present and absent; absence must disable only optional browser/PC features.
6. Exercise Cron, Cloudflare Workflow resume/retries, deduplication, stale health alerts and Telegram callback handling.
7. Review Cloudflare bindings/permissions and secrets. Complete open-source privacy and dependency audit and choose LICENSE.
8. Capture original deployment ID, D1 backup and rollback procedure before production switch. Never run two active schedulers against the same D1.

The original implementation remains the source of truth for reliability until these gates pass. **Do not deploy v2 into production yet.**
