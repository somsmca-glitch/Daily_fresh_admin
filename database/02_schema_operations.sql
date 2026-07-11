-- =====================================================================
-- FILE: 02_schema_operations.sql
-- Modules: Delivery Management, Delivery Partners, Employees,
--          Coupons & Offers, Notifications
-- =====================================================================
set search_path = app, public;

-- =====================================================================
-- MODULE 9: DELIVERY PARTNERS
-- =====================================================================

create table app.delivery_partners (
  id                uuid primary key references app.user_profiles(id) on delete cascade,
  aadhaar_number    text unique,
  pan_number        text unique,
  driving_license    text unique,
  bank_account_no   text,
  bank_ifsc         text,
  is_available      boolean not null default false,
  current_latitude  numeric(9,6),
  current_longitude numeric(9,6),
  current_geog      geography(Point,4326) generated always as (
                       case when current_latitude is not null and current_longitude is not null
                         then geography(ST_MakePoint(current_longitude, current_latitude))
                         else null end) stored,
  rating            numeric(2,1) default 0 check (rating between 0 and 5),
  completed_deliveries int not null default 0,
  total_earnings    numeric(12,2) not null default 0,
  status            text not null default 'active' check (status in ('active','suspended','inactive')),
  onboarded_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_delivery_partners_geog on app.delivery_partners using gist(current_geog);
create index idx_delivery_partners_available on app.delivery_partners(is_available) where status = 'active';

create table app.delivery_partner_vehicles (
  id                uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references app.delivery_partners(id) on delete cascade,
  vehicle_type      app.vehicle_type not null,
  registration_number text unique,
  insurance_number  text,
  insurance_expiry  date,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create table app.delivery_partner_shifts (
  id                uuid primary key default gen_random_uuid(),
  delivery_partner_id uuid not null references app.delivery_partners(id) on delete cascade,
  store_id          uuid references app.stores(id),
  shift_start       timestamptz not null,
  shift_end         timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint chk_shift_time check (shift_end > shift_start)
);
create index idx_dp_shifts_partner on app.delivery_partner_shifts(delivery_partner_id, shift_start);

-- =====================================================================
-- MODULE 8: DELIVERY MANAGEMENT
-- =====================================================================

create table app.delivery_orders (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null unique references app.orders(id) on delete cascade,
  delivery_partner_id uuid references app.delivery_partners(id) on delete set null,
  status              app.delivery_status not null default 'assigned',
  otp                 text,
  otp_verified_at     timestamptz,
  distance_km         numeric(6,2),
  estimated_minutes   int,
  actual_minutes      int,
  delivery_charge     numeric(10,2) not null default 0,
  proof_photo_url     text,
  customer_signature_url text,
  assigned_at         timestamptz not null default now(),
  picked_up_at        timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_delivery_orders_partner on app.delivery_orders(delivery_partner_id);
create index idx_delivery_orders_status on app.delivery_orders(status);

create table app.delivery_tracking (
  id                uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references app.delivery_orders(id) on delete cascade,
  latitude          numeric(9,6) not null,
  longitude         numeric(9,6) not null,
  geog              geography(Point,4326) generated always as (
                       geography(ST_MakePoint(longitude, latitude))) stored,
  recorded_at       timestamptz not null default now()
);
create index idx_delivery_tracking_order on app.delivery_tracking(delivery_order_id, recorded_at desc);
create index idx_delivery_tracking_geog on app.delivery_tracking using gist(geog);

create table app.delivery_photos (
  id                uuid primary key default gen_random_uuid(),
  delivery_order_id uuid not null references app.delivery_orders(id) on delete cascade,
  photo_url         text not null,
  photo_type        text default 'proof_of_delivery',
  created_at        timestamptz not null default now()
);

-- =====================================================================
-- MODULE 10: EMPLOYEE MANAGEMENT
-- =====================================================================

create table app.departments (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique
);

create table app.designations (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null references app.departments(id) on delete cascade,
  title         text not null,
  constraint uq_designation unique (department_id, title)
);

create table app.employees (
  id              uuid primary key references app.user_profiles(id) on delete cascade,
  employee_code   text not null unique,
  department_id   uuid references app.departments(id),
  designation_id  uuid references app.designations(id),
  reporting_manager_id uuid references app.employees(id) on delete set null,
  date_of_joining date not null default current_date,
  salary_monthly  numeric(10,2) check (salary_monthly >= 0),
  status          text not null default 'active' check (status in ('active','on_leave','terminated')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table app.employee_store_assignments (
  employee_id   uuid not null references app.employees(id) on delete cascade,
  store_id      uuid not null references app.stores(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  primary key (employee_id, store_id)
);

create table app.employee_warehouse_assignments (
  employee_id   uuid not null references app.employees(id) on delete cascade,
  warehouse_id  uuid not null references app.warehouses(id) on delete cascade,
  assigned_at   timestamptz not null default now(),
  primary key (employee_id, warehouse_id)
);

create table app.roles_permissions (
  id            uuid primary key default gen_random_uuid(),
  role          app.user_role not null,
  permission_key text not null,   -- e.g. 'orders.view', 'inventory.edit'
  constraint uq_role_permission unique (role, permission_key)
);

create table app.employee_attendance (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees(id) on delete cascade,
  attendance_date date not null,
  check_in      timestamptz,
  check_out     timestamptz,
  status        text not null default 'present' check (status in ('present','absent','half_day','leave')),
  constraint uq_employee_attendance unique (employee_id, attendance_date)
);

create table app.employee_leaves (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees(id) on delete cascade,
  leave_type    text not null default 'casual',
  start_date    date not null,
  end_date      date not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason        text,
  approved_by   uuid references app.employees(id),
  created_at    timestamptz not null default now(),
  constraint chk_leave_dates check (end_date >= start_date)
);

create table app.employee_shifts (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees(id) on delete cascade,
  shift_start   timestamptz not null,
  shift_end     timestamptz not null,
  constraint chk_emp_shift_time check (shift_end > shift_start)
);

create table app.employee_performance_reviews (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees(id) on delete cascade,
  review_period text not null,      -- e.g. '2026-Q2'
  rating        numeric(2,1) check (rating between 0 and 5),
  remarks       text,
  reviewed_by   uuid references app.employees(id),
  created_at    timestamptz not null default now(),
  constraint uq_employee_review_period unique (employee_id, review_period)
);

create table app.salary_payments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references app.employees(id) on delete cascade,
  pay_period    text not null,        -- '2026-06'
  gross_amount  numeric(10,2) not null check (gross_amount >= 0),
  deductions    numeric(10,2) not null default 0,
  net_amount    numeric(10,2) generated always as (gross_amount - deductions) stored,
  paid_at       timestamptz,
  status        text not null default 'pending' check (status in ('pending','paid','failed')),
  constraint uq_salary_period unique (employee_id, pay_period)
);

-- =====================================================================
-- MODULE 11: COUPONS & OFFERS
-- =====================================================================

create table app.coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  description       text,
  scope             app.coupon_scope not null default 'global',
  discount_type     app.discount_type not null default 'percentage',
  discount_value    numeric(10,2) not null check (discount_value > 0),
  max_discount_amount numeric(10,2),
  min_order_value   numeric(10,2) not null default 0,
  category_id       uuid references app.categories(id) on delete set null,
  brand_id          uuid references app.brands(id) on delete set null,
  product_id        uuid references app.products(id) on delete set null,
  usage_limit_total int,
  usage_limit_per_customer int not null default 1,
  used_count        int not null default 0,
  valid_from        timestamptz not null default now(),
  valid_until       timestamptz not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid references app.user_profiles(id),
  constraint chk_coupon_validity check (valid_until > valid_from)
);
create index idx_coupons_code on app.coupons(code) where is_active = true;

alter table app.orders
  add constraint fk_orders_coupon
  foreign key (coupon_id) references app.coupons(id) on delete set null;

create table app.coupon_redemptions (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references app.coupons(id) on delete cascade,
  customer_id   uuid not null references app.customers(id) on delete cascade,
  order_id      uuid not null references app.orders(id) on delete cascade,
  discount_applied numeric(10,2) not null check (discount_applied >= 0),
  redeemed_at   timestamptz not null default now(),
  constraint uq_order_coupon unique (order_id, coupon_id)
);
create index idx_coupon_redemptions_customer on app.coupon_redemptions(customer_id, coupon_id);

create table app.referral_offers (
  id                uuid primary key default gen_random_uuid(),
  referrer_id       uuid not null references app.customers(id) on delete cascade,
  referee_id        uuid not null references app.customers(id) on delete cascade,
  referrer_bonus    numeric(10,2) not null default 0,
  referee_bonus     numeric(10,2) not null default 0,
  status            text not null default 'pending' check (status in ('pending','credited','expired')),
  created_at        timestamptz not null default now(),
  credited_at       timestamptz,
  constraint uq_referral unique (referrer_id, referee_id),
  constraint chk_referral_diff check (referrer_id <> referee_id)
);

create table app.flash_sales (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  is_active     boolean not null default true,
  constraint chk_flash_sale_time check (ends_at > starts_at)
);

create table app.flash_sale_products (
  flash_sale_id uuid not null references app.flash_sales(id) on delete cascade,
  product_id    uuid not null references app.products(id) on delete cascade,
  sale_price    numeric(10,2) not null check (sale_price >= 0),
  max_qty_per_customer int default 5,
  primary key (flash_sale_id, product_id)
);

create table app.happy_hours (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  day_of_week   smallint not null check (day_of_week between 0 and 6), -- 0=Sunday
  start_time    time not null,
  end_time      time not null,
  discount_percent numeric(5,2) not null check (discount_percent between 0 and 100),
  category_id   uuid references app.categories(id),
  is_active     boolean not null default true,
  constraint chk_happy_hour_time check (end_time > start_time)
);

create table app.combo_offers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  combo_price   numeric(10,2) not null check (combo_price >= 0),
  is_active     boolean not null default true,
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz
);

create table app.combo_offer_products (
  combo_offer_id uuid not null references app.combo_offers(id) on delete cascade,
  product_id     uuid not null references app.products(id) on delete cascade,
  quantity       int not null default 1 check (quantity > 0),
  primary key (combo_offer_id, product_id)
);

-- =====================================================================
-- MODULE 13: NOTIFICATIONS
-- =====================================================================

create table app.notification_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,     -- 'order_confirmed', 'otp_delivery'
  channel       app.notification_channel not null,
  subject       text,
  body_template text not null,            -- supports {{placeholders}}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table app.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app.user_profiles(id) on delete cascade,
  template_id   uuid references app.notification_templates(id),
  channel       app.notification_channel not null,
  title         text,
  body          text not null,
  is_read       boolean not null default false,
  sent_at       timestamptz,
  status        text not null default 'queued' check (status in ('queued','sent','failed','read')),
  created_at    timestamptz not null default now()
);
create index idx_notifications_user on app.notifications(user_id, created_at desc);
create index idx_notifications_unread on app.notifications(user_id) where is_read = false;
