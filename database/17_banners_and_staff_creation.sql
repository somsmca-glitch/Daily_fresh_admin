-- =====================================================================
-- FILE: 17_banners_and_staff_creation.sql
-- Two additions:
--   1. app.banners — homepage/promotional banner management (didn't
--      exist before; categories only had per-category image fields,
--      not a general rotating-banner system).
--   2. app.fn_create_staff_member — lets a super_admin actually onboard
--      a new employee from the admin panel, creating their real login
--      (auth.users + auth.identities), not just editing an existing
--      one. Restricted to super_admin callers; checked inside the
--      function itself, not just by RLS.
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- 1. Banners
-- ---------------------------------------------------------------------
create table app.banners (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  subtitle      text,
  image_url     text not null,
  link_url      text,
  display_order int not null default 0,
  is_active     boolean not null default true,
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app.user_profiles(id),
  constraint chk_banner_validity check (valid_until is null or valid_until > valid_from)
);

alter table app.banners enable row level security;

create policy p_banners_public_read on app.banners
  for select using (
    is_active = true
    and now() >= valid_from
    and (valid_until is null or now() <= valid_until)
  );
create policy p_banners_staff_manage on app.banners
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create trigger trg_set_updated_at before update on app.banners
  for each row execute function app.fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Staff member creation
-- ---------------------------------------------------------------------
create or replace function app.fn_create_staff_member(
  p_email text,
  p_password text,
  p_full_name text,
  p_role app.user_role,
  p_employee_code text,
  p_department_id uuid default null,
  p_designation_id uuid default null,
  p_salary_monthly numeric default null,
  p_phone text default null
) returns uuid
language plpgsql security definer set search_path = app, auth, extensions, pg_catalog as $$
declare
  v_caller_role app.user_role;
  v_user_id uuid := gen_random_uuid();
begin
  select role into v_caller_role from app.user_profiles where id = auth.uid();
  if v_caller_role is distinct from 'super_admin' then
    raise exception 'Only super_admin can create staff accounts';
  end if;

  if p_role = 'customer' then
    raise exception 'Use the normal signup flow for customer accounts, not this function';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change, is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_full_name),
    now(), now(), '', '', '', '', false, false
  );

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at
  ) values (
    gen_random_uuid(), v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email),
    'email', now(), now(), now()
  );

  -- the auth.users trigger auto-creates user_profiles(role='customer') and
  -- a customers row; overwrite the role and remove the customer row since
  -- this is a staff account
  update app.user_profiles
    set role = p_role, full_name = p_full_name, phone = p_phone
    where id = v_user_id;
  delete from app.customers where id = v_user_id;

  if p_role = 'delivery_partner' then
    insert into app.delivery_partners (id) values (v_user_id);
  else
    insert into app.employees (id, employee_code, department_id, designation_id, salary_monthly)
    values (v_user_id, p_employee_code, p_department_id, p_designation_id, p_salary_monthly);
  end if;

  return v_user_id;
end;
$$;
