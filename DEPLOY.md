# Self-Hosting Guide

This is a free, open-source app. You can host it yourself with no licensing fees.

## 1. Prerequisites

- Node.js 20+ and [bun](https://bun.sh/) (or npm/pnpm)
- A [Supabase](https://supabase.com) project (free tier works) **or** local Supabase via Docker
- A hosting target that supports edge functions / Node SSR (Cloudflare Pages, Vercel, Netlify, Fly, your own VPS)

## 2. Clone & install

```bash
git clone <your-fork-url>
cd <repo>
bun install
```

## 3. Set up the database

Create a new Supabase project, then apply every file in `supabase/migrations/` in order:

```bash
# Using the Supabase CLI
supabase link --project-ref <your-ref>
supabase db push
```

Or paste each migration into the Supabase SQL editor in filename order.

## 4. Environment variables

Create `.env` (or set in your host's dashboard):

```
# Client (exposed to browser — safe)
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=<ref>

# Server (never expose)
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

## 5. Auth providers

In your Supabase dashboard → Authentication → Providers:
- Enable **Email** (with confirmations optional)
- Enable **Google** if you want OAuth — paste your Google OAuth Client ID + Secret, then set the redirect URL Supabase shows in your Google Cloud Console

## 6. Storage

Create a private bucket named `item-files` (Storage → New bucket → Private).

## 7. Build & deploy

```bash
bun run build
```

Deploy the build output per your host's docs. The app is a TanStack Start v1 project — any platform that runs the Vite/TanStack output works.

### Cloudflare Pages quick recipe
- Build command: `bun run build`
- Output directory: `.output/public`
- Functions directory: `.output/server`
- Add all env vars from step 4 to Pages → Settings → Environment variables

## 8. First-run setup

- Visit the site, sign up, create your first workspace.
- Invite your team from the **Members** page.

## Updating

```bash
git pull
bun install
supabase db push   # only if there are new migrations
bun run build
```

## Backups

Supabase backs up Postgres daily on paid tiers. For free or self-hosted, schedule a nightly `pg_dump` of your database.

## Troubleshooting

- **Blank page after deploy** → check browser console; usually a missing `VITE_*` env var.
- **`Unauthorized` on RPCs** → `attachSupabaseAuth` must be in `src/start.ts` middleware (it is by default).
- **Realtime not updating** → check that `supabase_realtime` publication includes the table (see migrations).

## License

Free to use, modify, and redistribute. No payments ever required.

See `USER_GUIDE.md` for end-user documentation.