# Job Intelligence Radar

A configurable job and potential-client discovery radar built for Cloudflare Workers, D1, Workflows and Workers AI.

**Development status:** this repository is an isolated migration from an operational radar. The modular, profile-driven build passes offline tests, local runtime smoke tests and Wrangler dry-runs for both private and anonymous public configurations. **Production equivalence has not yet been demonstrated in staging.** No public repository or new Cloudflare deployment has been created.

## Two independent discovery pipelines

**Jobs** evaluates job advertisements against a candidate's proven work, salary target, geography, English level, role preferences and realistic interview fit. Configure this in `jobs`.

**Client leads** discovers potential customers and business problems, then separately evaluates technical service fit and **evidence of paid intent**. A discussion or request for free help is not automatically a buyer. Configure `leads` with its *own* consulting profile, services, customers, commercial thresholds and discovery targets.

These two profiles must never implicitly inherit one another's skills, preferences or AI-scoring instructions.

## Installation

Requires Node.js 20+ and npm.

```bash
npm ci
npm run setup
# Edit config/radar.config.json for your own jobs and leads profiles.
npm run config:generate
npm run ci
npm run build:check
```

The user-specific `config/radar.config.json` and compiled `src/config/radar.generated.js` are **ignored by Git**. A fresh checkout builds from the anonymous `config/radar.config.example.json` by default, with three example job sources and browser/PC, Reddit, community and Telegram integrations disabled.

## Configuration overview

| JSON section | Controls |
| --- | --- |
| `jobs.profile` | Actual candidate experience, technologies, location, interview restrictions |
| `jobs.criteria` | Job types, regions, salary, excluded roles/technologies, score cutoffs |
| `jobs.sources.items` | Job boards, ATSs and public RSS feeds |
| `jobs.browserSources.dou` | Optional DOU browser search terms |
| `leads.profile` | Services, consulting proof, ideal customers, exclusions, contact policy |
| `leads.criteria` | Technical fit, commercial intent, evidence requirements |
| `leads.sources.reddit` | Optional Reddit terms, subreddits and expertise areas |
| `leads.sources.community` | Optional public business/problem RSS feeds |
| `integrations.oneaihub` | Optional private OneAIHUB browser and computer capabilities |
| `integrations.dou` | Optional DOU browser bridge |
| `ai`, `notifications`, `app` | Model, daily budgets, language, Telegram, instance URL |

Read [Configuration](docs/configuration.md), [Architecture](docs/architecture.md), [Full functional inventory](docs/functional-inventory.md), [Testing](docs/testing.md), and [Feature parity / migration](docs/feature-parity.md).

## Optional OneAIHUB and local PC

You **do not need** OneAIHUB or access to a local computer for public HTTP/RSS/ATS job collection. Browser-dependent workflows (DOU, private Reddit review) need a configured OneAIHUB VPC binding, credentials and explicit opt-in. If unavailable, they skip work; regular sources must continue. Local PC filesystem/commands are disabled unless explicitly allowed and must never be enabled implicitly by a public config. Browser use does not grant filesystem or command execution.

The project does not contain provider secrets. Configure them as protected Cloudflare bindings, not JSON or Git files.

## Modular runtime

The Cloudflare composition root is a minimal composition layer at src/app/worker.js. HTTP routes and authentication live in src/http/, the five-minute/hourly Cron handler in src/scheduler/, the manual Workflow in src/workflows/, AI assessment in src/ai/, source collectors in src/features/discovery/, and job/client notifications in separate src/features/delivery/ modules. Unchanged original functions retain SHA-256 parity checks; portability changes have a separate reviewed-hash manifest.

Run npm run test:runtime after npm run build:check to exercise the compiled Worker in an isolated local runtime.

## Development dependency advisories

The pinned Wrangler/Miniflare toolchain retains Node.js 20 compatibility for the current test suite. Run \`npm audit\` for development-tool advisories and \`npm audit --omit=dev\` for production dependencies. The November 2026 audit found no production-dependency advisories, but the legacy development toolchain has known issues. Upgrading to the latest Wrangler and Miniflare requires Node.js 22.12+ and adapting Miniflare 5 integration tests; this migration is deliberately not included in the privacy-focused release.

## Release safety

The checked-in Wrangler configuration is intentionally not production-deployable: a separate Worker name, no Cron, and placeholder D1. Never point a development copy at an existing production D1 or Telegram destination before isolated integration tests and a tested rollback. See [Deployment](docs/deployment.md).

**License:** MIT (see [LICENSE](LICENSE)). The example profile is fictional. Never publish `config/radar.config.json`, `src/config/radar.generated.js`, `.dev.vars`, or local migration archives. To avoid exposing historical Git author metadata or previously committed data, publish only a fresh Git repository created from a reviewed source snapshot.
