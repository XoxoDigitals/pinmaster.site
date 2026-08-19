# ContentOps — AI Content Automation Platform

Centralized dashboard to crawl reference sitemaps, rewrite articles with OpenRouter, publish to Blogger, and create Pinterest pins.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Prisma + PostgreSQL (local install or hosted — no Docker required)
- Background worker with DB-backed job queue
- Google OAuth / Blogger API
- Pinterest OAuth API
- OpenRouter (LLM + Grok Image)
- Cloudflare R2 for image storage (optional)

## Quick start

1. Copy env and fill keys:

```bash
cp .env.example .env
```

Set `DATABASE_URL` to a real PostgreSQL connection string, for example:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/contentops?schema=public"
```

Use a local Postgres install, or a hosted provider (Neon, Supabase, etc.). Create an empty database named `contentops` (or change the path in the URL) before running setup. The old SQLite file (`prisma/dev.db`) is unused after this migration.

2. Create DB schema and seed admin user:

```bash
npm run db:setup
```

Default admin login: `saboor@xoxodigitals.com` / `PinMaster-ChangeMe-2026!`

Change this password after first login (Settings → Account password). Override `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` before seeding if you want different bootstrap credentials. The seed script ignores `ADMIN_EMAIL=admin@example.com` and uses `saboor@xoxodigitals.com`.

3. Run the web app:

```bash
npm run dev
```

4. In a second terminal, run the worker:

```bash
npm run worker
```

## Dashboard

- `/dashboard` — analytics overview
- `/dashboard/blogs` — Google / Blogger accounts
- `/dashboard/pinterest` — Pinterest accounts + board mapping
- `/dashboard/sitemaps` — reference sitemaps
- `/dashboard/articles` — pipeline status
- `/dashboard/logs` — job errors + retries
- `/dashboard/users` — admin: add, disable, or delete users
- `/dashboard/settings` — per-user AI keys, publishing, password; admin also configures shared Google/Pinterest OAuth *apps*

## Multi-account

- Each user signs in with email/password. Dashboard data (sitemaps, articles, jobs, AI keys, connected Google/Pinterest accounts, mappings, analytics) is scoped to that user.
- **Google Cloud OAuth app** and **Pinterest app** client credentials are stored once in `AppConfig` (admin Settings). All users share that app, then connect **their own** Google/Blogger blogs and Pinterest accounts.
- AI keys (OpenRouter, Google AI Studio vault, SnapGen) are per user. Admin keys are not used as a fallback for other accounts.
- Tokens for another user’s Google or Pinterest login are never shared.

## Pipeline

```
Sitemap crawl → Extract → AI rewrite → Images → Blogger → Pinterest → Complete
```

Each step is a separate queued job with retries (stored in PostgreSQL `JobRun`).

## Required credentials

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `SECRET` | Blogger OAuth |
| `PINTEREST_APP_ID` / `SECRET` | Pinterest OAuth |
| `OPENROUTER_API_KEY` | Rewrites + images |
| `R2_*` | Public image hosting (optional if image API returns public URLs) |
| `NEXTAUTH_SECRET` | Session signing |
| `ENCRYPTION_KEY` | Encrypt stored API keys |
