-- QR Studio richer platform analytics for admin.html.

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

  with scan_days as (
    select d::date as day
    from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
  ),
  scans_by_day as (
    select
      sd.day,
      coalesce(count(s.id), 0) as scans
    from scan_days sd
    left join public.scans s on s.scanned_at::date = sd.day
    group by sd.day
    order by sd.day
  ),
  top_devices as (
    select coalesce(nullif(device, ''), 'Unknown') as label, count(*) as count
    from public.scans
    group by coalesce(nullif(device, ''), 'Unknown')
    order by count(*) desc, label
    limit 5
  ),
  top_countries as (
    select coalesce(nullif(country, ''), 'Unknown') as label, count(*) as count
    from public.scans
    group by coalesce(nullif(country, ''), 'Unknown')
    order by count(*) desc, label
    limit 5
  ),
  tenant_activity as (
    select
      t.id,
      coalesce(b.company_name, t.name, 'Unnamed tenant') as name,
      count(distinct q.id) as qr_codes,
      count(s.id) as scans,
      count(s.id) filter (where s.scanned_at >= now() - interval '30 days') as scans_30d
    from public.tenants t
    left join public.branding b on b.tenant_id = t.id
    left join public.qr_codes q on q.tenant_id = t.id
    left join public.scans s on s.tenant_id = t.id
    group by t.id, b.company_name, t.name
    order by count(s.id) filter (where s.scanned_at >= now() - interval '30 days') desc,
             count(s.id) desc,
             coalesce(b.company_name, t.name, 'Unnamed tenant')
    limit 8
  )
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
    'revenue_status', 'Not connected',
    'scans_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'scans', scans) order by day) from scans_by_day), '[]'::jsonb),
    'top_devices', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label) from top_devices), '[]'::jsonb),
    'top_countries', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label) from top_countries), '[]'::jsonb),
    'tenant_leaderboard', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'qr_codes', qr_codes, 'scans', scans, 'scans_30d', scans_30d)) from tenant_activity), '[]'::jsonb)
  )
  into v_stats;

  return v_stats;
end;
$$;

grant execute on function public.admin_platform_stats() to authenticated;
