#!/usr/bin/env bash
# Write a restorable dump of the shared project to stdout (see backup.yml and
# CLAUDE.md, "Backups"). Connects with the usual libpq variables (PGHOST,
# PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE). PG_RUN, if set,
# prefixes every psql/pg_dump call; CI uses it to run them from the
# postgres:17 image, because pg_dump must not be older than the server.
#
# "Restorable" is more than "has the rows". A plain `pg_dump --schema=public
# --no-privileges` restored into a fresh project stopped at its own CREATE
# SCHEMA public (section 3), and past that lost three things, each of which
# fails open rather than loudly:
#  - every revoked grant. Default privileges in a new project make every
#    function anon-executable, including the service_role-only Vault getters
#    (get_*_vapid_private_key, get_tmdb_api_key). So privileges are kept.
#  - the signup allowlist trigger, which lives on auth.users and so outside
#    the public schema. Without it anyone can sign up, and baby-logger's
#    "any authenticated user" policies then hand them the baby log.
#  - realtime publication membership, which Baby Logger's live sync needs.
# The dump now carries all three. The last section of this file adds the two
# that live outside public, generated from the live catalog so a new trigger
# or published table is picked up without editing anything here.
#
# tooling/backup-manifest.sql is written in as "-- manifest:" comments, so a
# restore can be checked against the project it came from
# (tooling/restore-check.sh).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
run() { ${PG_RUN:-} "$@"; }
q() { run psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "-- Restorable dump of the shared Supabase project. Restore into a fresh"
echo "-- project with psql -v ON_ERROR_STOP=1 -f (see CLAUDE.md, \"Backups\")."
echo

# 1. Roles the grants below name that a fresh project does not have
# (backup_reader). Created without login: the grants then apply, and a
# restore never brings a working login with it.
q -At <<'SQL' | while read -r role; do
with acl as (
  select unnest(c.relacl) a from pg_class c where c.relnamespace = 'public'::regnamespace
  union all select unnest(p.proacl) from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all select unnest(d.defaclacl) from pg_default_acl d where d.defaclnamespace = 'public'::regnamespace
)
select distinct a.grantee::regrole::text
  from acl, aclexplode(array[acl.a]) a
 where a.grantee <> 0
   and a.grantee::regrole::text not in
       ('anon', 'authenticated', 'service_role', 'postgres', 'supabase_admin', 'pg_database_owner')
 order by 1;
SQL
  printf "DO \$\$ BEGIN\n  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '%s') THEN\n    CREATE ROLE %s NOLOGIN;\n  END IF;\nEND \$\$;\n\n" "$role" "$role"
done

# A fresh project's default privileges grant anon, authenticated and
# service_role everything postgres creates in public. pg_dump writes grants
# relative to Postgres's built-in defaults, not those, so it never revokes
# them: restored on top, a function revoked from anon (the Vault getters)
# came back anon-executable. Switch them off while the schema loads; the
# dump's own ALTER DEFAULT PRIVILEGES, which pg_dump writes after every
# object, puts the live project's back.
cat <<'SQL'
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

SQL

# 2. Users first, as data only: feed_events.logged_by and friends point at
# auth.users, so a restore has to load them before public. A new project
# already has the auth schema itself.
#
# Not pg_dump: backup_reader cannot be given USAGE on schema auth
# (supabase_admin owns it; postgres cannot pass it on), so the rows come
# through backup.auth_users() / auth_identities(), definer functions only this
# role may call. Written in pg_dump's own COPY format with an explicit column
# list that leaves out generated columns (auth.users.confirmed_at), which a
# restore cannot write.
auth_copy() {
  local cols
  cols="$(q -Atc "select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = '$1'
      and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''")"
  [ -n "$cols" ] || { echo "::error::no columns found for auth.$1" >&2; return 1; }
  echo "COPY auth.$1 ($cols) FROM stdin;"
  q -c "\copy (select $cols from backup.auth_$1()) to stdout"
  echo '\.'
  echo
}
auth_copy users
auth_copy identities

# 3. The public schema, with its grants. Two lines are dropped, both for
# things a fresh project already has and postgres, which runs the restore,
# may not create: the public schema itself (naming it with --schema makes
# pg_dump emit CREATE SCHEMA public, and the first real restore stopped
# there), and default privileges belonging to supabase_admin.
run pg_dump --schema=public --no-owner --no-publications --no-subscriptions \
  | grep -v -e '^CREATE SCHEMA public;$' \
            -e '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin '

# 4. What lives outside public but belongs to it. Last, so the users above
# were loaded before the allowlist trigger exists to fire on them.
echo
echo "-- Outside the public schema: triggers on auth tables, realtime membership."
# A trigger is created only if missing: should Supabase ever ship one of
# its own on an auth table, a fresh project already has it, and postgres may
# not drop a trigger on a table it does not own.
q -At <<'SQL'
set search_path = '';
select format(E'DO $$ BEGIN\n  IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid = %L::regclass AND tgname = %L) THEN\n    EXECUTE %L;\n  END IF;\nEND $$;',
              c.oid::regclass, t.tgname, pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where c.relnamespace = 'auth'::regnamespace and not t.tgisinternal
 order by t.tgname;
select format('ALTER PUBLICATION supabase_realtime ADD TABLE ONLY %I.%I;', schemaname, tablename)
  from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public'
 order by tablename;
SQL

# 5. The manifest the restore is checked against.
echo
q -At < "$here/backup-manifest.sql" | sed 's/^/-- manifest: /'
