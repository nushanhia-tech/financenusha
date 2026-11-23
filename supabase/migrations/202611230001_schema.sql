create type finance_role as enum ('TREASURER','FINANCE_SECRETARY','MEMBER');
create type transaction_kind as enum ('income','expense','transfer','refund','reimbursement','advance','adjustment','reversal');
create type transaction_state as enum ('draft','pending','approved','rejected','posted');
create type proof_state as enum ('submitted','under_review','verified','rejected');
create type account_kind as enum ('asset','liability','equity','income','expense');

create table users (
 id uuid primary key references auth.users on delete restrict, name text not null,
 role finance_role not null default 'MEMBER', active boolean not null default true, created_at timestamptz not null default now()
);
create table academic_years (
 id uuid primary key default gen_random_uuid(), name text not null unique, start_date date not null, end_date date not null,
 active boolean not null default false, closed_at timestamptz, created_at timestamptz not null default now(),
 check(start_date<=end_date), check(not active or closed_at is null),
 exclude using gist (daterange(start_date,end_date,'[]') with &&)
);
create unique index one_active_year on academic_years (active) where active;
create table departments(id uuid primary key default gen_random_uuid(), name text not null unique, description text not null default '', created_at timestamptz not null default now());
create sequence member_counter;
create table members (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references users, member_number text not null unique
 default ('NU-'||lpad(nextval('member_counter')::text,6,'0')),
 name text not null, email text not null, phone text, department_id uuid references departments, year_id uuid not null references academic_years,
 active boolean not null default true, payment_profile text, created_at timestamptz not null default now()
);
create unique index member_email_unique on members(lower(email));
create table member_accounts(id uuid primary key default gen_random_uuid(), member_id uuid not null unique references members, created_at timestamptz not null default now());
create table events(
 id uuid primary key default gen_random_uuid(), name text not null, event_date date not null, year_id uuid not null references academic_years,
 department_id uuid references departments, description text not null default '', created_at timestamptz not null default now(), unique(name,year_id)
);
create table chart_of_accounts(
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null, kind account_kind not null, created_at timestamptz not null default now()
);
insert into chart_of_accounts(code,name,kind) values
 ('1100','Member Receivable','asset'),('1200','Member Advance Receivable','asset'),('2100','Member Payable','liability'),
 ('3100','Opening Equity','equity'),('3200','Retained Surplus','equity'),
 ('4100','Membership and Dues Income','income'),('4200','Contribution Income','income'),('4300','Sponsorship Income','income'),
 ('4400','Donation Income','income'),('4500','Other Income','income'),('5100','Operating Expense','expense'),
 ('5200','Reimbursement Expense','expense');
create table financial_accounts(
 id uuid primary key default gen_random_uuid(), chart_id uuid not null unique references chart_of_accounts,
 name text not null unique, kind text not null check(kind in ('cash','bank','upi','other')), active boolean not null default true,
 created_at timestamptz not null default now()
);
create table transaction_categories(id uuid primary key default gen_random_uuid(), name text not null unique, chart_id uuid not null references chart_of_accounts);
insert into transaction_categories(name,chart_id)
select names.name, chart_of_accounts.id from (values
 ('Membership dues','4100'),('Contributions','4200'),('Registrations','4200'),('Sponsorship','4300'),('Donations','4400'),
 ('Other income','4500'),('Venue','5100'),('Food','5100'),('Travel','5100'),('Accommodation','5100'),('Stage','5100'),
 ('Sound','5100'),('Printing','5100'),('Publicity','5100'),('Prizes','5100'),('Miscellaneous','5100'),
 ('Operations','5100'),('Reimbursements','5200')) as names(name,code) join chart_of_accounts using(code);
create table sponsors(id uuid primary key default gen_random_uuid(), name text not null, kind text not null check(kind in ('sponsor','donor')), email text, notes text, created_at timestamptz not null default now());
create table sponsorship_pledges(
 id uuid primary key default gen_random_uuid(), sponsor_id uuid not null references sponsors, event_id uuid references events,
 year_id uuid not null references academic_years, amount numeric(14,2) not null check(amount>0), due_date date,
 created_at timestamptz not null default now()
);
create sequence transaction_counter;
create table transactions(
 id uuid primary key default gen_random_uuid(), code text not null unique default ('TX-'||lpad(nextval('transaction_counter')::text,6,'0')),
 request_id uuid not null unique default gen_random_uuid(), year_id uuid not null references academic_years,
 transaction_date date not null, kind transaction_kind not null, operation text not null default 'standard'
 check(operation in ('standard','due','due_payment','payable','payable_payment','advance_settlement','opening','closing')),
 amount numeric(14,2) not null check(amount>0), description text not null check(length(trim(description))>0), category_id uuid references transaction_categories,
 member_id uuid references members, department_id uuid references departments, event_id uuid references events,
 account_id uuid references financial_accounts, destination_id uuid references financial_accounts, debit_id uuid references chart_of_accounts,
 credit_id uuid references chart_of_accounts, pledge_id uuid references sponsorship_pledges, related_transaction_id uuid references transactions,
 method text check(method in ('cash','bank','upi','other')), reference text, state transaction_state not null default 'draft',
 required_approvals integer not null default 0 check(required_approvals between 0 and 2), needs_checker boolean not null default false,
 created_by uuid not null references users, verified_by uuid references users, posted_at timestamptz, created_at timestamptz not null default now(),
 check(destination_id is null or (account_id is not null and destination_id<>account_id)), check((state='posted')=(posted_at is not null)),
 check(method is not null or reference is null)
);
create unique index transaction_reference on transactions(method,lower(trim(reference))) where reference is not null and state not in ('draft','rejected') and kind<>'reversal';
create index tx_year_date on transactions(year_id,transaction_date);
create index tx_member_date on transactions(member_id,transaction_date);
create index tx_dimensions on transactions(department_id,event_id,category_id,account_id);
create table journal_entries (
 id uuid primary key default gen_random_uuid(), transaction_id uuid not null references transactions, chart_id uuid not null references chart_of_accounts,
 debit numeric(14,2) not null default 0, credit numeric(14,2) not null default 0,
 check((debit>0 and credit=0) or (credit>0 and debit=0))
);
create index journal_transaction on journal_entries(transaction_id);
create index journal_chart on journal_entries(chart_id);
create table member_ledger_entries(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references members, transaction_id uuid not null unique references transactions,
 cash_delta numeric(14,2) not null default 0, due_delta numeric(14,2) not null default 0, payable_delta numeric(14,2) not null default 0,
 advance_delta numeric(14,2) not null default 0, created_at timestamptz not null default now()
);
create index member_ledger_member on member_ledger_entries(member_id);
create table member_dues(
 id uuid primary key default gen_random_uuid(), member_id uuid not null references members, transaction_id uuid not null unique references transactions,
 due_date date not null, created_at timestamptz not null default now()
);
create table documents(
 id uuid primary key default gen_random_uuid(), uploaded_by uuid not null references users, member_id uuid references members,
 transaction_id uuid references transactions, pledge_id uuid references sponsorship_pledges, object_path text not null unique, file_name text not null,
 mime_type text not null, kind text not null check(kind in ('bill','voucher','receipt','proof','sponsorship')), created_at timestamptz not null default now()
);
create table payment_proofs (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references members, document_id uuid not null unique references documents,
 year_id uuid not null references academic_years, event_id uuid references events, amount numeric(14,2) not null check(amount>0), payment_date date not null,
 method text not null check(method in ('cash','bank','upi','other')), reference text not null, purpose text not null, notes text,
 status proof_state not null default 'submitted', review_note text, correction_requested boolean not null default false,
 transaction_id uuid unique references transactions, reviewed_by uuid references users, created_at timestamptz not null default now()
);
create unique index proof_reference on payment_proofs(method,lower(trim(reference))) where status<>'rejected';
create index proof_member on payment_proofs(member_id,status);
create sequence receipt_counter;
create table receipts (
 id uuid primary key default gen_random_uuid(), number text not null unique default ('NU-R-'||lpad(nextval('receipt_counter')::text,7,'0')),
 transaction_id uuid not null unique references transactions, member_id uuid references members, created_at timestamptz not null default now()
);
create table budgets(
 id uuid primary key default gen_random_uuid(), year_id uuid not null references academic_years,
 scope text not null check(scope in ('annual','department','event','project')), name text not null, department_id uuid references departments,
 event_id uuid references events, category_id uuid references transaction_categories, amount numeric(14,2) not null check(amount>0),
 created_at timestamptz not null default now(),
 check((scope='department' and department_id is not null and event_id is null and category_id is null) or
       (scope='event' and event_id is not null and department_id is null and category_id is null) or
       (scope='project' and category_id is not null) or
       (scope='annual' and department_id is null and event_id is null and category_id is null))
);
create unique index budgets_scope_key on budgets(year_id,scope,department_id,event_id,category_id) nulls not distinct;
create table budget_revisions(
 id uuid primary key default gen_random_uuid(), budget_id uuid not null references budgets, amount numeric(14,2) not null check(amount>0),
 reason text not null, created_by uuid not null references users, decided_by uuid references users, status text not null default 'pending'
 check(status in ('pending','approved','rejected')), created_at timestamptz not null default now()
);
create unique index budget_one_pending on budget_revisions(budget_id) where status='pending';
create table approvals(
 id uuid primary key default gen_random_uuid(), transaction_id uuid not null references transactions,
 round integer not null default 1, actor_id uuid not null references users, decision text not null check(decision in ('approved','rejected')),
 comment text, created_at timestamptz not null default now(), unique(transaction_id,round,actor_id)
);
alter table transactions add column approval_round integer not null default 0;
alter table transactions add column due_date date;
create table account_reconciliations(
 id uuid primary key default gen_random_uuid(), account_id uuid not null references financial_accounts, year_id uuid not null references academic_years,
 statement_date date not null, actual_balance numeric(14,2) not null, system_balance numeric(14,2) not null,
 lines jsonb not null default '[]', unmatched jsonb not null default '[]', created_by uuid not null references users,
 created_at timestamptz not null default now()
);
create table transaction_reversals(
 id uuid primary key default gen_random_uuid(), original_id uuid not null unique references transactions, reversal_id uuid not null unique references transactions,
 reason text not null, created_at timestamptz not null default now(), check(original_id<>reversal_id)
);
create table notifications(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references users, title text not null, message text not null,
 href text, read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_inbox on notifications(user_id,created_at desc);
create table audit_logs(
 id uuid primary key default gen_random_uuid(), actor_id uuid references users, action text not null, entity text not null, entity_id uuid,
 before_values jsonb, after_values jsonb, created_at timestamptz not null default now()
);
create index audit_recency on audit_logs(created_at desc);
create table app_settings(
 id uuid primary key default gen_random_uuid(), singleton boolean not null default true unique check(singleton),
 approval_threshold numeric(14,2) not null default 5000 check(approval_threshold>=0),
 high_threshold numeric(14,2) not null default 50000 check(high_threshold>=approval_threshold),
 maker_checker boolean not null default true, mfa_required boolean not null default false,
 budget_warning numeric(5,2) not null default 80 check(budget_warning between 1 and 100), created_at timestamptz not null default now()
);
insert into app_settings default values;
