-- Keep administrator access tied to an active application session and officer role.
create or replace function finance_private.is_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.users u
    where u.id=finance_private.actor() and u.role<>'MEMBER'
  )
$$;

-- Retain the legacy settings field for existing finance_command callers.
update public.app_settings set mfa_required=false where mfa_required;
alter table public.app_settings drop constraint if exists finance_mfa_disabled;
alter table public.app_settings add constraint finance_mfa_disabled check (not mfa_required);

-- Clear both pending and confirmed authenticator enrollments.
update finance_private.credentials set totp_secret=null,totp_counter=null
where totp_secret is not null or totp_counter is not null;

-- Preserve the service-only password and session operations.
create or replace function public.finance_auth(operation text,p jsonb default '{}'::jsonb) returns jsonb
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
      'username',credential.username,'aal','aal1','must_change_password',credential.must_change_password);
  elsif operation='password_change' then
    if replacement is null or not credential.must_change_password then return null; end if;
    update finance_private.credentials set password_hash=replacement,must_change_password=false,temporary_until=null
    where user_id=profile.id and password_hash=credential.password_hash and must_change_password;
    if not found then return null; end if;
    delete from finance_private.login_sessions where user_id=profile.id;
    perform finance_private.audit(profile.id,'password_updated','users',profile.id);
    return jsonb_build_object('id',profile.id);
  end if;

  raise exception 'Unknown authentication operation' using errcode='22023';
end $$;
