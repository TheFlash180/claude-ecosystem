# ADR-0001: One shared Supabase project on the Free plan

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-24 |
| Decided by | Rickus (approver), proposed by Claude |
| Project | claude-ecosystem (and every app that shares its Supabase project) |
| Review by | 2027-05-24, or earlier when: the database passes 250 MB (half the Free limit); a new app or a new kind of personal information joins the project; a paying client's data would be added; or the side business can carry a paid plan |

Foundation audit of 2026-11-23, findings EC-07 (no ADR for the shared project) and EC-08 (backup cadence and
uptime checks not recorded). Cre-Grow's side of the same decision is its own
[ADR-0001](https://github.com/TheFlash180/cre-grow/blob/main/docs/adr/0001-shared-supabase-project.md).

## Context

The foundation's architecture standard asks for an ADR whenever infrastructure is shared or a free tier holds
real data, and both apply here. One Supabase project (`objkdeagyltvgcuxsnxu`, eu-central-1, Frankfurt) holds:

| Who | What | Personal information |
|---|---|---|
| This repo's household apps | `public`: Baby Logger, Workout Plan, Glovebox, Meal Prep, Price Watch, Marvel Watch, Sport Watch, the hub | Yes: a baby's feeds, sleep and weight; body measurements; names and licence dates; push subscriptions |
| Pocket Arcade (external repo) | `public`: `arcade_*` | Player names; hashed device tokens |
| Cre-Grow (client app, family) | schema `lesson_print`, bucket `lesson-files` | Yes: children's names, schools, class days; minors' contact details |

Facts checked on 2026-11-24 (live metadata only, no rows read): database 40 MB, storage 15 MB, 65 tables in
`public`, 8 in `lesson_print`.
The baby registry's tables (`items`, `claims` and so on), listed in `CLAUDE.md` as owned by baby-registry-pwa,
are not in the project any more.

Plan limits, as checked for Cre-Grow's ADR on 2026-11-23:

- **Free plan, two active free projects per organisation.** Both are in use: this project and SmartStock.
  Verified: https://supabase.com/docs/guides/platform/billing-faq — checked 2026-11-23.
- **Read-only above 500 MB** of database. Verified: https://supabase.com/docs/guides/platform/database-size
  — checked 2026-11-23.
- **Paused after 7 days of low activity.** Verified:
  https://supabase.com/docs/guides/platform/free-project-pausing — checked 2026-11-15.
- No backups you can download on the Free plan.

## Options considered

| Option | Pros | Cons | Cost |
|---|---|---|---|
| A. One project per app | Clean isolation, separate quotas | Not possible on Free: two projects per organisation, both in use | Free plan can't do it |
| B. Paid plan, separate projects for the client data | Isolation; daily backups by Supabase | A monthly cost before the side business has stable income | Paid; see https://supabase.com/pricing (check at decision time) |
| C. Keep one shared Free project, with the conditions below | No cost; nothing to migrate; the household apps share one sign-in | Shared quota, outages and mistakes; isolation depends on tested access rules | Free |

## Decision

Option C. Everything stays in the one Free project while the conditions below hold. Cre-Grow's place in it is
its own recorded exception (its ADR-0001). A **paying** client's data never goes into this project.

## Conditions

1. **Access rules are tested on every pull request**, in both directions:
   - household data only for household members (`tooling/test-household-access.sh`, EC-01 and EC-02);
   - the API roles read, never write directly (`tooling/test-api-write-grants.sh`, EC-06);
   - Cre-Grow's isolation (`supabase/tests/rls_isolation.sh` in cre-grow).
2. **Every new table or function is checked for its grants** when it is created (`CLAUDE.md`, "A new table
   needs its grants"). The project's default privileges still give the API roles everything on new tables in
   `public` (checked 2026-11-23).
3. **Daily, encrypted, restore-tested backups** (`.github/workflows/backup.yml`). Cre-Grow has its own.
   - **Cadence: daily** from 2026-11-24 (weekly before). Rickus's decision on 2026-11-24 (EC-08). It costs
     nothing, and once the baby arrives Baby Logger is written to every few hours.
   - **Kept 90 days**, longer than the foundation's 30-day default: a row deleted in an app stays in the
     backups for up to 90 days. The data is the household's own, plus the external apps' data above.
   - The restore check runs on every backup; a red one means the backup would not have saved us.
4. **No uptime check: an accepted risk** (EC-08). Rickus accepted on 2026-11-24 that nothing checks the site
   or the project is up. The two of them use the apps daily, so they would notice an outage. The morning
   summary also reports feeds that stopped syncing, and the keep-alive workflow fails visibly if Supabase does
   not answer. Revisit if an app starts serving anyone outside the household.
5. **The quota stays bounded.** The database is far below the 500 MB read-only limit (40 MB). Cre-Grow's
   feedback endpoint has volume limits (its migration 0017). Review this ADR at 250 MB.

## Consequences and trade-offs

- Easier: one sign-in across the household apps; no cost; one backup and one set of tests.
- Harder: a schema change in one app lands in every app's database. The sign-up trigger is shared, which is
  how EC-01 happened, so a change to shared infrastructure needs a check of every app that relies on it.
- Exit plan: the backup restores into a new project (`CLAUDE.md`, "Backups"). Each app keeps its tables under
  its own prefix, and Cre-Grow keeps its own schema, so one app can be moved on its own: restore its tables,
  point its `VITE_SUPABASE_URL` and key at the new project, then remove them here.

## Costs and limits

Free. Shared limits: 500 MB database, 1 GB storage, pausing after 7 days idle (the keep-alive workflow runs
Monday and Thursday, and the nightly backup also keeps it active). GitHub Actions minutes and artifact storage
are free for this public repository.

## Security and privacy implications

- **Household data:** POPIA does not apply to processing in the course of a purely personal or household
  activity (section 6(1)(a)). This covers the household's own apps. It does not cover Cre-Grow or Pocket Arcade's
  players.
- **Cre-Grow:** children's personal information. Its ADR-0001 records the legal-basis and cross-border
  (Frankfurt) points for its responsible party.
- **Backups:** encrypted with `BACKUP_PASSPHRASE` before upload, because this repository and its artifacts are
  public to signed-in GitHub users.
- **Secrets:** Vault holds the VAPID, TMDB and cron secrets; only `service_role` can read them.

## Verification

- The access tests in condition 1 run on every pull request and push to `main`.
- Each nightly backup is restored and compared in the same run.
- Review by the date or triggers at the top.

## References

- Foundation `standards/architecture.md` ("Choosing the architecture", "Client isolation and ownership"),
  `standards/reliability-and-backups.md` ("Cadence and retention", "Health checks and monitoring"),
  `standards/privacy-and-popia.md`.
- Foundation audit report `engineering-knowledge/project-audits/claude-ecosystem.md` (EC-01 to EC-10).
- `CLAUDE.md` in this repository: "The shared Supabase project", "Backups".
