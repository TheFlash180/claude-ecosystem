-- Default privileges for new tables (follow-up to foundation audit EC-06, 24 November 2026).
-- Applied as migration default_privileges. Rollback: default_privileges.down.sql (same folder).
-- Test: tooling/test-default-privileges.sh (throwaway local Postgres).
--
-- Why: api_write_grants.sql took the write privileges off the existing tables, but the project's default
-- privileges still gave anon and authenticated every privilege on each NEW table that postgres (migrations,
-- the SQL editor, the MCP tools) creates in public. One forgotten grant and a new table would be writable
-- and truncatable by any visitor again.
--
-- What: new tables in public get SELECT for anon and authenticated (row-level security still decides which
-- rows, and an RLS-enabled table with no read policy shows nothing). service_role and backup_reader keep
-- their defaults. Existing tables, sequences and functions are not touched. A new table that an app writes
-- directly needs an explicit grant in its own migration, which is the rule in CLAUDE.md anyway.
-- Tables created by supabase_admin (Supabase's own) keep Supabase's defaults: postgres can't change those.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public grant select on tables to anon, authenticated;
