-- Copy of record: the shared cron secret (migrations edge_cron_secret and
-- edge_cron_secret_jobs). Shared because it spans every app with a cron job.
--
-- The cron-only edge functions run with verify_jwt off, because pg_cron has
-- no user JWT to send. Until this existed they also checked nothing, so
-- anyone with the URL could run any sync or sender at will. Now:
--
--   pg_cron  -> sends x-cron-secret, read from Vault as the job fires
--   function -> fromCron() asks cron_secret_ok(), service_role only, and
--               answers 403 before doing anything if it is wrong or missing
--
-- The value is generated here and never leaves the database: not in a
-- migration, not in an edge function secret, not in this repo. To rotate it,
-- update the Vault secret; the next cron run picks it up on both sides:
--   select vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex'))
--     from vault.secrets where name = 'cron_secret';
--
-- search-pricewatch and sport-calendar are NOT cron-only (the app and a
-- calendar subscription call them) and deliberately do not check it.

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'cron_secret',
  'Sent by pg_cron as x-cron-secret to the cron-only edge functions'
);

create or replace function public.cron_secret_ok(p_secret text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    p_secret <> '' and p_secret = (
      select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
    false);
$$;
revoke all on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;

-- Every cron job that calls an edge function sends the header. The jobs'
-- full commands are documented in each app's schema.sql.
select cron.alter_job(jobid, command := replace(command,
  $q$headers := '{"Content-Type": "application/json"}'::jsonb$q$,
  $q$headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))$q$))
from cron.job
where command like '%/functions/v1/%';
