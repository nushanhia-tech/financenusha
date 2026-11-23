-- Keep only the last 3 days of logs and remove expired sign-in data.
create or replace function finance_private.prune_logs() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  alter table public.audit_logs disable trigger audit_immutable;
  delete from public.audit_logs where created_at < now()-interval '3 days';
  alter table public.audit_logs enable trigger audit_immutable;
  delete from finance_private.auth_attempts where bucket < now()-interval '3 days';
  delete from finance_private.rate_limits where minute < now()-interval '3 days';
  delete from finance_private.login_sessions where expires_at < now();
end $$;
revoke all on function finance_private.prune_logs() from public,anon,authenticated;

-- Run the cleanup now and every night at 02:00 UTC.
select finance_private.prune_logs();
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname='finance-prune-logs';
select cron.schedule('finance-prune-logs','0 2 * * *','select finance_private.prune_logs()');
