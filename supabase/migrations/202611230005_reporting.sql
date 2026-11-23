create view account_balances with (security_invoker=true) as
select f.*, coalesce(sum(j.debit-j.credit),0)::numeric(14,2) balance
from financial_accounts f left join journal_entries j on f.chart_id=j.chart_id
group by f.id;

create view member_summary with (security_invoker=true) as
select m.*, coalesce(sum(l.cash_delta) filter(where (t.kind='income' and t.operation in ('standard','due_payment')) or (t.kind='reversal' and original.kind='income' and original.operation in ('standard','due_payment'))),0) total_paid,
 coalesce(sum(l.cash_delta) filter(where tc.name in ('Contributions','Donations','Sponsorship','Registrations') and t.operation='standard' and t.kind in ('income','reversal')),0) contributions,
 coalesce(sum(l.due_delta),0) amount_due, coalesce(sum(l.payable_delta),0) union_owes,
 coalesce(sum(l.advance_delta),0) advances,
 coalesce(sum(-l.cash_delta) filter(where t.kind='refund' or (t.kind='reversal' and original.kind='refund')),0) refunds,
 coalesce(sum(-l.cash_delta) filter(where (t.kind='reimbursement' or (t.kind='reversal' and original.kind='reimbursement'))),0) reimbursements
from members m left join member_ledger_entries l on l.member_id=m.id left join transactions t on t.id=l.transaction_id
left join transactions original on original.id=t.related_transaction_id left join transaction_categories tc on tc.id=t.category_id group by m.id;

create view ledger_detail with (security_invoker=true) as
select l.*,t.code,t.transaction_date,t.kind,t.operation,t.description,t.amount,t.year_id,t.category_id,t.event_id,t.department_id,t.account_id,
 t.reference,tc.name category,r.id receipt_id
from member_ledger_entries l join transactions t on t.id=l.transaction_id left join transaction_categories tc on t.category_id=tc.id
left join receipts r on r.transaction_id=t.id;

create view transaction_detail with (security_invoker=true) as
select t.*,tc.name category,m.name member_name,d.name department_name,e.name event_name,f.name account_name,r.id receipt_id,r.number receipt_number,
 rev.reversal_id
from transactions t left join transaction_categories tc on t.category_id=tc.id left join members m on m.id=t.member_id
left join departments d on d.id=t.department_id left join events e on e.id=t.event_id left join financial_accounts f on f.id=t.account_id
left join receipts r on r.transaction_id=t.id left join transaction_reversals rev on rev.original_id=t.id;

create view journal_detail with (security_invoker=true) as
select j.id,j.transaction_id,c.id chart_id,c.code account_code,c.name account,c.kind account_kind,j.debit,j.credit,
 t.code,t.transaction_date,t.year_id,t.category_id,t.department_id,t.event_id,t.member_id,t.account_id,t.destination_id,
 t.kind,t.operation,t.description,t.reference,f.id financial_account_id,f.kind financial_account_kind
from journal_entries j join chart_of_accounts c on c.id=j.chart_id join transactions t on t.id=j.transaction_id
left join financial_accounts f on f.chart_id=j.chart_id;

create view budget_summary with (security_invoker=true) as
select b.*,coalesce(used.spent,0) spent,b.amount-coalesce(used.spent,0) remaining,
 round(coalesce(used.spent,0)/b.amount*100,1) utilization
from budgets b left join lateral (
 select sum(j.debit-j.credit) spent from journal_detail j where j.account_kind='expense' and j.operation<>'closing' and j.year_id=b.year_id
 and (b.department_id is null or b.department_id=j.department_id)
 and (b.event_id is null or b.event_id=j.event_id)
 and (b.category_id is null or b.category_id=j.category_id)
) used on true;

create view pledge_summary with (security_invoker=true) as
select p.*,s.name sponsor,s.kind,coalesce(flow.received,0) received,greatest(p.amount-coalesce(flow.received,0),0) outstanding
from sponsorship_pledges p join sponsors s on s.id=p.sponsor_id left join lateral (
 select sum(case when t.kind='reversal' then -t.amount else t.amount end) received from transactions t where t.pledge_id=p.id and t.state='posted'
) flow on true;

create view event_summary with (security_invoker=true) as
select e.*,coalesce(b.amount,0) budget,coalesce(j.income,0) income,coalesce(j.expenses,0) expenses,
 coalesce(b.amount,0)-coalesce(j.expenses,0) remaining,coalesce(j.income,0)-coalesce(j.expenses,0) surplus
from events e left join budgets b on b.event_id=e.id and b.scope='event' and b.year_id=e.year_id
left join lateral(
 select sum(credit-debit) filter(where account_kind='income') income,sum(debit-credit) filter(where account_kind='expense') expenses
 from journal_detail where event_id=e.id and operation<>'closing'
) j on true;


create view member_due_schedule with (security_invoker=true) as
with raised as (
 select d.id,d.member_id,d.due_date,t.id transaction_id,t.year_id,t.description,t.transaction_date,t.code,t.amount,
  coalesce(sum(l.due_delta) filter(where payment.id is not null or original_payment.id is not null),0) settled,
  sum(t.amount) over(partition by d.member_id order by d.due_date,t.transaction_date,t.code rows between unbounded preceding and current row) accrued
 from member_dues d join transactions t on t.id=d.transaction_id
 left join member_ledger_entries l on l.member_id=d.member_id
 left join transactions payment on payment.id=l.transaction_id and payment.operation='due_payment'
 left join transactions reversed_payment on reversed_payment.id=l.transaction_id and reversed_payment.kind='reversal'
 left join transactions original_payment on original_payment.id=reversed_payment.related_transaction_id and original_payment.operation='due_payment'
 where not exists(select from transactions reversal where reversal.related_transaction_id=t.id and reversal.kind='reversal' and reversal.state='posted')
 group by d.id,t.id
)
select r.id,r.member_id,r.due_date,r.transaction_id,r.year_id,r.description,r.transaction_date,r.code,r.amount,
 least(r.amount,greatest(r.accrued+r.settled,0)) remaining
from raised r;

revoke all on member_due_schedule from anon,authenticated;
grant select on member_due_schedule to authenticated;

revoke all on account_balances,member_summary,ledger_detail,transaction_detail,journal_detail,budget_summary,pledge_summary,event_summary from anon,authenticated;
grant select on account_balances,member_summary,ledger_detail,transaction_detail,journal_detail,budget_summary,pledge_summary,event_summary to authenticated;

create function public.finance_dashboard(yid uuid default null) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare y academic_years; result jsonb;
begin
 if not finance_private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if yid is null then select * into y from academic_years where active;
 else select * into y from academic_years where id=yid; end if;
 with entries as materialized (select * from journal_detail where year_id=y.id and operation<>'closing'),
  balances as (
   select f.id,f.name,f.kind,coalesce(sum(j.debit-j.credit) filter(where j.transaction_date<=y.end_date),0) balance
   from financial_accounts f left join journal_detail j on j.chart_id=f.chart_id group by f.id
  ), monthly as (
   select to_char(m.period_month,'Mon') as month,
    coalesce(sum(j.credit-j.debit) filter(where j.account_kind='income'),0) income,
    coalesce(sum(j.debit-j.credit) filter(where j.account_kind='expense'),0) expenses,
    coalesce(sum(j.debit-j.credit) filter(where j.financial_account_id is not null and j.operation<>'opening'),0) cash_flow,
    count(distinct j.transaction_id) volume
   from generate_series(date_trunc('month',y.start_date),date_trunc('month',y.end_date),interval '1 month') m(period_month)
   left join entries j on date_trunc('month',j.transaction_date)=m.period_month group by m.period_month order by m.period_month
  ), totals as (
   select coalesce(sum(credit-debit) filter(where account_kind='income'),0) income,
   coalesce(sum(debit-credit) filter(where account_kind='expense'),0) expenses,
   coalesce(sum(debit-credit) filter(where account_kind='expense' and event_id is not null),0) event_expenses from entries
  ), dept as (
   select d.name, sum(j.debit-j.credit) amount from entries j join departments d on d.id=j.department_id
   where j.account_kind='expense' group by d.name having sum(j.debit-j.credit)<>0 order by amount desc limit 8
  ), queues as (
   select (select count(*) from payment_proofs where year_id=y.id and status in ('submitted','under_review')) proofs,
    (select count(*) from transactions where year_id=y.id and state='pending') approvals,
    (select coalesce(sum(amount),0) from budgets where year_id=y.id and scope='department') department_budgets,
    (select coalesce(sum(l.due_delta),0) from member_ledger_entries l join transactions t on t.id=l.transaction_id where t.transaction_date<=y.end_date) dues,
    (select coalesce(sum(l.advance_delta),0) from member_ledger_entries l join transactions t on t.id=l.transaction_id where t.transaction_date<=y.end_date) advances,
    (select coalesce(sum(l.payable_delta),0) from member_ledger_entries l join transactions t on t.id=l.transaction_id where t.transaction_date<=y.end_date) payable,
    (select coalesce(sum(outstanding),0) from pledge_summary where year_id=y.id) pledges
  )
 select jsonb_build_object('year',to_jsonb(y),'totals',to_jsonb(totals)||to_jsonb(queues),
  'accounts',coalesce((select jsonb_agg(b order by b.balance desc,b.name) from balances b),'[]'),
  'monthly',coalesce((select jsonb_agg(m) from monthly m),'[]'),
  'departments',coalesce((select jsonb_agg(d) from dept d),'[]'),
  'events',coalesce((select jsonb_agg(e) from (select * from event_summary where year_id=y.id order by expenses desc limit 8) e),'[]'),
  'budgets',coalesce((select jsonb_agg(b) from (select * from budget_summary where year_id=y.id order by utilization desc limit 8) b),'[]'),
  'recent',coalesce((select jsonb_agg(t) from (select * from transaction_detail where year_id=y.id and state='posted' and operation<>'closing' order by posted_at desc,code desc limit 6)t),'[]'),
  'payments',coalesce((select jsonb_agg(t) from (select * from transaction_detail where year_id=y.id and state='posted' and member_id is not null and kind='income' and operation in ('standard','due_payment') order by posted_at desc limit 5)t),'[]'),
  'pending',coalesce((select jsonb_agg(t) from (select * from transaction_detail where year_id=y.id and state='pending' order by created_at desc limit 5)t),'[]'),
  'proofs',coalesce((select jsonb_agg(t) from (select p.id,p.purpose,p.reference,p.amount,p.status,m.name member_name from payment_proofs p join members m on m.id=p.member_id where p.year_id=y.id and status in ('submitted','under_review') order by p.created_at desc limit 5)t),'[]'),
  'due_dates',coalesce((select jsonb_agg(t) from (select d.due_date,m.name member_name,d.description,d.remaining amount from member_due_schedule d join members m on m.id=d.member_id where d.year_id=y.id and d.due_date>=(now() at time zone 'Asia/Kolkata')::date and d.remaining>0 order by d.due_date limit 5)t),'[]'),
  'activity',coalesce((select jsonb_agg(a) from (select l.action,l.created_at,u.name actor_name from audit_logs l join users u on u.id=l.actor_id where u.role<>'MEMBER' order by l.created_at desc limit 5)a),'[]')
 ) into result from totals cross join queues;
 return result;
end $$;

create function public.finance_report(report text, p jsonb default '{}'::jsonb, max_rows integer default 5000) returns jsonb
language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare result jsonb; y uuid:=nullif(p->>'year_id','')::uuid; dep uuid:=nullif(p->>'department_id','')::uuid;
 ev uuid:=nullif(p->>'event_id','')::uuid; mem uuid:=nullif(p->>'member_id','')::uuid; fa uuid:=nullif(p->>'account_id','')::uuid;
 cat uuid:=nullif(p->>'category_id','')::uuid; start_on date:=nullif(p->>'from','')::date; end_on date:=nullif(p->>'to','')::date;
begin
 if not finance_private.is_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
 if max_rows not between 1 and 10001 or (start_on is not null and end_on is not null and start_on>end_on) then raise exception 'Choose a valid report range'; end if;
 if report='balance-sheet' and y is not null then
  select least(coalesce(end_on,end_date),end_date) into end_on from academic_years where id=y;
 end if;
 with filtered as materialized(
  select j.* from journal_detail j where
   (y is null or j.year_id=y or report='balance-sheet')
   and (start_on is null or j.transaction_date>=start_on or report='balance-sheet')
   and (end_on is null or j.transaction_date<=end_on)
   and (dep is null or j.department_id=dep) and (ev is null or j.event_id=ev) and (mem is null or j.member_id=mem)
   and (fa is null or fa in (j.account_id,j.destination_id,j.financial_account_id) or exists(select from journal_detail matched where matched.transaction_id=j.transaction_id and matched.financial_account_id=fa))
   and (cat is null or j.category_id=cat)
   and (j.operation<>'closing' or report in ('general-ledger','trial-balance','balance-sheet','transaction-register'))
 ), tx as (select distinct transaction_id from filtered),
  data as (
   select case report when 'balance-sheet' then account_kind::text||' '||account when 'trial-balance' then account_code||' '||account end label,
    account_kind::text class, sum(debit) debits,sum(credit) credits,sum(debit-credit) balance
   from filtered where report in ('balance-sheet','trial-balance')
   group by account_code,account,account_kind
  ), rows as (
   select row_number() over(order by class,label) as position,jsonb_build_object('Account',label,'Class',class,'Debits',debits,'Credits',credits,'Balance',balance) row
   from data where report='trial-balance'
   union all
   select row_number() over(order by class,label),jsonb_build_object('Account',label,'Class',class,'Balance',case when class='asset' then balance else -balance end)
   from data where report='balance-sheet' and class in ('asset','liability','equity')
   union all
   select 999999999,jsonb_build_object('Account','Current earnings','Class','equity','Balance',coalesce(-sum(balance),0))
   from data where class in ('income','expense') having report='balance-sheet'
   union all
   select row_number() over(order by j.transaction_date desc,j.code desc,j.account),jsonb_build_object('Date',j.transaction_date,'Transaction',j.code,'Account',j.account,
   'Description',j.description,'Debit',j.debit,'Credit',j.credit,'Net',j.debit-j.credit)
   from filtered j where report='general-ledger'
    or (report='cash-book' and j.financial_account_kind='cash') or (report='bank-book' and j.financial_account_kind='bank')
    or (report='upi-book' and j.financial_account_kind='upi')
    or (report='cash-flow' and j.financial_account_id is not null and j.kind<>'transfer' and j.operation<>'opening'
     and not exists(select from transactions x where x.id=j.transaction_id and x.kind='reversal'
       and exists(select from transactions o where o.id=x.related_transaction_id and (o.kind='transfer' or o.operation='opening'))))
   union all
   select row_number() over(order by j.transaction_date desc,j.code desc,j.account),jsonb_build_object('Date',j.transaction_date,'Transaction',j.code,'Account',j.account,
    'Description',j.description,'Amount',case when j.account_kind='income' then j.credit-j.debit else j.debit-j.credit end)
   from filtered j where (report='income' and j.account_kind='income') or (report='expense' and j.account_kind='expense')
    or (report='reimbursements' and j.account_code='5200')
   union all
   select row_number() over(order by l.transaction_date desc,l.code desc),jsonb_build_object('Member',m.name,'Date',l.transaction_date,'Transaction',l.code,'Description',l.description,
    'Member payment',greatest(l.cash_delta,0),'Union payment',greatest(-l.cash_delta,0),'Dues change',l.due_delta,'Payable change',l.payable_delta,'Advance change',l.advance_delta)
   from ledger_detail l join tx on tx.transaction_id=l.transaction_id join members m on m.id=l.member_id where report='member-ledger'
   union all
   select row_number() over(order by m.name),jsonb_build_object('Member',m.name,'Member ID',m.member_number,'Amount due',sum(l.due_delta))
   from ledger_detail l join tx on tx.transaction_id=l.transaction_id join members m on m.id=l.member_id where report='member-dues'
   group by m.id having sum(l.due_delta)<>0
   union all
   select row_number() over(order by t.transaction_date desc,t.code desc),jsonb_build_object('Date',t.transaction_date,'Transaction',t.code,'Description',t.description,'Type',t.kind,
    'Category',t.category,'Amount',t.amount,'Account',t.account_name,'Member',t.member_name,'Reference',t.reference)
   from transaction_detail t join tx on tx.transaction_id=t.id where report='transaction-register'
   union all
   select row_number() over(order by coalesce(d.name,e.name,a.name)),jsonb_build_object('Name',coalesce(d.name,e.name,a.name),'Income',
    coalesce(sum(j.credit-j.debit) filter(where j.account_kind='income'),0),'Expenses',coalesce(sum(j.debit-j.credit) filter(where j.account_kind='expense'),0),
    'Surplus',coalesce(sum(j.credit-j.debit) filter(where j.account_kind in ('expense','income')),0))
   from filtered j join academic_years a on a.id=j.year_id left join departments d on d.id=j.department_id and report='department'
   left join events e on e.id=j.event_id and report='event'
   where (report='department' and d.id is not null) or (report='event' and e.id is not null) or report='annual'
   group by coalesce(d.name,e.name,a.name)
   union all
   select row_number() over(order by p.sponsor,p.created_at),jsonb_build_object('Name',p.sponsor,'Promised',p.amount,
    'Received',coalesce(payments.received,0),'Outstanding',greatest(p.amount-coalesce(payments.received,0),0),'Due date',p.due_date)
   from pledge_summary p left join lateral(
    select sum(case when t.kind='reversal' then -t.amount else t.amount end) received from transactions t join tx on tx.transaction_id=t.id where t.pledge_id=p.id
   ) payments on true
   where (report='sponsorship' and p.kind='sponsor' or report='donation' and p.kind='donor')
   and (y is null or p.year_id=y) and (ev is null or p.event_id=ev)
   and (dep is null or exists(select from events e where e.id=p.event_id and e.department_id=dep))
   and ((mem is null and fa is null and cat is null and start_on is null and end_on is null) or payments.received is not null)
   union all
   select 999999999+row_number() over(order by t.transaction_date desc,t.code desc),jsonb_build_object('Name',t.description,'Promised',0,'Received',j.credit-j.debit,'Outstanding',0,'Due date',null)
   from filtered j join transactions t on t.id=j.transaction_id
   where t.pledge_id is null and (report='sponsorship' and j.account_code='4300' or report='donation' and j.account_code='4400')
   union all
   select row_number() over(order by b.name),jsonb_build_object('Budget',b.name,'Scope',b.scope,'Allocated',b.amount,'Spent',coalesce(used.spent,0),'Remaining',b.amount-coalesce(used.spent,0))
   from budgets b left join lateral(
    select sum(j.debit-j.credit) spent from filtered j where j.account_kind='expense' and j.year_id=b.year_id
     and (b.department_id is null or b.department_id=j.department_id) and (b.event_id is null or b.event_id=j.event_id)
     and (b.category_id is null or b.category_id=j.category_id)
   ) used on true
   where report='budget' and (y is null or y=b.year_id)
    and (dep is null or dep=b.department_id or used.spent is not null)
    and (ev is null or ev=b.event_id or used.spent is not null) and (cat is null or cat=b.category_id or used.spent is not null)
 )
 select coalesce(jsonb_agg(x.row order by x.position),'[]') into result from (select * from rows order by position limit max_rows)x;
 return result;
end $$;
revoke all on function public.finance_dashboard(uuid),public.finance_report(text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.finance_dashboard(uuid),public.finance_report(text,jsonb,integer) to authenticated;
create function public.finance_admin_access() returns boolean language sql stable security invoker set search_path=public,pg_temp as $$
 select finance_private.is_admin()
$$;
revoke all on function public.finance_admin_access() from public,anon;
grant execute on function public.finance_admin_access() to authenticated;

create view receipt_detail with (security_invoker=true) as
select r.*,t.description,t.code,t.amount,t.kind,t.transaction_date
from receipts r join transactions t on t.id=r.transaction_id;
create view member_payment_detail with (security_invoker=true) as
select l.* from ledger_detail l join transactions t on t.id=l.transaction_id
left join transactions o on o.id=t.related_transaction_id
where l.cash_delta<>0 and (t.kind='income' or o.kind='income');
create view member_contribution_detail with (security_invoker=true) as
select l.* from member_payment_detail l where category in ('Contributions','Registrations','Sponsorship','Donations');
create view member_due_detail with (security_invoker=true) as
select l.*,d.due_date from ledger_detail l left join member_dues d on d.transaction_id=l.transaction_id where l.due_delta<>0;
create view member_refund_detail with (security_invoker=true) as
select l.* from ledger_detail l join transactions t on t.id=l.transaction_id left join transactions o on o.id=t.related_transaction_id
where l.cash_delta<>0 and (t.kind='refund' or o.kind='refund');
create view member_reimbursement_detail with (security_invoker=true) as
select l.* from ledger_detail l join transactions t on t.id=l.transaction_id left join transactions o on o.id=t.related_transaction_id
where t.kind='reimbursement' or o.kind='reimbursement';
revoke all on receipt_detail,member_payment_detail,member_contribution_detail,member_due_detail,member_refund_detail,member_reimbursement_detail from anon,authenticated;
grant select on receipt_detail,member_payment_detail,member_contribution_detail,member_due_detail,member_refund_detail,member_reimbursement_detail to authenticated;

grant select, insert, update on users to service_role;
