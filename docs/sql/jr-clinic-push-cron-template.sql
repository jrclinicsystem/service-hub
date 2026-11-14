-- JR Clinic — Web Push dispatcher: ONLY run manually after both Vault secrets
-- exist, the production origin is confirmed, and Lovable server secrets are configured.
-- This is an operator runbook, NOT an automatic migration.

-- Step 1. In Supabase Dashboard > Vault, create two PRIVATE secrets:
--   jr_clinic_push_origin: HTTPS origin of the actual published site,
--     e.g. https://YOUR-SITE.lovable.app (WITHOUT a trailing / or path)
--   jr_clinic_push_dispatch_secret: exactly the same random secret that
--     the Lovable server uses as PUSH_DISPATCH_SECRET.
-- Never paste either value in this file or commit them.

-- Step 2. Install extensions (once, on the JR Clinic production project).
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Step 3. Ensure the two Vault entries exist before scheduling anything.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='jr_clinic_push_origin')
     or not exists (select 1 from vault.decrypted_secrets where name='jr_clinic_push_dispatch_secret')
  then
    raise exception 'Create both JR Clinic Vault secrets before scheduling';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name='jr_clinic_push_origin'
      and decrypted_secret ~ '^https://[a-zA-Z0-9.-]+(:443)?/?$'
  ) then
    raise exception 'The JR Clinic push origin must be an HTTPS host, without a path';
  end if;
end;
$$;

-- Step 4. One dispatcher attempt every minute, using secrets at execution time.
-- There are NO literal credentials inside cron.job.
select cron.schedule(
  'jr-clinic-push-dispatch',
  '* * * * *',
  $job$
    select net.http_post(
      url := rtrim(
        (select decrypted_secret from vault.decrypted_secrets
          where name='jr_clinic_push_origin'), '/'
      ) || '/api/public/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets
            where name='jr_clinic_push_dispatch_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $job$
);

-- Step 5. Monitoring: run these as separate read-only queries.
-- select jobid, jobname, schedule, active from cron.job
--   where jobname='jr-clinic-push-dispatch';
-- select runid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   where jobid=(select jobid from cron.job
--     where jobname='jr-clinic-push-dispatch')
--   order by runid desc limit 20;
-- select status, count(*) from public.push_deliveries group by status;
-- The cron job recording a successful SQL run DOES NOT prove HTTP delivery.
-- Also inspect net._http_response (privileged only), the server HTTP status,
-- and queue counts; test a real device before trusting the pipeline.

-- Emergency STOP (run separately if needed):
-- select cron.unschedule('jr-clinic-push-dispatch');
