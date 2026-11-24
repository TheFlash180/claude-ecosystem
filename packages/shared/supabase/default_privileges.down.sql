-- Rollback of default_privileges.sql: new tables in public again give anon and authenticated every
-- privilege, as the project's defaults did on 23 November 2026. Use it only to undo a broken rollout.

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
