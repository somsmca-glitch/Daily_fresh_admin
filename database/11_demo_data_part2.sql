-- =====================================================================
-- FILE: 11_demo_data_part2.sql
-- Dummy customers (15) and delivery partners (3), each backed by a real
-- auth.users + auth.identities row (required since app.user_profiles.id
-- is a foreign key to auth.users.id). All use the same demo password so
-- they're easy to log into if needed: Demo@12345
-- =====================================================================
set search_path = app, public;

do $$
declare
  v_names text[] := array[
    'Karthik Raja','Divya Priya','Suresh Kumar','Lakshmi Narayanan','Anitha Selvam',
    'Muthu Kumaran','Priya Dharshini','Vignesh Waran','Kavitha Rani','Ramesh Babu',
    'Saranya Devi','Arun Prakash','Meena Kshi','Bala Murugan','Deepa Lakshmi'
  ];
  v_name text;
  v_user_id uuid;
  v_email text;
  v_phone text;
  i int := 0;
  v_lat numeric; v_lng numeric;
begin
  foreach v_name in array v_names loop
    i := i + 1;
    v_user_id := gen_random_uuid();
    v_email := 'customer' || i || '@demo.dailyfresh.local';
    v_phone := '+9198765' || lpad(i::text, 5, '0');

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt('Demo@12345', extensions.gen_salt('bf')),
      now() - (random() * 90 || ' days')::interval,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name),
      now() - (random() * 90 || ' days')::interval, now(), '', '', '', '', false, false
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());

    -- trigger already created user_profiles + customers rows; fill them in
    update app.user_profiles set full_name = v_name, phone = v_phone where id = v_user_id;
    update app.customers set
      wallet_balance = round((random() * 300)::numeric, 2),
      loyalty_points = floor(random() * 500)::int
    where id = v_user_id;

    -- one address per customer, scattered around Dharapuram/Palladam
    v_lat := 10.74 + (random() * 0.28 - 0.14);
    v_lng := 77.30 + (random() * 0.28 - 0.14);
    insert into app.customer_addresses
      (customer_id, address_type, contact_name, contact_phone, address_line1, city, state, pincode, latitude, longitude, is_default)
    values (
      v_user_id, 'home', v_name, v_phone,
      (10 + i) || ', ' || (array['Bazaar Street','Gandhi Road','Temple Street','Market Road','Mill Road'])[1 + (i % 5)],
      case when i % 3 = 0 then 'Palladam' else 'Dharapuram' end,
      'Tamil Nadu', case when i % 3 = 0 then '641664' else '638656' end,
      v_lat, v_lng, true
    );
  end loop;
end $$;

-- Delivery partners
do $$
declare
  v_names text[] := array['Sathish Kumar','Praveen Raj','Yogesh Waran'];
  v_name text;
  v_user_id uuid;
  v_email text;
  i int := 0;
begin
  foreach v_name in array v_names loop
    i := i + 1;
    v_user_id := gen_random_uuid();
    v_email := 'partner' || i || '@demo.dailyfresh.local';

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, extensions.crypt('Demo@12345', extensions.gen_salt('bf')),
      now() - interval '90 days', '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_name), now() - interval '90 days', now(), '', '', '', '', false, false
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
    values (gen_random_uuid(), v_user_id, v_user_id::text,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email), 'email', now(), now(), now());

    update app.user_profiles set role = 'delivery_partner', full_name = v_name where id = v_user_id;
    delete from app.customers where id = v_user_id;

    insert into app.delivery_partners (id, is_available, current_latitude, current_longitude, rating, completed_deliveries, status)
    values (v_user_id, true, 10.7378 + (random()*0.05 - 0.025), 77.5312 + (random()*0.05 - 0.025),
            round((3.8 + random()*1.2)::numeric, 1), 0, 'active');

    insert into app.delivery_partner_vehicles (delivery_partner_id, vehicle_type, registration_number)
    values (v_user_id, 'bike', 'TN39-' || lpad((1000+i)::text,4,'0'));
  end loop;
end $$;
