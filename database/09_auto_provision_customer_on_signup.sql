-- =====================================================================
-- FILE: 09_auto_provision_customer_on_signup.sql
-- When someone signs up via Supabase Auth (e.g. from the Flutter app),
-- automatically create their app.user_profiles row (role defaults to
-- 'customer') and app.customers row (with a generated referral code).
-- Staff/delivery-partner/supplier accounts are provisioned separately
-- by an admin (via the admin panel or SQL), not through public signup.
-- =====================================================================
set search_path = app, public;

create or replace function app.fn_handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = app, pg_catalog as $$
declare
  v_referral_code text;
begin
  insert into app.user_profiles (id, role, full_name, phone, email)
  values (
    new.id, 'customer',
    coalesce(new.raw_user_meta_data->>'full_name', null),
    new.phone,
    new.email
  )
  on conflict (id) do nothing;

  loop
    v_referral_code := upper(substr(md5(new.id::text || clock_timestamp()::text), 1, 8));
    begin
      insert into app.customers (id, referral_code)
      values (new.id, v_referral_code);
      exit;
    exception when unique_violation then
      exit;
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_new_auth_user on auth.users;
create trigger trg_new_auth_user
  after insert on auth.users
  for each row execute function app.fn_handle_new_auth_user();
