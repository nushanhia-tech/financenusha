create schema if not exists finance_private;
revoke all on schema finance_private from public;
grant usage on schema finance_private to authenticated;

create function finance_private.actor() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select id from users where id=auth.uid() and active
$$;
create function finance_private.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from users u cross join app_settings s where u.id=finance_private.actor() and u.role<>'MEMBER'
 and (not s.mfa_required or auth.jwt()->>'aal'='aal2'))
$$;
create function finance_private.member() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
 select m.id from members m join users u on u.id=m.user_id where m.user_id=finance_private.actor() and m.active and u.role='MEMBER'
$$;
create function finance_private.require_admin() returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not finance_private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 return finance_private.actor();
end $$;
create function finance_private.audit(who uuid, verb text, target text, target_id uuid, before_data jsonb default null, after_data jsonb default null)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into audit_logs(actor_id,action,entity,entity_id,before_values,after_values) values(who,verb,target,target_id,before_data,after_data)
$$;
create function finance_private.tell_member(member uuid, title text, body text, path text)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into notifications(user_id,title,message,href) select user_id,title,body,path from members where id=member and user_id is not null
$$;
create function finance_private.tell_admins(title text, body text, path text)
returns void language sql security definer set search_path=public,pg_temp as $$
 insert into notifications(user_id,title,message,href) select id,title,body,path from users where active and role<>'MEMBER'
$$;
create function finance_private.open_year(year uuid, booked date default null) returns academic_years language plpgsql set search_path=public,pg_temp as $$
declare y academic_years;
begin
 select * into y from academic_years where id=year for share;
 if not found or y.closed_at is not null then raise exception 'Select an open academic year'; end if;
 if booked is not null and booked not between y.start_date and y.end_date then raise exception 'Date falls outside the academic year'; end if;
 return y;
end $$;
create function finance_private.append_only() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'This record is immutable'; end $$;
create function finance_private.lock_accounting() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.state='posted' then raise exception 'Posted transactions are immutable. Use a reversal.'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger posted_immutable before update or delete on transactions for each row execute function finance_private.lock_accounting();
create trigger audit_immutable before update or delete on audit_logs for each row execute function finance_private.append_only();
create trigger journal_immutable before update or delete on journal_entries for each row execute function finance_private.append_only();
create trigger ledger_immutable before update or delete on member_ledger_entries for each row execute function finance_private.append_only();
create trigger receipts_immutable before update or delete on receipts for each row execute function finance_private.append_only();
create trigger approval_immutable before update or delete on approvals for each row execute function finance_private.append_only();
create function finance_private.year_lock() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.closed_at is not null then raise exception 'Closed academic years are immutable'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger year_lock before update or delete on academic_years for each row execute function finance_private.year_lock();

do $$
declare item text;
begin
 foreach item in array array['users','members','member_accounts','academic_years','departments','events','chart_of_accounts','financial_accounts','transaction_categories',
 'transactions','journal_entries','member_ledger_entries','member_dues','payment_proofs','receipts','documents','budgets','budget_revisions',
 'sponsors','sponsorship_pledges','approvals','account_reconciliations','transaction_reversals','notifications','audit_logs','app_settings']
 loop
  execute format('alter table %I enable row level security',item);
  execute format('revoke all on %I from anon, authenticated',item);
  execute format('grant select on %I to authenticated',item);
  if item<>'notifications' then
   execute format('create policy admin_read on %I for select to authenticated using ((select finance_private.is_admin()))',item);
  end if;
 end loop;
end $$;
create policy user_self on users for select to authenticated using(id=(select finance_private.actor()));
create policy member_self on members for select to authenticated using(id=(select finance_private.member()));
create policy member_self on member_accounts for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on member_ledger_entries for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on member_dues for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on payment_proofs for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on receipts for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on documents for select to authenticated using(member_id=(select finance_private.member()));
create policy member_self on transactions for select to authenticated using(member_id=(select finance_private.member()) and state='posted');
create policy user_inbox on notifications for select to authenticated using(user_id=(select finance_private.actor()));
create policy member_year_choices on academic_years for select to authenticated using((select finance_private.member()) is not null);
create policy member_event_choices on events for select to authenticated using((select finance_private.member()) is not null);
create policy member_department_choices on departments for select to authenticated using((select finance_private.member()) is not null);
create policy member_categories on transaction_categories for select to authenticated using((select finance_private.member()) is not null);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-documents','finance-documents',false,4194304,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
create policy finance_upload on storage.objects for insert to authenticated with check(
 bucket_id='finance-documents' and (storage.foldername(name))[1]=auth.uid()::text
 and ((select finance_private.is_admin()) or (select finance_private.member()) is not null)
);
create function finance_private.owned_unregistered_object(path text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select split_part(path,'/',1)=auth.uid()::text and (finance_private.is_admin() or finance_private.member() is not null)
 and not exists(select from documents d where d.object_path=path)
$$;
create policy finance_download on storage.objects for select to authenticated using(
 bucket_id='finance-documents' and (exists(select from public.documents d where d.object_path=storage.objects.name)
 or finance_private.owned_unregistered_object(name))
);
create policy finance_cleanup on storage.objects for delete to authenticated using(
 bucket_id='finance-documents' and finance_private.owned_unregistered_object(name)
);

create table finance_private.rate_limits(
 actor_id uuid not null, action text not null, minute timestamptz not null, count integer not null,
 primary key(actor_id,action,minute)
);
create function finance_private.limit_action(who uuid, verb text, maximum integer) returns void language plpgsql
set search_path=public,pg_temp as $$
declare n integer;
begin
 delete from finance_private.rate_limits where minute < now()-interval '1 hour' and actor_id=who and action=verb;
 insert into finance_private.rate_limits values (who,verb,date_trunc('minute',now()),1)
 on conflict(actor_id,action,minute) do update set count=finance_private.rate_limits.count+1 returning count into n;
 if n>maximum then raise exception 'Too many requests. Try again in a minute.' using errcode='P0001'; end if;
end $$;
revoke all on all functions in schema finance_private from public, anon, authenticated;
grant execute on function finance_private.actor(),finance_private.is_admin(),finance_private.member(),finance_private.owned_unregistered_object(text) to authenticated;
