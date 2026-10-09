# Working on this repo

Personal PWA ecosystem for a household in Johannesburg, South Africa. Everything
is free-tier: GitHub Pages for hosting, one shared Supabase project for data.

## Read this first: things that look like bugs and are not

**Supabase's advisors report ~156 findings and essentially all of them are the
design. Do not "fix" them.** As of October 2026, recounted after Front Row's
retirement took its tables and functions out of the list:

| Count | Lint | Why it is there |
|---|---|---|
| 135 | `anon_/authenticated_security_definer_function_executable` (65 + 70) | The definer RPCs **are** the write path. Revoking execute breaks every app. The list also names trigger functions (`handle_new_fintrack_user`, `_sport_events_audit`, `sport_reminders_follow_event`) and Supabase's own `rls_auto_enable` event trigger — none of those can be called over REST. |
| 20 | `rls_enabled_no_policy` | Device-scoped tables: no policy means no direct writes, which is the point. |
| 1 | `auth_leaked_password_protection` | Supabase **Pro** feature. Not available on this plan; nothing to do. |

fintrack's `using (true)` policies on `transactions`, `budgets`, `profiles`,
`fintrack_settings` and `fintrack_accounts` are still in place and still
deliberate (see the fintrack-pro CLAUDE.md) — Supabase simply stopped
reporting them as `rls_policy_always_true` by September 2026, so their absence
from the list is not a change to chase.

Security definer functions that only `service_role` may execute — the Vault
getters (`get_*_vapid_private_key`, `get_tmdb_api_key`) and `cron_secret_ok` —
raise no lint at all, so a new one adding to the count means it is reachable
by anon or authenticated, which for those would be a leak.

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
packages/shared  Supabase client, AppShell, deviceToken, ensurePushSubscription,
                 the `*_sources` staleness rule (`sources.ts`) and
                 `fetchAllPages` for reads past the 1000-row cap (`paging.ts`)
tooling/         build-all.mjs (what CI runs) and new-app.mjs (scaffold)
```

`tooling/build-all.mjs` builds the dashboard at the site **root** and every
other app at `/<repo>/<app>/`. **An app's display name comes from its
`index.html` `<title>`** — that is how it appears on the hub tile. There is no
registry to update; adding a folder under `apps/` is enough.

**The dashboard is a hub, not just a launcher.** Above the tiles it renders a
**Today** section (`src/components/Today.tsx`, logic in `src/lib/today.ts`):
the next fixture, where the running workout programme has got to, the cook
list, a tracked product at its lowest, the next Marvel release, the registry
count, and — only when signed in — the pregnancy countdown, which becomes
"Fed 2h 10m ago · Left side · right next" once `babies.birth_date` is set.
Cards with nothing to say return null and do not render, so a quiet day is a
short screen.

**Today reads that data with the anon key and adds no RPC and no policy.** Every
source is already public-read world data. The one exception is `babies`, which
is auth-gated: all apps are served from the same origin, so the client picks up
whatever session baby-logger stored, and RLS decides. Signed out — which is
what a stranger loading the public site is — the query returns nothing and the
card is absent. **Do not "fix" this by adding a definer RPC for the baby data:
that would publish a household's pregnancy on a public URL.**

**The hub sends one push: the 07:00 morning summary**, opt-in from a line
under the date (`MorningSummary.tsx`, `lib/morning.ts`), sent by
`send-morning-digest` at 05:00 UTC. What it says lives in
`supabase/functions/send-morning-digest/digest.ts`, a plain module that the
function and the dashboard's vitest both import. Three rules in it matter:

- **A quiet day sends nothing.** A line exists only for something today — a
  fixture still to come, a release, a Glovebox renewal within 14 days or
  overdue, a feed that has stopped syncing. No lines, no push; a summary that
  arrives daily saying nothing teaches you to swipe it away.
- **Anyone can subscribe, so nothing personal goes in.** World data, plus the
  subscribing device's *own* Glovebox rows: the hub shares Glovebox's origin,
  reads `glovebox:device-token` from localStorage and registers its hash, the
  same hash Glovebox stores. **Never add baby-logger data here** — that would
  push a household's baby to any stranger who taps "Turn on".
- **The stale-feed line is the new information.** A feed that stopped looks
  like a quiet week inside its app; the summary says it out loud. `isStale`
  copies the shared `staleSources` rule and a parity test holds them together.

It has its own VAPID keypair (`dashboard_vapid_private_key`),
`public/push-sw.js` imported into the hub's worker, and a badge.
`?dry=1` returns the shared lines without sending — never the Glovebox ones:
it needs the cron secret like any call (below), but holding that is no
entitlement to one device's renewals.

**Only the dashboard uses `AppShell`.** Every other app builds its own chrome
around an app-specific palette exported from its `lib/config.ts` (`K` in
meal-prep, `W` in workout-plan, and so on). What the apps actually share is
`getSupabase`, `deviceToken`, `ensurePushSubscription`, `fetchAllPages` and
`sources.ts` — do not go looking for a common layout component.

`sources.ts` is shared because the rule is identical everywhere, not the
chrome: `staleSources` / `staleMessage` / `sourceFromRow` over the seven
columns an `<app>_sources` table has (`pricewatch_sources` predates
`last_run_at` and lacks it; the staleness rule never reads that column). Each
app still draws its own banner in its own palette. It lives in
`packages/shared`, so **that package now has its own vitest run** — `npm test`
covers it like any app.

**Marvel Watch's Out Now list is dismissible, and the dismissal is
device-scoped.** `marvel_watched` is one row per (device, title) behind
`marvel_set_watched` / `marvel_list_watched`, same token-hash definer pattern
as the reminders. Two things about it are deliberate:

- **It hides from `outNow` only.** A release still to come cannot have been
  seen, so a stale flag — a date that moved, a re-release — must never delete
  a future title from the page, where nothing would explain the absence.
  `groupTitles` takes the watched set and applies it to that one list.
- **It is per device, not per household.** One person ticking off a film must
  not clear it from the other's phone. That is the opposite of how the shared
  world data works, and it is the right way round here.

A failed `listWatched()` returns null, not an empty set, and the app keeps the
set it already had — otherwise one flaky read flashes every hidden title back
onto the page.

**Baby Logger is built for 3am, and three things in it are load-bearing:**

- **Live sync.** `babies` and the four `*_events` tables are in the
  `supabase_realtime` publication; PostBirthView subscribes to changes and
  App to the babies row, so a feed logged on one phone shows on the other and
  setting the birth date switches both. Realtime goes through RLS like any
  query. The socket dies when a phone sleeps and nothing replays what it
  missed, so **coming back to the app reloads as well** — keep that when
  touching it; the socket alone is not correct. The same goes for the
  offline queue (`lib/eventQueue.ts`): on a weak signal the phone reports
  itself online while requests die, so the `online` event never fires.
  App retries every 15s and on coming back to the app while anything is
  queued; without that a feed sat on one phone until a restart.
- **Night mode** (`lib/night.ts`) swaps the CSS variables for a dim
  amber-on-black palette, automatically 19:00–06:00 SAST or always/off per
  phone. It only works because components use `var(--…)`; a hardcoded colour
  in a new component will glow in the dark.
- **The last feed** reads to the minute with its side, and the feed form
  opens on the other side (`lib/feedSummary.ts`). The hub's newborn card has
  its own copy of those rules in `today.ts` — keep the two in step.

### What the apps are, where the name misleads

Most are what they sound like. Two are not:

- **Meal Prep** is a *recipe book*, not a planner. The weekly grid was used
  twice in four months and is gone. 61 recipes across lunch / dinner / sides /
  snacks / puddings, each with a full method, and a cook list that feeds a
  shared shopping list.
- **Workout Plan** is a *guide*, not a training log. Per-set logging was used
  for one week and is gone with its tables. Routines are workout types you
  browse, not weekdays. It records only whole-session results — bodyweight,
  parkrun times and AMRAP scores.

  The **Plan tab** adds multi-week programmes (`workout_programs` +
  `_days` + `_phases`) without reopening that door: the current week is
  **derived from `workout_profile.program_started_on`**, never stored and never
  ticked off. Start it once and it tells you where you are — there is nothing
  to keep up to date, which is exactly what the set logging failed at. A
  programme's own sessions carry `workout_routines.program_id`, and the
  Workouts tab filters on `program_id is null`, so adding a programme leaves
  that library showing precisely what it always showed.

  Two exist: **Hero Cut** (12 weeks, 4 sessions, each lifting day built for
  home *and* gym) and **Twenty** (four 20-minute sessions, three of them
  AMRAPs). A programme where no day differs by setting renders no home/gym
  toggle at all.

  **`workout_benchmarks` is the one piece of session logging, and it is
  deliberate.** An AMRAP with nowhere to record the round count is pointless.
  The distinction that matters is friction, not principle: `workout_sessions`
  / `workout_sets` logged every set of every session and died; `workout_runs`
  logs one number occasionally and survived. A score is the second shape —
  `rounds` + `extra_reps`, one row per workout per day, re-entry corrects
  rather than stacks. Only routines with `scored = true` offer it, so a
  strength day never asks.

## The shared Supabase project

Project ref: `objkdeagyltvgcuxsnxu` (region eu-central-1).

**Every app in this repo and both external repos share this one project.** A
schema change lands in the same database as everything else.

| App | Tables | Edge functions | pg_cron |
|---|---|---|---|
| sport-watch | `sport_*` | `sync-f1`, `sync-rugby`, `send-sport-reminders`, `sport-calendar` | `sport-f1-sync`, `sport-rugby-sync`, `sport-push-reminders`, `sport-prune-reminders` |
| marvel-watch | `marvel_*` | `sync-marvel`, `send-marvel-reminders` | `marvel-tmdb-sync`, `marvel-push-reminders`, `marvel-prune-*` |
| meal-prep | `mealprep_*` | `send-mealprep-reminder` | `mealprep-prep-reminder` |
| workout-plan | `workout_*` | — | — |
| baby-logger | `babies`, `feed_events`, `sleep_events`, `nappy_events`, `weight_events` | — | — |
| glovebox | `glovebox_*` | `send-glovebox-reminders` | `glovebox-reminders` |
| price-watch | `pricewatch_*` | `sync-pricewatch`, `notify-pricewatch`, `search-pricewatch` | `pricewatch-sync`, `pricewatch-notify` |
| dashboard (hub) | `dashboard_push_subs` | `send-morning-digest` | `dashboard-morning-digest` |

**Front Row was retired in October 2026** (unused). Its folder, `frontrow_*`
tables and functions, both cron jobs and its Vault key are gone, and its edge
functions answer 410. A mention of it elsewhere in this file is history.

Owned by the external repos, but in the same database:

- **fintrack-pro** owns `transactions`, `budgets`, `profiles`, `fintrack_*`.
  Its `fintrack_allowlist` table and the trigger on `auth.users` are what stop
  strangers signing up — **baby-logger's "any authenticated user" policies are
  only safe because that trigger exists.** Do not weaken it.
- **baby-registry-pwa** owns `categories`, `items`, `retailers`, `claims`,
  `registry_settings`.
- `ping` exists only for the keep-alive cron, which is a **GitHub Actions**
  schedule (`.github/workflows/supabase-keepalive.yml`, Mon and Thu), not a
  pg_cron job — free-tier projects pause after ~7 days idle. Do not go
  looking for it in `cron.job`.

### Copy of record

`apps/<app>/supabase/schema.sql` and `apps/<app>/supabase/functions/**` are the
**copy of record, not the deployment**. Editing them changes nothing. Apply SQL
with `mcp__Supabase__apply_migration` and deploy functions with
`mcp__Supabase__deploy_edge_function`, then update the file to match. If the two
drift, the file is the one that is wrong.

For edge functions, drift is checked rather than trusted:
`.github/workflows/functions-drift.yml` downloads every deployed function each
Monday, and after any push to `main` that touches one, and fails on a file that
differs, a function on only one side, or `verify_jwt` switched on. It reads
through `SUPABASE_DRIFT_TOKEN`, a scoped token with Edge Functions: Read on
this project and nothing else. Never swap in a classic token: one of those
carries the whole account. A red run means deploy the repo's version, or
commit what is live, whichever is right.

Cron jobs in `schema.sql` are deliberately **not** applied by running the file —
schedule them explicitly, once.

### Edge functions are cron-only, except two

Every function runs with `verify_jwt` off, because pg_cron has no user JWT to
send. Until October 2026 they also checked nothing, so anyone who found a URL
could run any sync or sender as often as they liked. **The ten cron-driven
functions now answer 403 unless the request carries `x-cron-secret`.**

- The secret is generated in Vault (`cron_secret`) and never leaves the
  database. Each cron job reads it as it fires
  (`jsonb_build_object(…, 'x-cron-secret', (select decrypted_secret …))`).
  Each function's `fromCron()` checks it through `cron_secret_ok()`, which only
  `service_role` may call, before doing anything else. Copy of record:
  `packages/shared/supabase/cron_secret.sql`, including how to rotate it.
- **A new cron-driven function needs both halves:** `fromCron()` at the top of
  its handler, and the header in its cron job. Without the header, its own
  cron gets 403 every run. Without the check, it is open again.
- **`search-pricewatch` and `sport-calendar` deliberately do not check it.**
  The Price Watch app calls the first from the browser, and a phone's calendar
  subscribes to the second. Neither writes anything.
- To run a cron function by hand, call it from SQL with the same header, e.g.
  `select net.http_post(url := '…/functions/v1/sync-f1', headers :=
  jsonb_build_object('x-cron-secret', (select decrypted_secret from
  vault.decrypted_secrets where name = 'cron_secret')))`, then read the reply
  from `net._http_response`. Mind that the senders really send, Meal Prep's
  "Prep day!" in particular.

### Backups

The free plan has no backups you can restore yourself, so
`.github/workflows/backup.yml` takes one every Sunday 01:30 UTC (and on
demand): `tooling/backup-dump.sh` — `pg_dump` of the `public` schema plus
`auth.users` / `auth.identities` as data — checked by
`tooling/backup-check.sh`, gzipped and
**encrypted with `BACKUP_PASSPHRASE` before upload** — this repo is public, and
so are its artifacts to any signed-in GitHub user. Artifacts are kept 90 days.

- It logs in as **`backup_reader`**: login, `bypassrls` (pg_dump refuses
  tables whose RLS would hide rows), `select` on `public` (default privileges
  cover new tables), nothing else.
- **It cannot read `auth` directly, and cannot be made to.** `supabase_admin`
  owns that schema and `postgres` holds `usage` on it without grant option, so
  `grant usage on schema auth` is a silent no-op — the first real run failed
  with "permission denied for schema auth". The users come through
  `backup.auth_users()` / `backup.auth_identities()` instead: `security
  definer` functions in a schema PostgREST does not expose, executable only by
  `backup_reader`. The workflow writes them in COPY format with generated
  columns left out. Its password is
  the `BACKUP_DB_PASSWORD` secret and was set outside migrations so it is not
  in `supabase_migrations`. To rotate it: `alter role backup_reader password
  '…'` and update the secret. To retire backups: `drop role backup_reader`.
- Runners are IPv4-only, so it connects through the session pooler, trying
  both eu-central-1 clusters.
- **Not in the backup:** Vault secrets (VAPID and TMDB keys — regenerate; push
  subscriptions then re-register), pg_cron jobs (documented in each
  `schema.sql`), edge functions (in this repo), and the `backup` schema with
  its two functions and `backup_reader`'s login (the restore creates the role
  without one) — recreate those before the new project's first backup.

**Every backup is restored before it counts.** The `restore-check` job restores
each one, exactly as below, into a throwaway Supabase on the runner and runs
`tooling/restore-check.sh`: every table's row count against the dump, and the
"manifest" (`tooling/backup-manifest.sql` — grants, RLS, policies, triggers,
realtime membership, default privileges) taken from the live project at
backup time against the same query on the restored copy. The first rehearsal
is why. A plain `pg_dump --schema=public` restored badly in four ways, and
three of them failed open:

- It stopped at its own `CREATE SCHEMA public` — the documented restore had
  never worked.
- `--no-privileges`, and then the new project's default privileges, made
  every function anon-executable, including the service_role-only Vault
  getters (`get_*_vapid_private_key`, `get_tmdb_api_key`).
- The signup allowlist trigger lives on `auth.users`, outside `public`, so it
  was simply absent: anyone could sign up, and baby-logger's "any
  authenticated user" policies would then hand them the baby log.
- Realtime membership was dropped (`--no-publications`), so Baby Logger's
  live sync went quiet.

`backup-dump.sh` fixes each and says how in its comments. If the check goes
red, the backup would not have saved you: fix the dump, not the check.

To restore into a fresh project: download the artifact from the Actions run,
then
`gpg -d backup-YYYY-MM-DD.sql.gz.gpg | gunzip > backup.sql` and
`psql "<new project's session-pooler URI>" -v ON_ERROR_STOP=1 -f backup.sql`.
Users load first, so the rows pointing at them resolve; the allowlist trigger
comes last, so it does not fire on them.

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
and 02:00 SAST that is yesterday. **This has already bitten once**: the
dashboard's `fetchMarvel` bounded its query that way, so in those two hours a
film released *yesterday* came back first and the Today card rendered
"Landing next — past · film". Where a query bound and a rendered label both
depend on "today", derive both from `sastDay()` — and have the card refuse to
render a row that is past anyway, so a bad bound cannot reach the screen.

**Currency formatting is hand-rolled, on purpose.** `toLocaleString('en-ZA')`
groups thousands with U+00A0 on Node, a comma in browsers and something else
again on Deno. The same price appears on a card, in a push notification and in
a test, so price-watch formats by hand. Copy that if you need money elsewhere.

**The same goes for month names.** `toLocaleDateString('en-ZA', {month:'short'})`
is "Sept" on Node and "Sep" in a browser, so a test and the card disagree about
the same day — price-watch's `shortDate` takes the day and month from the
stable `en-CA` ISO output and looks the name up in its own array. Locale-format
anything you want to *read*; never anything you want to *assert*.

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

**Recipe tags drive the filter chips** (`mealprep_recipes.tags text[]`). They
live at the *end* of `seed.sql` as an explicit `update … where id in (…)`
rather than folded into the big insert, so re-tagging is a one-line diff and
the reasoning stays readable. `high-protein` means a real protein serving in
the dish itself — mac & cheese and nachos are deliberately out — and it
excludes all four seafood recipes, which is the household preference and also
exactly what a naive lean-protein filter would surface first.

## Working practice

- `npm test && npm run build` locally is exactly what CI's `build` job runs,
  in that order. Run both before pushing. CI's `functions` job runs
  `npm run check:functions`, a `deno check` of every edge function: their
  deploy never typechecks, so this is the only thing that does. Run it too
  when you touch `supabase/functions/**`.
- Tests are vitest, colocated in `src/lib/__tests__/`. Pure logic lives in
  `src/lib/*.ts` with no React or Supabase imports so it is directly testable.
- `.github/workflows/deploy.yml` runs on pushes to `main` **and on pull
  requests**. Its `build` job installs, tests and builds every app; its
  `deploy` job is skipped on a PR, so a pull request gets the checks and never
  the live site. A broken build is caught before merge, not after.
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

- **The API returns at most 1000 rows per request, and says so quietly.**
  `.limit(2000)` or `.range(0, 49999)` comes back as a 206 with the first 1000
  and no error. Front Row (since retired) asked for 2000 of ~2700 upcoming listings and showed
  about a month ahead, with every undated listing gone; fintrack-pro's
  newest-first load silently dropped its oldest 141 transactions, and would
  have dropped another month with every import. Anything that can outgrow
  1000 rows goes through `fetchAllPages` (`packages/shared/src/paging.ts`),
  with a unique column as the last `.order` so pages cannot overlap.
- A source that goes quiet looks identical to "nothing new". Every syncing app
  records adapter health (`*_sources`) and the UI shows a stale-source banner.
- **A sync that only ever adds is half a sync.** `sync-marvel` upserted what
  TMDB returned and never removed what TMDB had dropped, so three titles TMDB
  retracted upstream — including a bogus `movie/1774182` "VisionQuest" sitting
  next to the real `tv/213375` show — stayed on the slate forever, and one of
  them still had an unsent reminder queued. `marvel-prune-titles` did not
  catch them: it only deletes rows **130+ days past release**, and a retracted
  *future* title never reaches that. The reconcile pass has three guards worth
  keeping if you copy it:
  - **It only runs when every page of every query read cleanly.** One bad
    afternoon at TMDB otherwise reads as "Marvel cancelled everything".
    Paging now walks to the last page rather than stopping at 2, because
    "absent from the results" only means "gone" if you saw all the results.
  - **A row is only eligible if this run would have returned it.** Outside the
    120-day discover window, no `tmdb_id`, `manual`, a Sony *show* — absence
    proves nothing about any of those, so they are never candidates.
  - **`missing_since` + a grace period, never delete on first miss.** Same
    shape as price-watch's `delisted_at`. A title that reappears clears the
    stamp and starts over.

  `sync-f1` had the same hole. Its rows are keyed on (round, session), so
  when a round was inserted mid-2026 Singapore moved from round 16 to 17: the
  sprint was written under r17 and the old r16 sprint stayed, and Sport Watch
  showed it twice. It now retires **future, feed-owned** F1 sessions that no
  run has refreshed for `RETIRE_AFTER_DAYS` (3) — `updated_at` is stamped on
  every session the calendar still carries, so it serves as the missing-since
  clock without a new column — and only after a run whose every write landed.
- Notifiers only record a send **after** delivery succeeds, so a total failure
  retries rather than being silently marked done. **price-watch adds two
  deliberate exceptions**, both meaning "we chose not to send this"
  rather than "we tried and failed": an alert past that run's per-device cap
  (`MAX_PER_DEVICE = 6`), and a device with no push subscription at all. Both
  mark as notified. The second is the one with a consequence — movement that
  happens while notifications are off is burned, so enabling push later starts
  from silence instead of replaying a backlog.
  glovebox does the opposite with the same situation (`continue` without
  marking, so it retries next run). Neither is wrong; just check which kind you
  are editing before copying a notifier.
- A watch/track only reports things that appeared **after it was created**.
  Without that, adding one replays the back catalogue as notifications.
- **Kick-off times are the thing hand-entry gets wrong**, and wrongly by half
  an hour rather than obviously — a Springbok home test is 17:10 for one series
  and 17:40 for another, so a wrong one looks perfectly plausible on the card.
  sport-watch's rugby fixtures now come from **World Rugby's own feed**
  (`api.wr-rims-prod.pulselive.com/rugby/v3/match`, free, no key), which is
  what springboks.rugby and world.rugby are built on. `teams=39` filters
  server-side to the senior men's Springboks, so the U20s, the Springbok Women
  and sevens never come back and no name matching is needed. Times arrive as a
  true epoch in `time.millis` with the venue's `gmtOffset` alongside — never a
  local wall-clock string.
- **`wr_match_id` is what makes a rugby row feed-owned.** `sync-rugby` updates
  date, venue and teams only on rows carrying one, and *claims* a hand-entered
  row the first time it recognises the fixture (same two teams, within 48h)
  instead of inserting a duplicate next to it. A rugby row without one is never
  touched — that is what protects the Nations Championship finals placeholder,
  which has no fixture until the pool standings settle. Same manual-field rule
  as `sync-f1`: channel, note, watch_url, is_special, a non-empty result and
  the competition label are set once and never overwritten.
- **A phone's numeric keypad has no colon on it.** workout-plan's parkrun entry
  asked for "24:53" in one field behind `inputMode="numeric"`, so the time
  could not actually be typed at the finish line — and the fallback, `2453`,
  parsed as *2453 seconds* and silently stored 40:53. It is now two boxes,
  minutes and seconds, with the minutes box handing over focus at two digits.
  `splitTimeText` reads bare digits as mmss and returns null rather than
  guessing. If you build another time or duration field, do the same: never
  ask for a separator the keyboard cannot produce, and never quietly reinterpret
  digits you did not get a separator for.
- Takealot returns two shapes. `buybox_items_type: "summary"` is a **variant
  parent** whose price is the cheapest option, and its
  `is_add_to_cart_available` is false because you must pick a size — reading
  that as "out of stock" silently suppresses alerts for ~40% of results.
- Makro is behind PerimeterX with a CAPTCHA. Not a target.
