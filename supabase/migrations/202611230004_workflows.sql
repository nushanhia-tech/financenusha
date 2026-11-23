create function finance_private.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 perform finance_private.audit(finance_private.actor(),tg_table_name||'_'||lower(tg_op),tg_table_name,new.id,
 case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
do $$
declare name text;
begin
 foreach name in array array['financial_accounts','members','academic_years','departments','events','sponsors','sponsorship_pledges','budgets','budget_revisions','account_reconciliations','app_settings','documents']
 loop
  execute format('create trigger record_change after insert or update on %I for each row execute function finance_private.audit_change()',name);
 end loop;
end $$;

create function finance_private.add_document(p jsonb, who uuid, member uuid, tx uuid, pledge uuid, document_kind text) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare result uuid; object_name text:=p->>'object_path'; object_mime text;
begin
 if split_part(object_name,'/',1)<>who::text or length(coalesce(p->>'file_name','')) not between 1 and 255 then raise exception 'Invalid attachment'; end if;
 select metadata->>'mimetype' into object_mime from storage.objects where bucket_id='finance-documents' and name=object_name;
 if not found or object_mime not in ('application/pdf','image/png','image/jpeg','image/webp') then raise exception 'Upload a PDF or supported image'; end if;
 insert into documents(uploaded_by,member_id,transaction_id,pledge_id,object_path,file_name,mime_type,kind)
 values(who,member,tx,pledge,object_name,p->>'file_name',object_mime,document_kind) returning id into result;
 return result;
end $$;

create function finance_private.submit_proof(p jsonb, who uuid) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare member uuid:=finance_private.member(); result uuid; doc uuid; y uuid:=(p->>'year_id')::uuid; booked date:=(p->>'payment_date')::date;
 event uuid:=nullif(p->>'event_id','')::uuid; amount numeric:=(p->>'amount')::numeric;
begin
 if member is null then raise exception 'An active member account is required'; end if;
 if amount<=0 or scale(amount)>2 or length(trim(coalesce(p->>'reference',''))) not between 1 and 120
 or length(trim(coalesce(p->>'purpose',''))) not between 1 and 160 then raise exception 'Enter a valid amount, reference and purpose'; end if;
 perform finance_private.open_year(y,booked);
 if event is not null and not exists(select from events where id=event and year_id=y) then raise exception 'Event does not match academic year'; end if;
 doc:=finance_private.add_document(p,who,member,null,null,'proof');
 insert into payment_proofs(member_id,document_id,year_id,event_id,amount,payment_date,method,reference,purpose,notes)
 values(member,doc,y,event,amount,booked,p->>'method',trim(p->>'reference'),trim(p->>'purpose'),p->>'notes') returning id into result;
 perform finance_private.tell_admins('Payment proof submitted',p->>'purpose','/admin/verification?id='||result);
 perform finance_private.tell_member(member,'Payment proof submitted','Your payment reference '||(p->>'reference')||' is awaiting review.','/member/payments');
 perform finance_private.audit(who,'payment_proof_submitted','payment_proofs',result,null,(select to_jsonb(x) from payment_proofs x where id=result));
 return result;
end $$;

create function finance_private.review_proof(p jsonb, who uuid) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare pf payment_proofs; t transactions; tx uuid; choice text:=p->>'decision'; note text:=p->>'reason';
begin
 select * into strict pf from payment_proofs where id=(p->>'id')::uuid for update;
 if pf.status='verified' and choice='verify' then return pf.id; end if;
 if pf.status not in ('submitted','under_review') then raise exception 'This proof is already resolved'; end if;
 perform finance_private.open_year(pf.year_id,pf.payment_date);
 if pf.transaction_id is not null then
  if choice='verify' then return pf.id; end if;
  raise exception 'Resolve the linked transaction in Approvals';
 end if;
 if choice='review' then
  update payment_proofs set status='under_review',reviewed_by=who where id=pf.id;
 elsif choice in ('reject','correct') then
  if nullif(trim(note),'') is null then raise exception 'Enter a reason'; end if;
  update payment_proofs set status='rejected',reviewed_by=who,review_note=note,correction_requested=choice='correct' where id=pf.id;
  perform finance_private.tell_member(pf.member_id,case when choice='correct' then 'Payment correction requested' else 'Payment rejected' end,note,'/member/payments');
 elsif choice='verify' then
  tx:=nullif(p->>'transaction_id','')::uuid;
  if tx is not null then
   select * into strict t from transactions where id=tx and state='posted' for share;
   if t.kind<>'income' or t.operation not in ('standard','due_payment') or t.year_id<>pf.year_id
     or t.amount<>pf.amount or t.member_id is distinct from pf.member_id or t.method is distinct from pf.method
     or t.transaction_date<>pf.payment_date or t.event_id is distinct from pf.event_id
     or lower(trim(t.reference)) is distinct from lower(trim(pf.reference))
     or exists(select from transaction_reversals where original_id=tx)
   then raise exception 'Existing posted income must match the member, amount, payment date, reference, method and event'; end if;
   update payment_proofs set status='verified',transaction_id=tx,reviewed_by=who,review_note=note where id=pf.id;
   perform finance_private.tell_member(pf.member_id,'Payment verified','Your payment is linked to '||t.code||'.','/member/receipts');
  else
   tx:=finance_private.save_transaction(jsonb_build_object('year_id',pf.year_id,'transaction_date',pf.payment_date,
   'kind','income','amount',pf.amount,'description',pf.purpose,'member_id',pf.member_id,'event_id',pf.event_id,
   'account_id',p->>'account_id','method',pf.method,'reference',pf.reference,'category_id',p->>'category_id',
   'operation',case when p->>'operation'='due_payment' then 'due_payment' else 'standard' end),who);
   update payment_proofs set status='under_review',transaction_id=tx,reviewed_by=who,review_note=note where id=pf.id;
   perform finance_private.submit_transaction(tx,who);
   if (select state from transactions where id=tx)='approved' then perform finance_private.post_transaction(tx,who); end if;
  end if;
 else raise exception 'Choose a review decision';
 end if;
 perform finance_private.audit(who,'payment_proof_'||choice,'payment_proofs',pf.id,to_jsonb(pf),(select to_jsonb(x) from payment_proofs x where id=pf.id));
 return pf.id;
end $$;

create function finance_private.close_year(yid uuid, who uuid) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare y academic_years; result uuid; deb numeric; cred numeric;
begin
 select * into strict y from academic_years where id=yid for update;
 if y.closed_at is not null then return y.id; end if;
 if (now() at time zone 'Asia/Kolkata')::date<=y.end_date then raise exception 'The academic year has not ended'; end if;
 if exists(select from academic_years where end_date<y.start_date and closed_at is null) then raise exception 'Close earlier academic years first'; end if;
 if exists(select from transactions where year_id=y.id and state in ('draft','pending','approved'))
  or exists(select from payment_proofs where year_id=y.id and status in ('submitted','under_review'))
  or exists(select from budget_revisions r join budgets b on b.id=r.budget_id where b.year_id=y.id and r.status='pending')
 then raise exception 'Resolve drafts, approvals, budget revisions and payment proofs before closing'; end if;
 if exists(select from financial_accounts f where exists(select from journal_entries j join transactions t on t.id=j.transaction_id where t.year_id=y.id and j.chart_id=f.chart_id)
  and not exists(select from account_reconciliations a where a.account_id=f.id and a.year_id=y.id and a.statement_date=y.end_date and a.actual_balance=a.system_balance
    and a.system_balance=(select coalesce(sum(j.debit-j.credit),0) from journal_entries j join transactions t on t.id=j.transaction_id where j.chart_id=f.chart_id and t.transaction_date<=y.end_date)
    and jsonb_array_length(a.unmatched)=0))
 then raise exception 'Reconcile affected accounts to the year-end date before closing'; end if;
 select sum(greatest(balance,0)),sum(greatest(-balance,0)) into deb,cred from (
  select sum(j.debit-j.credit) as balance from journal_entries j join chart_of_accounts c on c.id=j.chart_id
  join transactions t on t.id=j.transaction_id where c.kind in ('income','expense') and t.year_id=y.id group by j.chart_id
 ) totals;
 if coalesce(deb+cred,0)>0 then
  insert into transactions(year_id,transaction_date,kind,operation,amount,description,state,created_by,verified_by,posted_at)
  values(y.id,y.end_date,'adjustment','closing',greatest(deb,cred),'Close '||y.name,'approved',who,null,null) returning id into result;
  insert into journal_entries(transaction_id,chart_id,debit,credit)
   select result,j.chart_id,greatest(sum(j.credit-j.debit),0),greatest(sum(j.debit-j.credit),0)
   from journal_entries j join chart_of_accounts c on c.id=j.chart_id join transactions t on t.id=j.transaction_id
   where c.kind in ('income','expense') and t.year_id=y.id group by j.chart_id having sum(j.debit-j.credit)<>0;
  if deb<>cred then
   insert into journal_entries(transaction_id,chart_id,debit,credit) values(result,finance_private.chart('3200'),greatest(deb-cred,0),greatest(cred-deb,0));
  end if;
  update transactions set state='posted',posted_at=now(),verified_by=who where id=result;
  perform finance_private.audit(who,'transaction_posted','transactions',result,null,jsonb_build_object('year_id',y.id,'operation','closing'));
 end if;
 update academic_years set closed_at=now(),active=false where id=y.id;
 perform finance_private.tell_admins('Academic year closed',y.name||' has been locked.','/admin/years');
 return y.id;
end $$;

create function public.finance_command(command text, p jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare who uuid:=finance_private.actor(); item uuid:=nullif(p->>'id','')::uuid;
 y uuid:=nullif(p->>'year_id','')::uuid; member uuid:=finance_private.member(); t transactions; r budget_revisions;
 b budgets; account uuid; chart uuid; s numeric; lines jsonb; unmatched jsonb; booked date; e events; row jsonb; idx int;
begin
 if who is null then raise exception 'Sign in with an active account' using errcode='42501'; end if;
 perform finance_private.limit_action(who,case when command='proof_submit' then 'proof' when command in ('report_export','statement_export') then 'export' else command end,
  case when command='proof_submit' then 5 when command in ('report_export','statement_export') then 15 else 100 end);
 case command
  when 'login' then perform finance_private.audit(who,'user_login','users',who); return who;
  when 'notification_read' then
   update notifications set read_at=now() where user_id=who and (item is null or id=item) and read_at is null; return who;
  when 'profile_update' then
   if member is null then raise exception 'Active member required'; end if;
   update members set phone=nullif(left(trim(p->>'phone'),32),'') where id=member; return member;
  when 'proof_submit' then return finance_private.submit_proof(p,who);
  when 'statement_export' then
   if member is null then raise exception 'Active member required'; end if;
   perform finance_private.audit(who,'statement_export','members',member,null,p); return member;
  else null;
 end case;
 perform finance_private.require_admin();
 case command
  when 'transaction_save' then return finance_private.save_transaction(p,who);
  when 'transaction_submit' then return finance_private.submit_transaction(item,who);
  when 'transaction_post' then return finance_private.post_transaction(item,who);
  when 'transaction_decide' then return finance_private.decide_transaction(item,who,p->>'decision',p->>'reason');
  when 'transaction_reverse' then return finance_private.reverse_transaction(item,who,y,(p->>'transaction_date')::date,p->>'reason');
  when 'proof_review' then return finance_private.review_proof(p,who);
  when 'year_save' then
   if item is not null then raise exception 'Edit accounting periods through the dedicated workflows'; end if;
   insert into academic_years(name,start_date,end_date) values(trim(p->>'name'),(p->>'start_date')::date,(p->>'end_date')::date) returning id into item;
  when 'year_activate' then
   perform pg_advisory_xact_lock(678102);
   perform finance_private.open_year(item);
   update academic_years set active=false where active and id<>item;
   update academic_years set active=true where id=item;
  when 'year_close' then return finance_private.close_year(item,who);
  when 'year_notice' then
   perform finance_private.open_year(item);
   perform finance_private.tell_admins('Academic year closing',(select name||' ends on '||end_date from academic_years where id=item),'/admin/years');
  when 'department_save' then
   if item is null then insert into departments(name,description) values(trim(p->>'name'),coalesce(p->>'description','')) returning id into item;
   else update departments set name=trim(p->>'name'),description=coalesce(p->>'description','') where id=item; end if;
  when 'event_save' then
   perform finance_private.open_year(y,(p->>'event_date')::date);
   if item is null then
    insert into events(name,event_date,year_id,department_id,description)
     values(trim(p->>'name'),(p->>'event_date')::date,y,nullif(p->>'department_id','')::uuid,coalesce(p->>'description','')) returning id into item;
   else
    select * into strict e from events where id=item for update;
    if e.year_id<>y then raise exception 'The original academic year cannot be changed'; end if;
    update events set name=trim(p->>'name'),event_date=(p->>'event_date')::date,department_id=nullif(p->>'department_id','')::uuid,
     description=coalesce(p->>'description','') where id=item;
   end if;
  when 'member_save' then
   if item is null then
    perform finance_private.open_year(y);
    insert into members(name,email,phone,department_id,year_id,payment_profile)
    values(trim(p->>'name'),lower(trim(p->>'email')),nullif(p->>'phone',''),nullif(p->>'department_id','')::uuid,y,nullif(p->>'payment_profile','')) returning id into item;
    insert into member_accounts(member_id) values(item);
   else
    update members set name=trim(p->>'name'),email=case when user_id is null then lower(trim(p->>'email')) else email end,
     phone=nullif(p->>'phone',''),department_id=nullif(p->>'department_id','')::uuid, payment_profile=nullif(p->>'payment_profile','') where id=item and year_id=y;
   end if;
  when 'member_import' then
   perform finance_private.open_year(y);
   if jsonb_typeof(p->'rows')<>'array' or jsonb_array_length(p->'rows') not between 1 and 500 then raise exception 'Import 1–500 members per batch'; end if;
   for row in select value from jsonb_array_elements(p->'rows') loop
    if coalesce(length(trim(row->>'name')),0)<1 or coalesce(row->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Invalid member name or email'; end if;
    insert into members(name,email,phone,department_id,year_id)
     values(trim(row->>'name'),lower(trim(row->>'email')),nullif(row->>'phone',''),nullif(p->>'department_id','')::uuid,y) returning id into item;
    insert into member_accounts(member_id) values(item);
   end loop;
  when 'member_status' then
   update members set active=(p->>'active')::boolean where id=item;
   update users set active=(p->>'active')::boolean where role='MEMBER' and id=(select user_id from members where id=item);
  when 'member_reminder' then
   if coalesce((select sum(due_delta) from member_ledger_entries where member_id=item),0)<=0 then raise exception 'This member has no outstanding dues'; end if;
   perform finance_private.tell_member(item,'Dues reminder','You have an outstanding union balance. Review your dues for details.','/member/dues');
   perform finance_private.audit(who,'dues_reminder','members',item);
  when 'account_save' then
   if item is null then
    insert into chart_of_accounts(code,name,kind) values('F-'||gen_random_uuid(),trim(p->>'name'),'asset') returning id into chart;
    insert into financial_accounts(chart_id,name,kind) values(chart,trim(p->>'name'),p->>'kind') returning id into item;
   else
    update financial_accounts set name=trim(p->>'name'), active=coalesce((p->>'active')::boolean,active) where id=item returning chart_id into chart;
    update chart_of_accounts set name=trim(p->>'name') where id=chart;
   end if;
  when 'reconcile' then
   account:=(p->>'account_id')::uuid; booked:=(p->>'statement_date')::date; lines:=coalesce(p->'lines','[]'::jsonb);
   perform finance_private.open_year(y,booked);
   select chart_id into strict chart from financial_accounts where id=account;
   if jsonb_typeof(lines)<>'array' or jsonb_array_length(lines)>1000 then raise exception 'Enter up to 1,000 statement lines'; end if;
   if exists(select from jsonb_array_elements(lines) l group by lower(trim(l->>'reference')) having count(*)>1) then raise exception 'Statement references must be unique'; end if;
   select coalesce(sum(j.debit-j.credit),0) into s from journal_entries j join transactions x on x.id=j.transaction_id
    where j.chart_id=chart and x.transaction_date<=booked;
   select coalesce(jsonb_agg(line),'[]') into unmatched from jsonb_array_elements(lines) line where not exists(
    select from journal_entries j join transactions x on x.id=j.transaction_id where j.chart_id=chart
    and x.transaction_date<=booked and lower(trim(x.reference))=lower(trim(line->>'reference')) and j.debit-j.credit=(line->>'amount')::numeric
   );
   if jsonb_array_length(lines)>0 then
    unmatched:=unmatched||coalesce((select jsonb_agg(jsonb_build_object('system_only',true,'code',x.code,'reference',x.reference,'amount',j.debit-j.credit))
    from journal_entries j join transactions x on x.id=j.transaction_id
    where j.chart_id=chart and x.year_id=y and x.transaction_date<=booked and x.operation<>'opening'
    and not exists(select from jsonb_array_elements(lines) line where lower(trim(x.reference))=lower(trim(line->>'reference')) and j.debit-j.credit=(line->>'amount')::numeric)), '[]');
   end if;
   insert into account_reconciliations(account_id,year_id,statement_date,actual_balance,system_balance,lines,unmatched,created_by)
   values(account,y,booked,(p->>'actual_balance')::numeric,s,lines,unmatched,who) returning id into item;
  when 'sponsor_save' then
   if item is null then
    insert into sponsors(name,kind,email,notes) values(trim(p->>'name'),p->>'kind',nullif(p->>'email',''),p->>'description') returning id into item;
   else update sponsors set name=trim(p->>'name'),email=nullif(p->>'email',''),notes=p->>'description' where id=item; end if;
  when 'pledge_save' then
   perform finance_private.open_year(y,nullif(p->>'due_date','')::date);
   if nullif(p->>'event_id','') is not null and not exists(select from events where id=(p->>'event_id')::uuid and year_id=y) then raise exception 'Select an event in the academic year'; end if;
   insert into sponsorship_pledges(sponsor_id,event_id,year_id,amount,due_date)
   values((p->>'sponsor_id')::uuid,nullif(p->>'event_id','')::uuid,y,(p->>'amount')::numeric,nullif(p->>'due_date','')::date) returning id into item;
  when 'budget_save' then
   perform finance_private.open_year(y);
   if nullif(p->>'event_id','') is not null and not exists(select from events where id=(p->>'event_id')::uuid and year_id=y) then raise exception 'Select an event in the academic year'; end if;
   insert into budgets(year_id,scope,name,department_id,event_id,category_id,amount)
   values(y,p->>'scope',trim(p->>'name'),nullif(p->>'department_id','')::uuid,nullif(p->>'event_id','')::uuid,nullif(p->>'category_id','')::uuid,(p->>'amount')::numeric) returning id into item;
  when 'budget_revise' then
   select * into strict b from budgets where id=item;
   perform finance_private.open_year(b.year_id);
   insert into budget_revisions(budget_id,amount,reason,created_by) values(item,(p->>'amount')::numeric,p->>'reason',who) returning id into item;
   perform finance_private.tell_admins('Budget revision requested',b.name,'/admin/budgets');
  when 'budget_decide' then
   select * into strict r from budget_revisions where id=item and status='pending' for update;
   select * into strict b from budgets where id=r.budget_id for update;
   perform finance_private.open_year(b.year_id);
   if r.created_by=who and (select maker_checker from app_settings) then raise exception 'Maker-checker requires a different administrator'; end if;
   update budget_revisions set decided_by=who,status=p->>'decision' where id=item;
   if p->>'decision'='approved' then update budgets set amount=r.amount where id=b.id; end if;
  when 'document_add' then
   if nullif(p->>'transaction_id','') is not null then
    select * into strict t from transactions where id=(p->>'transaction_id')::uuid for share;
    perform finance_private.open_year(t.year_id);
   end if;
   if nullif(p->>'pledge_id','') is not null then
    select year_id into strict y from sponsorship_pledges where id=(p->>'pledge_id')::uuid;
    perform finance_private.open_year(y);
   end if;
   return finance_private.add_document(p,who,t.member_id,t.id,nullif(p->>'pledge_id','')::uuid,p->>'kind');
  when 'settings_save' then
   if (p->>'mfa_required')::boolean and auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'Complete an MFA challenge before enabling admin MFA'; end if;
   update app_settings set approval_threshold=(p->>'approval_threshold')::numeric,high_threshold=(p->>'high_threshold')::numeric,
   maker_checker=(p->>'maker_checker')::boolean,mfa_required=(p->>'mfa_required')::boolean,budget_warning=(p->>'budget_warning')::numeric returning id into item;
  when 'report_export' then perform finance_private.audit(who,'report_export','reports',null,null,p); return who;
  else raise exception 'Unknown finance command';
 end case;
 return item;
end $$;

create function public.link_member_login(member_id uuid, user_id uuid, requested_by uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare profile members; auth_email text;
begin
 select * into strict profile from members m where m.id=member_id and m.active for update;
 if profile.user_id is not null and profile.user_id<>link_member_login.user_id then raise exception 'Member already has a login'; end if;
 if not exists(select from users where id=requested_by and role<>'MEMBER' and active) then raise exception 'Administrator required'; end if;
 select lower(email) into strict auth_email from auth.users u where u.id=link_member_login.user_id;
 if auth_email is distinct from lower(profile.email) then raise exception 'Email mismatch'; end if;
 insert into users(id,name,role) values(user_id,profile.name,'MEMBER') on conflict(id) do nothing;
 if not exists(select from users where id=link_member_login.user_id and role='MEMBER') then raise exception 'Cannot link an administrator'; end if;
 update members m set user_id=link_member_login.user_id where m.id=member_id;
 perform finance_private.audit(requested_by,'member_login_linked','members',member_id,null,jsonb_build_object('user_id',link_member_login.user_id));
 return member_id;
end $$;
revoke all on function public.finance_command(text,jsonb),public.link_member_login(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.finance_command(text,jsonb) to authenticated;
grant execute on function public.link_member_login(uuid,uuid,uuid) to service_role;
revoke all on all functions in schema finance_private from public, anon, authenticated;
grant execute on function finance_private.actor(),finance_private.is_admin(),finance_private.member(),finance_private.owned_unregistered_object(text) to authenticated;
