# Claude Ecosystem

Monorepo for the personal automation ecosystem. Every app in `apps/` builds as an installable PWA and deploys automatically to GitHub Pages on push. Zero hosting cost.

## Structure

```
apps/            One folder per app (dashboard, fintrack, ...)
packages/shared  Shared code: Supabase client, theme tokens, AppShell
tooling/         build-all.mjs (CI build) and new-app.mjs (scaffold)
.github/         Deploy workflow + Supabase keep-alive cron
```

## One-time setup (about 20 minutes)

### 1. Push to GitHub

```powershell
cd claude-ecosystem
git init
git add .
git commit -m "Phase 1: ecosystem scaffold"
gh repo create claude-ecosystem --private --source . --push
# or create the repo on github.com and: git remote add origin <url> && git push -u origin main
```

Note: GitHub Pages on **private** repos requires a Pro plan. On a free account, make the repo **public** (fine here - no secrets are committed; data protection lives in Supabase RLS).

### 2. Enable GitHub Pages

Repo -> Settings -> Pages -> Source: **GitHub Actions**. That's it - the deploy workflow handles the rest.

### 3. Create the Supabase project

1. supabase.com -> New project (free tier). Region: pick **Europe (Frankfurt/London)** - lowest latency to SA on the free tier.
2. Project Settings -> API: copy the **Project URL** and **anon public key**.
3. SQL Editor -> run this to create the keep-alive table with RLS:

```sql
create table ping (id serial primary key, at timestamptz default now());
insert into ping default values;
alter table ping enable row level security;
create policy "public read" on ping for select using (true);
```

### 4. Add the secrets to GitHub

Repo -> Settings -> Secrets and variables -> Actions -> New repository secret:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

### 5. Push (or re-run the workflow)

Actions tab -> the deploy runs -> site appears at
`https://<username>.github.io/claude-ecosystem/`
with the dashboard at `.../claude-ecosystem/dashboard/`.

On your phone: open the dashboard URL in Chrome -> menu -> **Add to Home screen** -> it installs as an app. The header badge should read **Supabase connected**.

## Daily workflow

```powershell
npm install              # once, and after adding deps
npm run dev              # dashboard dev server on localhost
npm run dev -w apps/xyz  # dev server for a specific app
npm run build            # exactly what CI runs - test before pushing
git push                 # deploys everything
```

Local Supabase access: create `apps/<app>/.env.local` (gitignored):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Adding a new app

```powershell
npm run new-app -- fintrack "FinTrack" "Personal finance dashboard"
npm install
npm run dev -w apps/fintrack
```

The next push deploys it automatically at `/claude-ecosystem/fintrack/` and it shows up on the launcher page.

## Rules learned the hard way (carried over from the script ecosystem)

- Every Supabase table gets an RLS policy **before** it gets data.
- The anon key is public by design; the URL and key in the frontend bundle are expected.
- Keep-alive cron runs Mon + Thu so the free-tier project never pauses.
- `npm run build` locally before pushing - it is identical to CI.
