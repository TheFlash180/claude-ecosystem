-- What a restore has to get right besides the rows, as one sorted line per
-- fact. backup.yml runs this against the live project and writes the result
-- into the dump as "-- manifest:" comments; restore-check.sh runs it again
-- against the restored copy and fails on any difference.
--
-- Schema-level only, never data: the output lands in a public job log.
--
-- Each line exists because losing it would break something quietly:
--  fn       a revoked grant (the service_role-only Vault getters) silently
--           reverting to anon-executable, or a definer RPC losing execute
--  table    RLS switched off, or anon/authenticated privileges changed
--  policy   a policy missing or reworded
--  trigger  above all on_auth_fintrack_user_created on auth.users, the
--           signup allowlist that baby-logger's policies depend on
--  realtime a table dropped from the publication (Baby Logger's live sync)
--  default  the grants a table or function created later will get: a new
--           table that anon cannot read breaks an app the day it ships
set search_path = '';

select line from (
  select format('fn %s anon=%s authenticated=%s definer=%s',
                p.oid::regprocedure,
                has_function_privilege('anon', p.oid, 'execute'),
                has_function_privilege('authenticated', p.oid, 'execute'),
                p.prosecdef) as line
    from pg_catalog.pg_proc p
   where p.pronamespace = 'public'::regnamespace
  union all
  select format('table %s rls=%s anon=%s%s%s%s authenticated=%s%s%s%s',
                c.oid::regclass, c.relrowsecurity,
                case when has_table_privilege('anon', c.oid, 'select') then 'r' else '-' end,
                case when has_table_privilege('anon', c.oid, 'insert') then 'a' else '-' end,
                case when has_table_privilege('anon', c.oid, 'update') then 'w' else '-' end,
                case when has_table_privilege('anon', c.oid, 'delete') then 'd' else '-' end,
                case when has_table_privilege('authenticated', c.oid, 'select') then 'r' else '-' end,
                case when has_table_privilege('authenticated', c.oid, 'insert') then 'a' else '-' end,
                case when has_table_privilege('authenticated', c.oid, 'update') then 'w' else '-' end,
                case when has_table_privilege('authenticated', c.oid, 'delete') then 'd' else '-' end)
    from pg_catalog.pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  union all
  select format('policy %s.%s %s %s using=%s check=%s',
                pol.tablename, pol.policyname, pol.cmd, pol.roles,
                coalesce(pol.qual, '-'), coalesce(pol.with_check, '-'))
    from pg_catalog.pg_policies pol
   where pol.schemaname = 'public'
  union all
  select format('trigger %s.%s %s', c.oid::regclass, t.tgname, t.tgfoid::regprocedure)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and c.relnamespace in ('public'::regnamespace, 'auth'::regnamespace)
  union all
  select format('default %s %s', d.defaclobjtype, d.defaclacl)
    from pg_catalog.pg_default_acl d
   where d.defaclnamespace = 'public'::regnamespace and d.defaclrole = 'postgres'::regrole
  union all
  select format('realtime %s.%s', pt.schemaname, pt.tablename)
    from pg_catalog.pg_publication_tables pt
   where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
) facts
order by line collate "C";
