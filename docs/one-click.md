# Deploy to Cloudflare (no terminal required)

**Language / Мова:** **English** | [Українська](one-click.uk.md)
[English README](../README.md) | [Ukrainian setup](one-click.uk.md)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/maslybs/job-intelligence-radar-v2)

This creates **your own** Worker, D1 database, and linked Git repository. Nothing points to the maintainer's Cloudflare resources, database, Telegram bot or personal profile. Cloudflare provisions D1 and Workers AI; Wrangler deploys the three Workflow classes.

## Installation

1. Click **Deploy to Cloudflare** above and sign in to your **own** Cloudflare and GitHub (or GitLab) accounts.
2. Select a unique Worker name, D1 database name and repository name. **Do not reuse an existing production Worker or D1**.
3. Set the secret values shown from `.env.example`, if prompted:
   - `INBOX_PASSWORD`: a strong, unique password (16+ characters) for the web inbox.
   - `ADMIN_TOKEN`: a separate, random API token for the protected `/admin/*` API.
   Both secrets are private: never enter your GitHub password, commit these values, or use the literal example names as values.
4. Confirm the Cloudflare **Build command** is `npm run build`, and **Deploy command** is `npm run deploy` if the setup form asks. Deploy. The deployment script provisions the Worker and D1, verifies the chosen database, then runs all three D1 migrations. If any step fails, the build must report failure rather than quietly skipping migrations.
5. Open the displayed `https://your-worker.your-subdomain.workers.dev/health` URL. The response should be HTTP 200; the `/inbox` URL is password-protected. If Cloudflare did not prompt for secrets, add them in **Workers & Pages → your Worker → Settings → Variables and Secrets**, with **Secret** as the type, and then redeploy if needed.

Cloudflare automatically sets up Builds against the new repo. Future changes to the source branch can deploy again. **Do not put a real CV, salary constraints, private sources or credentials in the new Git repository**, especially if it is public.

## What works initially

- The anonymous example runs a small set of **public job sources once per hour** via the Cron Trigger and the configured Cloudflare Workflow.
- Workers AI can evaluate those jobs against the **fictional example profile**. Scores are only a demonstration; they do not reflect your background.
- The web inbox is accessible when `INBOX_PASSWORD` has been configured.
- Telegram notifications, Reddit/DOU browser access, private OneAIHUB and local computer access are all disabled until explicitly configured.
- D1, Workers AI and Workflows use your Cloudflare account's quotas and may result in usage charges. You can pause automatic scans by removing the Cron from the **new installation's** `wrangler.jsonc` and redeploying.

## Use your own profile without committing it

In **Workers Builds**, configure the **build-time** secret/environment variable `RADAR_CONFIG_JSON` with a complete schema-v2 JSON object based on [`config/radar.config.example.json`](../config/radar.config.example.json). The build step reads this value to generate runtime settings, without adding it to Git. Never put passwords/API keys in that JSON: those belong in **Worker secrets**. Trigger a new build after changing this setting.

For local deployments, use `npm run setup`, edit the ignored `config/radar.config.json`, run `npm run ci`, and use `npm run deploy` in your own authenticated Cloudflare environment. Never commit the ignored private file or `src/config/radar.generated.js`. A Workers Build started from Git won't read files that only exist on your local computer.

## Diagnostics

- **Build succeeds but inbox is locked:** set `INBOX_PASSWORD`; a missing password intentionally denies access.
- **Admin returns 403:** set a separate `ADMIN_TOKEN`; use `Authorization: Bearer <your token>` for `/admin/*`.
- **Database-related errors:** check the D1 database binding `DB` and the Deploy build logs. The script applies `wrangler d1 migrations apply DB --remote --yes` and fails if there is no unique database match.
- **No notifications:** Telegram is disabled in the default config. Opt in explicitly and provide your own bot credentials.
- **No new jobs:** the sample scans hourly, not continuously. Check the Cron Trigger, Workflow runs, `/health`, and source availability.
- **Build can't deploy Workflows or AI:** check your Cloudflare account's entitlements and project permissions; the button cannot bypass account quotas.
- **Custom deployment not working:** compare the Worker bindings and project setup with [`wrangler.jsonc`](../wrangler.jsonc). Do not borrow resources from another account or production installation.

**Verification boundary:** The project has local unit/integration tests, a real Miniflare fresh-D1 migration test and a Wrangler deploy dry-run. A complete deployment through another user's Cloudflare account requires that account to approve the setup; this repository does not claim an external deployment has already been executed.
