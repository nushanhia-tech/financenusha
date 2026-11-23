create function finance_private.check_journal() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare tx_id uuid; deb numeric; cred numeric; n integer; posted boolean; expected numeric;
begin
 if tg_table_name='transactions' then tx_id:=new.id; else tx_id:=new.transaction_id; end if;
 select state='posted',amount into posted,expected from transactions where id=tx_id;
 select coalesce(sum(debit),0),coalesce(sum(credit),0),count(distinct chart_id) into deb,cred,n from journal_entries where transaction_id=tx_id;
 if (posted and (deb<=0 or deb<>cred or deb<>expected or n<2)) or (not posted and n>0) then
  raise exception 'Journal must balance and belong to a posted transaction';
 end if;
 return null;
end $$;
create constraint trigger journal_balanced after insert on journal_entries deferrable initially deferred for each row execute function finance_private.check_journal();
create constraint trigger transaction_balanced after insert or update on transactions deferrable initially deferred for each row execute function finance_private.check_journal();

create function finance_private.guard_journal_insert() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare tx transactions;
begin
 select * into strict tx from transactions where id=new.transaction_id for update;
 if tx.state<>'approved' then raise exception 'Only an approved transaction can receive journal entries'; end if;
 perform finance_private.open_year(tx.year_id,tx.transaction_date);
 return new;
end $$;
create trigger journal_write_guard before insert on journal_entries for each row execute function finance_private.guard_journal_insert();

create function finance_private.chart(account_code text) returns uuid language sql stable set search_path=public,pg_temp as $$
 select id from chart_of_accounts where code=account_code
$$;

create function finance_private.post_transaction(tx_id uuid, who uuid) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare t transactions; original transactions; fa uuid; dest uuid; category chart_of_accounts; dr uuid; cr uuid; pf payment_proofs;
 cash_change numeric:=0; due_change numeric:=0; payable_change numeric:=0; advance_change numeric:=0;
 due_total numeric; payable_total numeric; advance_total numeric; receipt_no text; b record;
begin
 select * into strict t from transactions where id=tx_id for update;
 if t.state='posted' then return tx_id; end if;
 if t.state<>'approved' then raise exception 'Transaction still requires approval'; end if;
 perform finance_private.open_year(t.year_id,t.transaction_date);
 select chart_id into fa from financial_accounts where id=t.account_id and active;
 select chart_id into dest from financial_accounts where id=t.destination_id and active;
 select c.* into category from transaction_categories tc join chart_of_accounts c on c.id=tc.chart_id where tc.id=t.category_id;

 if t.kind='reversal' then
  select * into strict original from transactions where id=t.related_transaction_id and state='posted' for update;
  if original.kind='reversal' or original.operation='closing' or t.transaction_date<original.transaction_date then raise exception 'Invalid reversal'; end if;
  if original.member_id is not null then
   select -l.cash_delta,-l.due_delta,-l.payable_delta,-l.advance_delta into strict cash_change,due_change,payable_change,advance_change
   from member_ledger_entries l where l.transaction_id=original.id;
  end if;
 elsif t.operation='due' and t.kind='income' and category.kind='income' then
  dr:=finance_private.chart('1100'); cr:=category.id; due_change:=t.amount;
 elsif t.operation='due_payment' and t.kind='income' then
  dr:=fa; cr:=finance_private.chart('1100'); cash_change:=t.amount; due_change:=-t.amount;
 elsif t.operation='payable' and t.kind='reimbursement' then
  dr:=finance_private.chart('5200'); cr:=finance_private.chart('2100'); payable_change:=t.amount;
 elsif t.operation='payable_payment' and t.kind='reimbursement' then
  dr:=finance_private.chart('2100'); cr:=fa; cash_change:=-t.amount; payable_change:=-t.amount;
 elsif t.operation='advance_settlement' and t.kind='advance' then
  dr:=fa; cr:=finance_private.chart('1200'); cash_change:=t.amount; advance_change:=-t.amount;
 elsif t.operation='opening' and t.kind='adjustment' then
  dr:=fa; cr:=finance_private.chart('3100');
  if exists(select from transactions where year_id<>t.year_id and state='posted' and transaction_date<t.transaction_date)
    or exists(select from transactions where id<>t.id and account_id=t.account_id and operation='opening' and state='posted') then
   raise exception 'Opening balances can only be entered once per account in the first recorded period';
  end if;
 elsif t.operation<>'standard' then raise exception 'Invalid accounting operation';
 elsif t.kind='income' and category.kind='income' then dr:=fa; cr:=category.id; cash_change:=t.amount;
 elsif t.kind='expense' and category.kind='expense' then dr:=category.id; cr:=fa; cash_change:=-t.amount;
 elsif t.kind='transfer' then dr:=dest; cr:=fa;
 elsif t.kind='refund' and category.kind='income' then dr:=category.id; cr:=fa; cash_change:=-t.amount;
 elsif t.kind='reimbursement' then dr:=finance_private.chart('5200'); cr:=fa; cash_change:=-t.amount;
 elsif t.kind='advance' then dr:=finance_private.chart('1200'); cr:=fa; cash_change:=-t.amount; advance_change:=t.amount;
 elsif t.kind='adjustment' then
  dr:=t.debit_id; cr:=t.credit_id;
  if exists(select from chart_of_accounts where id in (dr,cr) and code in ('1100','1200','2100')) then
   raise exception 'Use a member operation to adjust member control accounts';
  end if;
 end if;

 if t.kind<>'reversal' and (dr is null or cr is null or dr=cr) then raise exception 'Choose valid accounts and a category for this operation'; end if;
 if (due_change<>0 or payable_change<>0 or advance_change<>0) and t.member_id is null then raise exception 'Select a member'; end if;
 if t.member_id is not null then
  perform 1 from member_accounts where member_id=t.member_id for update;
  if not found then raise exception 'Member has no ledger account'; end if;
  select coalesce(sum(l.due_delta),0),coalesce(sum(l.payable_delta),0),coalesce(sum(l.advance_delta),0)
   into due_total,payable_total,advance_total from member_ledger_entries l join transactions x on x.id=l.transaction_id
   where l.member_id=t.member_id and x.transaction_date<=t.transaction_date;
  if least(due_total+due_change,payable_total+payable_change,advance_total+advance_change)<0 or exists(
   select from (
    select due_total+due_change+sum(sum(l.due_delta)) over(order by x.transaction_date) as due,
    payable_total+payable_change+sum(sum(l.payable_delta)) over(order by x.transaction_date) as payable,
    advance_total+advance_change+sum(sum(l.advance_delta)) over(order by x.transaction_date) as advance
    from member_ledger_entries l join transactions x on x.id=l.transaction_id
    where l.member_id=t.member_id and x.transaction_date>t.transaction_date group by x.transaction_date
   ) future where least(due,payable,advance)<0
  ) then raise exception 'The entry exceeds an outstanding member balance on its date or a later date'; end if;
 end if;
 if t.pledge_id is not null and t.kind<>'reversal' then
  perform 1 from sponsorship_pledges where id=t.pledge_id and year_id=t.year_id and event_id is not distinct from t.event_id for update;
  if not found or t.kind<>'income' or t.operation<>'standard' or category.code not in ('4300','4400') then raise exception 'The pledged payment must match its event, year, and sponsorship or donation category'; end if;
 end if;
 if t.kind='reversal' then
  insert into journal_entries(transaction_id,chart_id,debit,credit)
  select tx_id,chart_id,credit,debit from journal_entries where transaction_id=original.id;
  insert into transaction_reversals(original_id,reversal_id,reason) values(original.id,t.id,t.description);
  perform finance_private.audit(who,'transaction_reversed','transactions',original.id,to_jsonb(original),jsonb_build_object('reversal_id',t.id,'reason',t.description));
 else
  insert into journal_entries(transaction_id,chart_id,debit,credit) values(tx_id,dr,t.amount,0),(tx_id,cr,0,t.amount);
 end if;
 if t.member_id is not null then
  insert into member_ledger_entries(member_id,transaction_id,cash_delta,due_delta,payable_delta,advance_delta)
  values(t.member_id,tx_id,cash_change,due_change,payable_change,advance_change);
 end if;
 if t.operation='due' then
  if t.due_date is null or t.due_date<t.transaction_date then raise exception 'Due date must be on or after the transaction date'; end if;
  insert into member_dues(member_id,transaction_id,due_date) values(t.member_id,tx_id,t.due_date);
  perform finance_private.tell_member(t.member_id,'New dues','A payment of INR '||t.amount||' is due on '||t.due_date||'.','/member/dues');
 end if;
 if t.kind not in ('transfer','adjustment','reversal') and t.operation not in ('due','payable') then
  insert into receipts(transaction_id,member_id) values(tx_id,t.member_id) returning number into receipt_no;
  perform finance_private.tell_member(t.member_id,'Receipt available',receipt_no||' is ready to download.','/member/receipts');
 end if;
 update transactions set state='posted',posted_at=now(),verified_by=who where id=tx_id;
 update payment_proofs set status='verified' where transaction_id=tx_id and status='under_review' returning * into pf;
 if found then
  perform finance_private.tell_member(pf.member_id,'Payment verified','Your payment '||pf.reference||' has been posted.','/member/payments');
  perform finance_private.audit(who,'payment_verified','payment_proofs',pf.id,null,to_jsonb(pf));
 end if;
 perform finance_private.audit(who,'transaction_posted','transactions',tx_id,to_jsonb(t),(select to_jsonb(x) from transactions x where id=tx_id));

 for b in select a.name, a.amount, a.year_id, a.id,
   coalesce((select sum(j.debit-j.credit) from journal_entries j join chart_of_accounts c on c.id=j.chart_id
    join transactions x on x.id=j.transaction_id where c.kind='expense' and x.state='posted' and x.operation<>'closing' and x.year_id=a.year_id
    and (a.department_id is null or a.department_id=x.department_id) and (a.event_id is null or a.event_id=x.event_id)
    and (a.category_id is null or a.category_id=x.category_id)),0) as spent, s.budget_warning
  from budgets a cross join app_settings s where a.year_id=t.year_id and (a.department_id is null or a.department_id=t.department_id)
   and (a.event_id is null or a.event_id=t.event_id) and (a.category_id is null or a.category_id=t.category_id)
   and (select kind from chart_of_accounts where id=dr)='expense'
 loop
  if b.spent>=b.amount*b.budget_warning/100 and b.spent-t.amount<b.amount*b.budget_warning/100 then
   perform finance_private.tell_admins('Budget warning',b.name||' reached its budget warning threshold.','/admin/budgets');
  end if;
  if b.spent>b.amount and b.spent-t.amount<=b.amount then
   perform finance_private.tell_admins('Budget exceeded',b.name||' exceeds its approved budget.','/admin/budgets');
  end if;
 end loop;
 return tx_id;
end $$;

create function finance_private.submit_transaction(tx_id uuid, who uuid) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare t transactions; s app_settings; required integer;
begin
 select * into strict t from transactions where id=tx_id for update;
 if t.state not in ('draft','rejected') then raise exception 'Only a draft or rejected transaction can be submitted'; end if;
 perform finance_private.open_year(t.year_id,t.transaction_date);
 select * into strict s from app_settings;
 required:=case when t.amount>=s.high_threshold then 2 when t.amount>=s.approval_threshold then 1 else 0 end;
 update transactions set required_approvals=required,needs_checker=s.maker_checker,approval_round=approval_round+1,
  state=case when required=0 then 'approved'::transaction_state else 'pending'::transaction_state end where id=tx_id;
 if required>0 then perform finance_private.tell_admins('Approval requested',t.code||' · '||t.description,'/admin/approvals'); end if;
 perform finance_private.audit(who,'transaction_submitted','transactions',tx_id,to_jsonb(t),(select to_jsonb(x) from transactions x where id=tx_id));
 return tx_id;
end $$;

create function finance_private.save_transaction(payload jsonb, who uuid) returns uuid language plpgsql set search_path=public,pg_temp as $$
declare t transactions; old_t transactions; tx_id uuid; k transaction_kind; entry_operation text; y uuid; td date;
 e events; event_key uuid; dept uuid; entry_amount numeric; request_key uuid;
begin
 tx_id:=nullif(payload->>'id','')::uuid; k:=(payload->>'kind')::transaction_kind; entry_operation:=coalesce(nullif(payload->>'operation',''),'standard');
 y:=(payload->>'year_id')::uuid; td:=(payload->>'transaction_date')::date; entry_amount:=(payload->>'amount')::numeric;
 request_key:=coalesce(nullif(payload->>'request_id','')::uuid,gen_random_uuid());
 event_key:=nullif(payload->>'event_id','')::uuid; dept:=nullif(payload->>'department_id','')::uuid;
 if k='reversal' or entry_operation='closing' then raise exception 'Use the dedicated finance workflow'; end if;
 if entry_amount<=0 or scale(entry_amount)>2 then raise exception 'Use a positive amount with up to two decimals'; end if;
 perform finance_private.open_year(y,td);
 if event_key is not null then
  select * into strict e from events where id=event_key and year_id=y;
  if dept is not null and e.department_id is not null and dept<>e.department_id then raise exception 'Department does not match the selected event'; end if;
  dept:=coalesce(dept,e.department_id);
 end if;
 if tx_id is not null then
  select * into strict old_t from transactions where id=tx_id for update;
  if old_t.state not in ('draft','rejected') or old_t.kind='reversal'
    or exists(select from payment_proofs p where p.transaction_id=tx_id) then raise exception 'This transaction cannot be edited'; end if;
  perform finance_private.open_year(old_t.year_id,old_t.transaction_date);
  update transactions set year_id=y,transaction_date=td,kind=k,operation=entry_operation,amount=entry_amount,
   description=trim(payload->>'description'),category_id=nullif(payload->>'category_id','')::uuid,member_id=nullif(payload->>'member_id','')::uuid,
   department_id=dept,event_id=event_key,account_id=nullif(payload->>'account_id','')::uuid,destination_id=nullif(payload->>'destination_id','')::uuid,
   debit_id=nullif(payload->>'debit_id','')::uuid,credit_id=nullif(payload->>'credit_id','')::uuid,pledge_id=nullif(payload->>'pledge_id','')::uuid,
   method=nullif(payload->>'method',''),reference=nullif(trim(payload->>'reference'),''),due_date=nullif(payload->>'due_date','')::date,state='draft'
  where id=tx_id returning * into t;
 else
  insert into transactions(request_id,year_id,transaction_date,kind,operation,amount,description,category_id,member_id,
   department_id,event_id,account_id,destination_id,debit_id,credit_id,pledge_id,method,reference,due_date,created_by)
  values(request_key,y,td,k,entry_operation,entry_amount,trim(payload->>'description'),nullif(payload->>'category_id','')::uuid,nullif(payload->>'member_id','')::uuid,
   dept,event_key,nullif(payload->>'account_id','')::uuid,nullif(payload->>'destination_id','')::uuid,nullif(payload->>'debit_id','')::uuid,
   nullif(payload->>'credit_id','')::uuid,nullif(payload->>'pledge_id','')::uuid,nullif(payload->>'method',''),nullif(trim(payload->>'reference'),''),
   nullif(payload->>'due_date','')::date,who) on conflict on constraint transactions_request_id_key do nothing returning * into t;
  if not found then
   select id into tx_id from transactions x where x.request_id=request_key and x.created_by=who;
   if tx_id is null then raise exception 'Request already in use'; end if;
   return tx_id;
  end if;
 end if;
 perform finance_private.audit(who,case when old_t.id is null then 'transaction_created' else 'transaction_edited' end,
  'transactions',t.id,case when old_t.id is not null then to_jsonb(old_t) end,to_jsonb(t));
 return t.id;
end $$;

create function finance_private.decide_transaction(tx_id uuid, who uuid, decision text, note text) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare t transactions; pf payment_proofs;
begin
 select * into strict t from transactions where id=tx_id for update;
 if t.state<>'pending' then raise exception 'This transaction is not pending'; end if;
 perform finance_private.open_year(t.year_id,t.transaction_date);
 if t.needs_checker and t.created_by=who then raise exception 'Maker-checker requires a different administrator'; end if;
 if decision not in ('approved','rejected') or (decision='rejected' and nullif(trim(note),'') is null) then raise exception 'Enter a rejection reason'; end if;
 insert into approvals(transaction_id,round,actor_id,decision,comment) values(tx_id,t.approval_round,who,decision,note);
 if decision='rejected' then
  update transactions set state='rejected' where id=tx_id;
  update payment_proofs set status='rejected',transaction_id=null,review_note=note where transaction_id=tx_id returning * into pf;
  if found then perform finance_private.tell_member(pf.member_id,'Payment rejected',note,'/member/payments'); end if;
 elsif (select count(*) from approvals a where a.transaction_id=tx_id and a.round=t.approval_round and a.decision='approved')>=t.required_approvals then
  update transactions set state='approved' where id=tx_id;
 end if;
 insert into notifications(user_id,title,message,href) values(t.created_by,'Transaction '||decision,t.code||coalesce(' · '||nullif(note,''),''),'/admin/transactions?id='||t.id);
 perform finance_private.audit(who,'transaction_'||decision,'transactions',tx_id,to_jsonb(t),jsonb_build_object('comment',note,'round',t.approval_round));
 return tx_id;
end $$;

create function finance_private.reverse_transaction(tx_id uuid, who uuid, year uuid, booked date, reason text) returns uuid
language plpgsql set search_path=public,pg_temp as $$
declare t transactions; reversal uuid;
begin
 select * into strict t from transactions where id=tx_id and state='posted' for update;
 perform finance_private.open_year(year,booked);
 if t.kind='reversal' or t.operation='closing' or booked<t.transaction_date or nullif(trim(reason),'') is null then raise exception 'Enter a valid date and reversal reason'; end if;
 if exists(select from transactions where related_transaction_id=tx_id and kind='reversal' and state<>'rejected') then raise exception 'A reversal already exists'; end if;
 insert into transactions(year_id,transaction_date,kind,amount,description,category_id,member_id,department_id,event_id,
   account_id,destination_id,pledge_id,related_transaction_id,method,created_by)
 values(year,booked,'reversal',t.amount,trim(reason),t.category_id,t.member_id,t.department_id,t.event_id,
   t.account_id,t.destination_id,t.pledge_id,t.id,t.method,who) returning id into reversal;
 perform finance_private.audit(who,'reversal_created','transactions',reversal,null,jsonb_build_object('original_id',tx_id,'reason',reason));
 return finance_private.submit_transaction(reversal,who);
end $$;

revoke all on all functions in schema finance_private from public, anon, authenticated;
grant execute on function finance_private.actor(),finance_private.is_admin(),finance_private.member(),finance_private.owned_unregistered_object(text) to authenticated;
