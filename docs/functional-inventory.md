# Radar v2 — migration and functional inventory

This is a source-level transfer inventory, not a production certification. The original Worker and D1 stay untouched.

## File correspondence

| Original file | New module |
| --- | --- |
| `src/actionable-review.js` | `src/features/jobs/actionable-review.js` |
| `src/ai-batch-recovery.js` | `src/features/ai/ai-batch-recovery.js` |
| `src/community-leads.js` | `src/features/discovery/community-leads.js` |
| `src/community-reply-check.js` | `src/features/reddit/community-reply-check.js` |
| `src/competitive-review.js` | `src/features/jobs/competitive-review.js` |
| `src/demand-discovery.js` | `src/features/prospects/demand-discovery.js` |
| `src/direct-contact-digest.js` | `src/features/delivery/direct-contact-digest.js` |
| `src/direct-source-verification.js` | `src/features/discovery/direct-source-verification.js` |
| `src/dou-browser-source.js` | `src/features/dou/dou-browser-source.js` |
| `src/dou-browser-workflow.js` | `src/features/dou/dou-browser-workflow.js` |
| `src/dou-review.js` | `src/features/dou/dou-review.js` |
| `src/eligibility-review.js` | `src/features/jobs/eligibility-review.js` |
| `src/fast-source-lane.js` | `src/features/scheduler/fast-source-lane.js` |
| `src/freelance-ua-filter.js` | `src/features/discovery/freelance-ua-filter.js` |
| `src/hourly-autonomy.js` | `src/features/scheduler/hourly-autonomy.js` |
| `src/hourly-health.js` | `src/features/observability/hourly-health.js` |
| `src/hourly-recovery.js` | `src/features/scheduler/hourly-recovery.js` |
| `src/index.js` | `src/index.js` |
| `src/job-detail.js` | `src/features/jobs/job-detail.js` |
| `src/job-message.js` | `src/features/delivery/job-message.js` |
| `src/job-strategy.js` | `src/features/jobs/job-strategy.js` |
| `src/manual-lead-digest.js` | `src/features/delivery/manual-lead-digest.js` |
| `src/opportunity-intelligence.js` | `src/features/ai/opportunity-intelligence.js` |
| `src/pipeline-isolation.js` | `src/features/scheduler/pipeline-isolation.js` |
| `src/practical-fit.js` | `src/features/jobs/practical-fit.js` |
| `src/prospect-commercial.js` | `src/features/prospects/prospect-commercial.js` |
| `src/prospect-intelligence.js` | `src/features/prospects/prospect-intelligence.js` |
| `src/prospect-priority.js` | `src/features/prospects/prospect-priority.js` |
| `src/reddit-adaptive.js` | `src/features/reddit/reddit-adaptive.js` |
| `src/reddit-direct-offer.js` | `src/features/reddit/reddit-direct-offer.js` |
| `src/reddit-expertise.js` | `src/features/reddit/reddit-expertise.js` |
| `src/reddit-mcp-workflow.js` | `src/features/reddit/reddit-mcp-workflow.js` |
| `src/reddit-tab-lifecycle.js` | `src/features/reddit/reddit-tab-lifecycle.js` |
| `src/reddit-thread-evidence.js` | `src/features/reddit/reddit-thread-evidence.js` |
| `src/reddit-thread-review.js` | `src/features/reddit/reddit-thread-review.js` |
| `src/remote-backend-source.js` | `src/features/discovery/remote-backend-source.js` |
| `src/rss-date.js` | `src/features/discovery/rss-date.js` |
| `src/source-accessibility.js` | `src/features/discovery/source-accessibility.js` |
| `src/upwork-competition.js` | `src/integrations/upwork/upwork-competition.js` |
| `src/upwork-location.js` | `src/integrations/upwork/upwork-location.js` |
| `src/vpc-connectivity-probe.js` | `src/integrations/oneaihub/vpc-connectivity-probe.js` |
| `src/worker-healthfix.js` | `src/app/worker.js + dedicated submodules` |

## Runtime responsibilities

- HTTP admin API, Inbox, signed sessions and Telegram webhook: `src/http/`.
- Cron scheduling, source windows and hourly Workflow recovery: `src/scheduler/scheduled-handler.js`.
- Manual Cloudflare Workflow: `src/workflows/manual-radar.js` delegates through `src/workflows/action-registry.js` to four active action modules.
- Retired upwork_* actions are rejected by the manual Workflow guard before dispatch. Active scheduler, jobs, leads, and Telegram actions are retained.
- Reddit Workflow and OneAIHUB MCP transport: `src/features/reddit/reddit-mcp-workflow.js` and `reddit-mcp-client.js`. Candidate parsing and D1 queue are independently separated.
- DOU browser search and extracted listing details remain in `src/features/dou/`.
- Source adapters, data ingestion, geofilter and AI evaluation: `src/features/discovery/`, `src/features/jobs/` and `src/ai/`.
- Telegram HTTP commands, lead previews and status: `src/http/telegram/`.
- Cross-pipeline verified notification, deduplication lease, message rendering, Telegram transport and D1 acknowledgements: `src/features/delivery/`.
- Separate jobs and leads profiles, browser/computer capability gating and configured source lists are preserved.
- Retired Upwork OAuth/import/probe/notify runtime has been removed; historical D1 data is not deleted. Standalone compatibility policy helpers remain for validation.
- Optional, independent VPC diagnostic is access-gated and separate from the main worker: `src/integrations/oneaihub/vpc-connectivity-probe.js`.

## Source correspondence summary

| Item | Static inventory |
| --- | --- |
| Original active JavaScript entries | 42 mapped, none missing |
| Manual Workflow action names | 37 / 37 |
| Telegram command action names | 7 / 7 |
| Explicit HTTP path string matches | 26 / 26 |
| Cloudflare entrypoints | scheduled, fetch, and 3 Workflow classes |
| Original Reddit SQL diagnostic | `scripts/sql/reddit-thread-query-validation.sql` |
| Private profile/source settings | Git-ignored `config/radar.config.json` |
| Anonymous open-source defaults | `config/radar.config.example.json` |

Source-level feature correspondence is complete. This alone does not verify runtime equivalence. Actual D1 schema, Workflow execution/replay, Telegram deliveries, model output differences and operational Cloudflare settings require a distinct staging cutover review.
