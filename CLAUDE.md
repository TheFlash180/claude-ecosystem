# Working on this repo

Personal PWA ecosystem for a household in Johannesburg, South Africa. Everything
is free-tier: GitHub Pages for hosting, one shared Supabase project for data.

## Read this first: things that look like bugs and are not

**Supabase's advisors report ~154 findings and essentially all of them are the
design. Do not "fix" them.** As of August 2026:

| Count | Lint | Why it is there |
|---|---|---|
| 127 | `anon_/authenticated_security_definer_function_executable` | The definer RPCs **are** the write path. Revoking execute breaks every app. |
| 21 | `rls_enabled_no_policy` | Device-scoped tables: no policy means no direct writes, which is the point. |
| 5 | `rls_policy_always_true` | fintrack's `using (true)` on `transactions`, `budgets`, `profiles`, `fintrack_settings`, `fintrack_accounts`. Deliberate — see the fintrack-pro CLAUDE.md. |
| 1 | `auth_leaked_password_protection` | Supabase **Pro** feature. Not available on this plan; nothing to do. |

Adding policies to those tables, revoking anon execute on those functions, or
tightening the fintrack policies to per-owner isolation each break a working
app. If the count moves well away from those numbers, something new happened —
that is worth a look.

The apps predate accounts. They are **device-scoped, not user-scoped**:

- Each app stores a random token in localStorage (`<app>:device-token`).
- Tables have RLS enabled with **no write policies at all**, so nothing is
  writable with the anon key directly.
- Every write goes through a `security definer` RPC that hashes the token
  (SHA-256, hex) and matches it against `device_token_hash`. Those RPCs must be
  anon-executable — that is the entire access path.
- Shared world data (fixtures, film titles, events, product prices) is
  public-read on purpose. It is not personal data and the app needs it before a
  device has any state.

Two apps are the exception and use real auth: **baby-logger** and
**fintrack-pro** (separate repo). See the ownership table below.

## Layout

```
apps/            one folder per app; the dashboard is the hub
packages/shared  Supabase client, AppShell, deviceToken, ensurePushSubscription
tooling/         build-all.mjs (what CI runs) and new-app.mjs (scaffold)
```

`tooling/build-all.mjs` builds the dashboard at the site **root** and every
other app at `/<repo>/<app>/`. **An app's display name comes from its
`index.html` `<title>`** — that is how it appears on the hub tile. There is no
registry to update; adding a folder under `apps/` is enough.

**Only the dashboard uses `AppShell`.** Every other app builds its own chrome
around an app-specific palette exported from its `lib/config.ts` (`K` in
meal-prep, `W` in workout-plan, and so on). What the apps actually share is
`getSupabase`, `deviceToken` and `ensurePushSubscription` — do not go looking
for a common layout component.

### What the apps are, where the name misleads

Most are what they sound like. Two are not:

- **Meal Prep** is a *recipe book*, not a planner. The weekly grid was used
  twice in four months and is gone. 61 recipes across lunch / dinner / sides /
  snacks / puddings, each with a full method, and a cook list that feeds a
  shared shopping list.
- **Workout Plan** is a *guide*, not a training log. Per-set logging was used
  for one week and is gone with its tables. Routines are workout types you
  browse, not weekdays. The only things it records are bodyweight and parkrun
  times.

## The shared Supabase project

Project ref: `objkdeagyltvgcuxsnxu` (region eu-central-1).

**Every app in this repo and both external repos share this one project.** A
schema change lands in the same database as everything else.

| App | Tables | Edge functions | pg_cron |
|---|---|---|---|
| sport-watch | `sport_*` | `sync-f1`, `send-sport-reminders`, `sport-calendar` | `sport-f1-sync`, `sport-push-reminders`, `sport-prune-reminders` |
| marvel-watch | `marvel_*` | `sync-marvel`, `send-marvel-reminders` | `marvel-tmdb-sync`, `marvel-push-reminders`, `marvel-prune-*` |
| meal-prep | `mealprep_*` | `send-mealprep-reminder` | `mealprep-prep-reminder` |
| workout-plan | `workout_*` | — | — |
| baby-logger | `babies`, `feed_events`, `sleep_events`, `nappy_events`, `weight_events` | — | — |
| glovebox | `glovebox_*` | `send-glovebox-reminders` | `glovebox-reminders` |
| front-row | `frontrow_*` | `sync-frontrow`, `notify-frontrow` | `frontrow-sync`, `frontrow-notify` |
| price-watch | `pricewatch_*` | `sync-pricewatch`, `notify-pricewatch`, `search-pricewatch` | `pricewatch-sync`, `pricewatch-notify` |

Owned by the external repos, but in the same database:

- **fintrack-pro** owns `transactions`, `budgets`, `profiles`, `fintrack_*`.
  Its `fintrack_allowlist` table and the trigger on `auth.users` are what stop
  strangers signing up — **baby-logger's "any authenticated user" policies are
  only safe because that trigger exists.** Do not weaken it.
- **baby-registry-pwa** owns `categories`, `items`, `retailers`, `claims`,
  `registry_settings`.
- `ping` exists only for the keep-alive cron.

### Copy of record

`apps/<app>/supabase/schema.sql` and `apps/<app>/supabase/functions/**` are the
**copy of record, not the deployment**. Editing them changes nothing. Apply SQL
with `mcp__Supabase__apply_migration` and deploy functions with
`mcp__Supabase__deploy_edge_function`, then update the file to match. If the two
drift, the file is the one that is wrong.

Cron jobs in `schema.sql` are deliberately **not** applied by running the file —
schedule them explicitly, once.

## Conventions that matter

**Dates are South African calendar days, not UTC instants.** Every app uses the
same pair:

```ts
export function sastDay(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
}
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z');   // midday anchor: no DST/rounding slips
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
```

Do not reach for `toISOString().slice(0,10)` on `new Date()` — between midnight
and 02:00 SAST that is yesterday.

**Currency formatting is hand-rolled, on purpose.** `toLocaleString('en-ZA')`
groups thousands with U+00A0 on Node, a comma in browsers and something else
again on Deno. The same price appears on a card, in a push notification and in
a test, so price-watch formats by hand. Copy that if you need money elsewhere.

**Push notifications:** every app has its **own** VAPID keypair. The private key
lives in Supabase Vault as `<app>_vapid_private_key`, read by a
`get_<app>_vapid_private_key()` function granted to `service_role` only. Never
reuse another app's keypair.

**Notification badges** (`public/badge-96.png`) must be a **solid white
silhouette on transparency**. Android discards colour and keeps only the alpha
channel, so a thin outline or a fully opaque image renders as a white square.
Aim for roughly 15-20% non-transparent coverage. Generate from `badge.svg` with
Playwright and `omitBackground: true`.

**Push subscriptions are one row per device**, collapsed with
`on conflict (device_token_hash) do update`. Getting this wrong caused duplicate
notifications across the whole ecosystem once already.

**Meal Prep recipe steps are scaled by regex, so how you write a quantity
matters.** `src/lib/scale.ts` rescales a number in the prose only when a unit
of food follows it (`cups`, `tsp`, `g`, `ml`, `tins`, `eggs`, …). That
whitelist is what keeps `25 minutes`, `180°C` and `3 cm` safe. Consequences
when writing or editing a step:

- Put the number next to its unit. `2 extra tablespoons` does not scale —
  `2 tablespoons` does.
- Use a unit the list knows, or no number at all. `8 dips` did not scale and
  had to be reworded.
- Never write a per-item amount as a number. "Pour in 60 ml of batter" per
  pancake would double the size of each pancake instead of making more.
- `mealprep_recipes.scalable = false` turns the whole thing off, for recipes
  where the quantity is not really a quantity. An ingredient with `"f": true`
  is exempt on its own — the oil you deep-fry in, the bag of charcoal.

`apps/meal-prep/supabase/seed.sql` is a **real export of all 61 recipes** and
is the copy of record for the content. Regenerate it if you change recipes; it
was verified byte-identical to the live table by checksum.

## Working practice

- `npm run build` locally is exactly what CI runs. Run it before pushing.
- Tests are vitest, colocated in `src/lib/__tests__/`. Pure logic lives in
  `src/lib/*.ts` with no React or Supabase imports so it is directly testable.
- Deploy is `.github/workflows/deploy.yml`, on push to `main` only. **There are
  no PR checks** — a broken build is only caught after merge.
- PRs are **squash-merged**, so the PR body becomes the commit message.
- The site is `https://theflash180.github.io/claude-ecosystem/`.

### Environment notes for agents

- The dev container's proxy blocks `github.io` and `supabase.co` directly. You
  cannot curl the live site or the Supabase REST API. Use the Supabase MCP tools
  for data, and for outbound HTTP to third-party APIs, call it from inside an
  edge function.
- To screenshot an app: build with dummy `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` (otherwise the client never initialises and you get
  the empty state), serve `dist` behind a `claude-ecosystem/` path, and
  intercept `**/rest/v1/**` with Playwright to inject realistic rows.
- Chromium is preinstalled at `/opt/pw-browsers`. Do not run
  `playwright install`.
- The headless browser has **no** route to the outside world — it does not use
  the agent proxy, so workout-plan's `raw.githubusercontent.com` exercise photos
  fail to load. `curl` them to disk first and `page.route` them back in.
- `fullPage: true` screenshots blank out `loading="lazy"` images and paint
  `position: fixed` bars in the middle of the page. Take viewport-sized shots
  and scroll instead.

## Things learned the hard way

- A source that goes quiet looks identical to "nothing new". Every syncing app
  records adapter health (`*_sources`) and the UI shows a stale-source banner.
- Notifiers only record a send **after** delivery succeeds, so a total failure
  retries rather than being silently marked done.
- A watch/track only reports things that appeared **after it was created**.
  Without that, adding one replays the back catalogue as notifications.
- Quicket carries almost nothing at Montecasino; Front Row's useful source is
  Montecasino's own WordPress REST API (`/wp-json/wp/v2/whatson`).
- Takealot returns two shapes. `buybox_items_type: "summary"` is a **variant
  parent** whose price is the cheapest option, and its
  `is_add_to_cart_available` is false because you must pick a size — reading
  that as "out of stock" silently suppresses alerts for ~40% of results.
- Makro is behind PerimeterX with a CAPTCHA. Not a target.
