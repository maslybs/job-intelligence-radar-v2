# Configuration guide

**Language / Мова:** **English** | [Українська](configuration.uk.md)
[English README](../README.md) | [Ukrainian setup](one-click.uk.md) | [Ukrainian usage](usage.uk.md)

Use `npm run setup` to copy the public example to `config/radar.config.json`. Edit that private file and run `npm run ci`. Configuration schema version **2** deliberately separates employee-job matching from consulting/client prospecting.

## Jobs: looking for employment

`jobs.enabled` enables the vacancy collector.

`jobs.profile` documents your truthful professional role and summary, years of experience, proven work, skills, location/country, English level and preferred weekly working hours.

`jobs.criteria` specifies acceptable regions, job titles, full-time/contract formats, monthly target and minimum USD income, preferred/forbidden skills and industries, remote-only requirements, freshness windows and score thresholds. Relevant fields include `minQualifiedScore`, `manualReviewScore`, `p1Score`, `p1EmploymentScore` and `contractExceptionScore`. Scoring measures **estimated fit**, not your actual probability of getting hired.

`jobs.sources.mode` must equal `"replace"`, and `jobs.sources.items[]` lists *exactly* which job boards to check. Supported adapters include `rss`, `ashby`, `greenhouse`, `lever`, `himalayas`, `jobicy`, `remoteok`, `remotive`, `hn`, `remotebackend` and `freelancehunt`.

Example source:

```json
{"name":"Company engineering careers","kind":"ashby","slug":"example-company","hours":4}
```

For a public HTTPS RSS source:

```json
{"name":"My custom remote feed","kind":"rss","url":"https://example.com/jobs.xml","hours":4}
```

`jobs.browserSources.dou.enabled` and `jobs.browserSources.dou.targets[]` control DOU search keywords and channels. DOU browser scanning also requires `integrations.dou.enabled` and a connected optional OneAIHUB browser. Its targets are not inherited from another user's profile.

## Client leads: looking for paying customers

`leads.enabled` can be independently disabled. Its profile is **not** a copy of your employment CV.

`leads.profile` documents the consultancy role, value proposition, services you can actually deliver, evidence from past implementations, ideal client types, excluded services, client regions, preferred public-contact behavior and response language.

`leads.criteria` includes `minTechnicalFit`, `minCommercialScore`, `requireVerifiedBuyerEvidence`, age constraints and business-development instructions. A technically interesting post is **not** proof the author will buy anything. Original-author evidence, actual project scope, unresolved business pain and commercial intent are separate qualification checks. No automated unsolicited DMs.

`leads.sources.reddit` configures optional Reddit subreddits, seed queries, intent and topic phrases, expertise lanes and short focused queries. `leads.sources.community` configures optional public RSS/Atom support forums. These sources do not silently inherit your job-board list.

## Optional OneAIHUB and computer

`integrations.oneaihub.enabled` defaults to `false`. The private gateway also requires a Cloudflare VPC binding and credentials; setting enabled alone does **not** create access.

`integrations.oneaihub.browser.enabled` authorizes private browser operations only when the gateway is connected. `integrations.oneaihub.computer.enabled` is a separate opt-in for a local-computer bridge; `allowFilesystem` and `allowCommands` are separate explicit permissions. The existing Worker does not automatically execute arbitrary PC commands. A browser integration must not be treated as broad computer access.

If the hub is absent, `onUnavailable` is `"skip_optional_sources"`: DOU/Reddit browser functions skip, while normal vacancy collection, D1 queueing and accessible HTTP sources continue. Set `leads.enabled=false` if you want only job alerts.

## AI, Telegram and secrets

`ai.model` selects a model through the Cloudflare AI binding. The public default is `openai/gpt-6-luna` (GPT-6 Luna) rather than `@cf/openai/gpt-oss-120b`. Different models may need specific response-format handling and require staging testing. `notifications.telegramEnabled` controls send capability; `app.publicBaseUrl` is your own absolute Worker URL, never another user's. `notifications.timezone`, `language` and `telegramDigestHours` control display and digest timing.

Cloudflare tokens, Telegram bot credentials and browser access secrets belong in Cloudflare secret bindings (or ignored `.dev.vars` locally), **not** in JSON. The validator rejects common secret-bearing property names.

## Configuring a one-click Cloudflare installation privately

The [Deploy to Cloudflare guide](one-click.md) installs the **fictional** profile by default. For a personal setup managed through Workers Builds, add `RADAR_CONFIG_JSON` as a **build-time secret** containing a complete schema-v2 configuration. The `npm run build` and `npm run deploy` scripts will generate settings from it without adding your CV, salary preferences or private source lists to Git. After editing this build setting, trigger a new build.

This is distinct from runtime Worker secrets like `INBOX_PASSWORD`, `ADMIN_TOKEN` and `TG_BOT_TOKEN`. Do not place credentials inside `RADAR_CONFIG_JSON`. The validator rejects secret-like JSON keys.

## Validation

```bash
npm run config:validate-public
npm run config:generate
npm run ci
npm run build:check
```

To build from an alternative private JSON file, set `RADAR_CONFIG_FILE` to that path. A missing file falls back to the public example. The generated settings module is ignored by Git and contains no credentials.

Current limitation: some historic source-specific heuristics, translations and operational workflows still require further modularization and integration tests before release; see [Feature parity](feature-parity.md).

## Private account and source isolation

- Only the Git-ignored config/radar.config.json (or RADAR_CONFIG_FILE) defines personal jobs/client profiles, source lists, subreddit priorities, scan cadence, source exclusions, Telegram verification metadata and optional private OneAIHUB endpoint path.
- The compiled src/config/radar.generated.js is ignored by Git. The tracked example is anonymous, with Telegram and OneAIHUB disabled.
- jobs.enabled and leads.enabled can operate independently; at least one must be enabled. Job exclusions do not silently affect client leads.
- jobs.sources.items[].fastMinutes is an optional faster scan interval; forumHiring identifies a forum that accepts hiring offers. jobs.directContactSources declares allowed names and hosts. jobs.sources.probes declares diagnostic RSS feeds.
- jobs.sources.inaccessibleHosts and leads.sources.inaccessibleHosts specify inaccessible sites separately; jobs.criteria.marketplaceMinimums lists currency/amount thresholds.
- leads.sources.reddit has prioritySubreddits, problemSubreddits, highIntentSubreddits, hiringBoardTerms, deprioritizedCommunityTerms and excludedCommunityTerms.
- notifications.telegram.expectedBotUsername and expectedChatTitle are optional bot/chat identity checks; allowedChatTypes lists supported chat types. TG_BOT_TOKEN and TG_CHAT_ID are Cloudflare secrets, never JSON credentials.
- ai.dailyEvaluationLimit controls total daily AI evaluations; ai.dailyProspectLimit reserves a separate prospect cap. All Workers AI sites use atomic D1 quota reservations.
- Apply migrations/0001_core.sql to a separate, empty D1 database before staging. Other feature tables are initialized by feature services.
- The Telegram delivery outbox is at-most-once. When delivery is uncertain, reconcile manually; never blindly send duplicates.
