alter table public.users drop constraint if exists users_id_fkey;
drop function if exists public.link_member_login(uuid,uuid,uuid);

create table finance_private.credentials (
  user_id uuid primary key references public.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,47}$'),
  password_hash text,
  must_change_password boolean not null default false,
  temporary_until timestamptz,
  totp_secret text,
  totp_counter bigint
);

-- Copy existing password hashes once so a change of sign-in method preserves accounts and ledgers.
do $$
begin
if to_regclass('auth.users') is not null then
with candidates as (
  select u.id, left(lower(split_part(a.email,'@',1)),48) as email_name,
    lower(m.member_number) as member_name,
    case when a.encrypted_password ~ '^\$2[aby]\$' and a.email_confirmed_at is not null
      and a.deleted_at is null and (a.banned_until is null or a.banned_until<=now())
      then a.encrypted_password end as password_hash
  from public.users u
  left join auth.users a on a.id=u.id
  left join public.members m on m.user_id=u.id
), names as (
  select *, count(*) over (partition by email_name) as copies
  from candidates
)
insert into finance_private.credentials (user_id,username,password_hash)
select id,
  coalesce(member_name,
    case when copies=1 and email_name ~ '^[a-z0-9][a-z0-9._-]{2,47}$' and email_name !~ '^(nu-|user-)'
      then email_name else 'user-'||replace(id::text,'-','') end),
  password_hash
from names;
else
  insert into finance_private.credentials(user_id,username)
  select u.id,coalesce(lower(m.member_number),'user-'||replace(u.id::text,'-',''))
  from public.users u left join public.members m on m.user_id=u.id;
end if;
end $$;

create table finance_private.login_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references finance_private.credentials on delete cascade,
  aal text not null default 'aal1' check(aal in ('aal1','aal2')),
  expires_at timestamptz not null default (now()+interval '8 hours')
);
create index finance_login_sessions_user on finance_private.login_sessions(user_id);
create index finance_login_sessions_expiry on finance_private.login_sessions(expires_at);

create table finance_private.auth_attempts (
  scope text not null,
  bucket timestamptz not null,
  attempts integer not null default 1,
  primary key (scope,bucket)
);
create index finance_auth_attempts_expiry on finance_private.auth_attempts(bucket);

create function finance_private.allow_auth_attempt(key text, seconds integer, maximum integer)
returns boolean language plpgsql set search_path=public,pg_temp as $$
declare n integer;
begin
  insert into finance_private.auth_attempts(scope,bucket)
  values (key,date_bin(make_interval(secs=>seconds),now(),'2000-01-01 00:00:00+00'::timestamptz))
  on conflict (scope,bucket) do update set attempts=finance_private.auth_attempts.attempts+1
  returning attempts into n;
  if n=1 and key like 'login-ip:%' then
    delete from finance_private.auth_attempts where bucket<now()-interval '1 day';
    delete from finance_private.login_sessions where expires_at<=now();
  end if;
  return n<=maximum;
end $$;

create or replace function finance_private.actor() returns uuid language sql stable security definer set search_path=public,pg_temp as $$
  select u.id
  from users u
  join finance_private.credentials c on c.user_id=u.id
  join finance_private.login_sessions s on s.user_id=u.id
  where u.id=auth.uid() and u.active and not c.must_change_password
    and s.id=nullif(auth.jwt()->>'nusha_session_id','')::uuid and s.expires_at>now()
$$;

create or replace function finance_private.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from users u join finance_private.credentials c on c.user_id=u.id cross join app_settings a
    where u.id=finance_private.actor() and u.role<>'MEMBER'
      and (
        (not a.mfa_required and c.totp_counter is null)
        or exists (select 1 from finance_private.login_sessions s
            where s.id=nullif(auth.jwt()->>'nusha_session_id','')::uuid and s.aal='aal2')
      )
  )
$$;

-- This service-only function keeps password hashes and session tokens out of PostgREST table access.
create function public.finance_auth(operation text,p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  profile users;
  credential finance_private.credentials;
  login_session finance_private.login_sessions;
  digest text:=p->>'token_hash';
  replacement text:=p->>'password_hash';
begin
  if operation='lookup' then
    if not finance_private.allow_auth_attempt('login-ip:'||(p->>'attempt_key'),60,60) or
       not finance_private.allow_auth_attempt('login-user:'||(p->>'username'),600,10) then
      return jsonb_build_object('limited',true);
    end if;
    select c.* into credential from finance_private.credentials c join users u on u.id=c.user_id
    where c.username=p->>'username' and u.active and (c.temporary_until is null or c.temporary_until>now());
    return case when found then jsonb_build_object('id',credential.user_id,'password_hash',credential.password_hash) end;
  end if;

  if operation in ('session_start','officer_create','officer_reset','password_change')
      and replacement is not null and replacement !~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$' then
    raise exception 'Invalid password hash' using errcode='22023';
  end if;

  if operation='session_start' then
    select c.* into credential from finance_private.credentials c join users u on u.id=c.user_id
    where c.user_id=(p->>'id')::uuid and u.active and c.password_hash=p->>'verified_hash'
      and (c.temporary_until is null or c.temporary_until>now())
    for update of c;
    if not found then return null; end if;
    if replacement is not null then
      update finance_private.credentials set password_hash=replacement where user_id=credential.user_id;
    end if;
    insert into finance_private.login_sessions(token_hash,user_id) values(digest,credential.user_id)
    returning * into login_session;
    return jsonb_build_object('id',login_session.id,'user_id',login_session.user_id);
  elsif operation='session_end' then
    delete from finance_private.login_sessions where token_hash=digest;
    return null;
  elsif operation='officer_create' then
    if p->>'role' not in ('TREASURER','FINANCE_SECRETARY') or replacement is null then
      raise exception 'An officer role and password are required';
    end if;
    insert into users(id,name,role) values(gen_random_uuid(),p->>'name',(p->>'role')::finance_role) returning * into profile;
    insert into finance_private.credentials(user_id,username,password_hash) values(profile.id,p->>'username',replacement);
    return jsonb_build_object('id',profile.id);
  elsif operation='officer_reset' then
    select c.* into credential from finance_private.credentials c join users u on u.id=c.user_id
    where c.username=p->>'username' and u.active and u.role<>'MEMBER' for update of c;
    if not found or replacement is null then raise exception 'Active officer username and password required'; end if;
    update finance_private.credentials set password_hash=replacement,must_change_password=false,temporary_until=null
    where user_id=credential.user_id;
    delete from finance_private.login_sessions where user_id=credential.user_id;
    perform finance_private.audit(null,'officer_password_reset','users',credential.user_id);
    return jsonb_build_object('id',credential.user_id);
  end if;

  select s.* into login_session from finance_private.login_sessions s join users u on u.id=s.user_id
  where s.token_hash=digest and s.expires_at>now() and u.active;
  if not found then return null; end if;
  select * into strict profile from users where id=login_session.user_id;
  select * into strict credential from finance_private.credentials where user_id=profile.id;

  if operation='session_get' then
    return jsonb_build_object('session_id',login_session.id,'id',profile.id,'name',profile.name,'role',profile.role,
      'username',credential.username,'aal',login_session.aal,'must_change_password',credential.must_change_password,
      'totp_enabled',credential.totp_counter is not null);
  elsif operation='password_change' then
    if replacement is null or not credential.must_change_password then return null; end if;
    update finance_private.credentials set password_hash=replacement,must_change_password=false,temporary_until=null
    where user_id=profile.id and password_hash=credential.password_hash and must_change_password;
    if not found then return null; end if;
    delete from finance_private.login_sessions where user_id=profile.id;
    perform finance_private.audit(profile.id,'password_updated','users',profile.id);
    return jsonb_build_object('id',profile.id);
  end if;

  if profile.role='MEMBER' or credential.must_change_password then return null; end if;
  if operation='totp_begin' then
    update finance_private.credentials set totp_secret=coalesce(totp_secret,p->>'secret')
    where user_id=profile.id and totp_counter is null
    returning * into credential;
    return case when found then jsonb_build_object('secret',credential.totp_secret) end;
  elsif operation='totp_lookup' then
    if not finance_private.allow_auth_attempt('totp:'||profile.id,300,8) then
      return jsonb_build_object('limited',true);
    end if;
    return jsonb_build_object('secret',credential.totp_secret);
  elsif operation='totp_confirm' then
    update finance_private.credentials set totp_counter=(p->>'counter')::bigint
    where user_id=profile.id and totp_secret=p->>'secret'
      and (totp_counter is null or totp_counter<(p->>'counter')::bigint);
    if not found then return null; end if;
    update finance_private.login_sessions set aal='aal2' where id=login_session.id and expires_at>now();
    return case when found then jsonb_build_object('id',login_session.id) end;
  end if;

  raise exception 'Unknown authentication operation' using errcode='22023';
end $$;

create function public.finance_member_password(member_id uuid,password_hash text,replace_existing boolean)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare member_record members; account_id uuid; login_name text; who uuid:=finance_private.require_admin();
begin
  if password_hash is null or password_hash !~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$' then
    raise exception 'Invalid temporary password' using errcode='22023';
  end if;
  select * into strict member_record from members where id=member_id and active for update;
  account_id:=member_record.user_id;
  if replace_existing is distinct from (account_id is not null) then
    raise exception 'Reload the member account before updating its login';
  end if;
  if account_id is null then
    insert into users(id,name,role) values(gen_random_uuid(),member_record.name,'MEMBER') returning id into account_id;
    update members set user_id=account_id where id=member_id;
  elsif not exists (select 1 from users where id=account_id and role='MEMBER' and active) then
    raise exception 'A password can only be set for an active member login';
  end if;
  insert into finance_private.credentials(user_id,username,password_hash,must_change_password,temporary_until)
  values(account_id,lower(member_record.member_number),finance_member_password.password_hash,true,now()+interval '1 day')
  on conflict (user_id) do update set password_hash=excluded.password_hash,
    must_change_password=true,temporary_until=excluded.temporary_until
  returning username into login_name;
  delete from finance_private.login_sessions where user_id=account_id;
  perform finance_private.audit(who,case when replace_existing then 'member_password_reset' else 'member_login_linked' end,
    'members',member_id,null,jsonb_build_object('user_id',account_id));
  return login_name;
end $$;

revoke all on finance_private.credentials,finance_private.login_sessions,finance_private.auth_attempts from public,anon,authenticated;
revoke all on function finance_private.allow_auth_attempt(text,integer,integer) from public,anon,authenticated;
revoke all on function public.finance_auth(text,jsonb),public.finance_member_password(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.finance_auth(text,jsonb) to service_role;
grant execute on function public.finance_member_password(uuid,text,boolean) to authenticated;

create function finance_private.revoke_deactivated_sessions()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from finance_private.login_sessions where user_id=new.id;
  return new;
end $$;
revoke all on function finance_private.revoke_deactivated_sessions() from public,anon,authenticated;
create trigger finance_user_deactivated after update of active on public.users
for each row when (old.active and not new.active)
execute function finance_private.revoke_deactivated_sessions();
