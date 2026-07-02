-- QR Studio platform super admin layer
-- Apply after auth_bootstrap.sql.

create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id uuid unique references auth.users(id) on delete set null,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (email = lower(email))
);

alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.status = 'active'
      and pa.role in ('owner', 'admin')
  );
$$;

create or replace function public.link_platform_admin_for_user(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if v_email = '' then
    return;
  end if;

  update public.platform_admins
     set user_id = coalesce(user_id, p_user_id),
         status = case when status = 'revoked' then status else 'active' end,
         accepted_at = coalesce(accepted_at, now()),
         updated_at = now()
   where email = v_email
     and status <> 'revoked';
end;
$$;

insert into public.platform_admins (email, user_id, role, status, accepted_at)
select
  'adrianomelilloxx@gmail.com',
  u.id,
  'owner',
  case when u.id is null then 'pending' else 'active' end,
  case when u.id is null then null else now() end
from (select 1) seed
left join auth.users u on lower(u.email) = 'adrianomelilloxx@gmail.com'
on conflict (email) do update
set user_id = coalesce(public.platform_admins.user_id, excluded.user_id),
    role = 'owner',
    status = case
      when coalesce(public.platform_admins.user_id, excluded.user_id) is null then 'pending'
      else 'active'
    end,
    accepted_at = case
      when coalesce(public.platform_admins.user_id, excluded.user_id) is null then public.platform_admins.accepted_at
      else coalesce(public.platform_admins.accepted_at, now())
    end,
    updated_at = now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bootstrap_user_workspace(
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'company_name'
  );

  perform public.link_platform_admin_for_user(new.id, new.email);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_stats jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Access denied';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'confirmed_users', (
      select count(*) from auth.users
      where coalesce(email_confirmed_at, confirmed_at) is not null
    ),
    'active_users_30d', (
      select count(*) from auth.users
      where last_sign_in_at >= now() - interval '30 days'
    ),
    'tenants', (select count(*) from public.tenants),
    'memberships', (select count(*) from public.memberships),
    'qr_codes', (select count(*) from public.qr_codes),
    'dynamic_qr_codes', (select count(*) from public.qr_codes where is_dynamic = true),
    'scans_total', (select count(*) from public.scans),
    'scans_7d', (select count(*) from public.scans where scanned_at >= now() - interval '7 days'),
    'scans_30d', (select count(*) from public.scans where scanned_at >= now() - interval '30 days'),
    'revenue', 0,
    'revenue_status', 'Not connected'
  )
  into v_stats;

  return v_stats;
end;
$$;

create or replace function public.admin_invite_super_admin(p_email text)
returns table (
  email text,
  role text,
  status text,
  invited_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_existing_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Access denied';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid email';
  end if;

  select u.id into v_existing_user
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  insert into public.platform_admins (
    email,
    user_id,
    role,
    status,
    invited_by,
    accepted_at
  )
  values (
    v_email,
    v_existing_user,
    'admin',
    case when v_existing_user is null then 'pending' else 'active' end,
    auth.uid(),
    case when v_existing_user is null then null else now() end
  )
  on conflict (email) do update
  set user_id = coalesce(public.platform_admins.user_id, excluded.user_id),
      role = case when public.platform_admins.role = 'owner' then 'owner' else 'admin' end,
      status = case
        when public.platform_admins.role = 'owner' then public.platform_admins.status
        when coalesce(public.platform_admins.user_id, excluded.user_id) is null then 'pending'
        else 'active'
      end,
      invited_by = auth.uid(),
      invited_at = now(),
      accepted_at = case
        when coalesce(public.platform_admins.user_id, excluded.user_id) is null then public.platform_admins.accepted_at
        else coalesce(public.platform_admins.accepted_at, now())
      end,
      updated_at = now();

  return query
  select pa.email, pa.role, pa.status, pa.invited_at, pa.accepted_at
  from public.platform_admins pa
  where pa.email = v_email;
end;
$$;

create or replace function public.admin_list_super_admins()
returns table (
  email text,
  role text,
  status text,
  invited_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Access denied';
  end if;

  return query
  select pa.email, pa.role, pa.status, pa.invited_at, pa.accepted_at
  from public.platform_admins pa
  order by
    case pa.role when 'owner' then 0 else 1 end,
    case pa.status when 'active' then 0 when 'pending' then 1 else 2 end,
    pa.email;
end;
$$;

drop policy if exists platform_admins_no_direct_access on public.platform_admins;
create policy platform_admins_no_direct_access on public.platform_admins
  for select using (false);

revoke all on function public.link_platform_admin_for_user(uuid, text) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_platform_stats() to authenticated;
grant execute on function public.admin_invite_super_admin(text) to authenticated;
grant execute on function public.admin_list_super_admins() to authenticated;
