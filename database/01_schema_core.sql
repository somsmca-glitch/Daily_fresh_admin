-- =====================================================================
-- ONLINE GROCERY DELIVERY PLATFORM — SUPABASE / POSTGRESQL SCHEMA
-- FILE: 01_schema_core.sql
-- PHASES COVERED: 3 (Table Definitions), 4 (DDL), 5 (Constraints & Indexes)
-- Naming convention: snake_case, plural table names, singular columns
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;      -- gen_random_uuid(), hashing
create extension if not exists pg_trgm;       -- fuzzy / fast text search
create extension if not exists btree_gist;    -- exclusion constraints (shift overlap etc.)
create extension if not exists postgis;       -- geospatial (store radius, GPS tracking)

-- ---------------------------------------------------------------------
-- 1. SCHEMAS
-- ---------------------------------------------------------------------
create schema if not exists app;      -- business tables
create schema if not exists audit;    -- audit log tables
create schema if not exists reporting;-- views / materialized views

set search_path = app, public;

-- ---------------------------------------------------------------------
-- 2. ENUM TYPES
-- ---------------------------------------------------------------------
create type app.user_role as enum (
  'customer','super_admin','store_manager','warehouse_manager',
  'delivery_partner','supplier','employee','support_agent'
);

create type app.address_type as enum ('home','office','other');

create type app.order_status as enum (
  'pending','accepted','packing','packed','out_for_delivery',
  'delivered','cancelled','returned','refunded'
);

create type app.payment_method as enum (
  'cash','upi','credit_card','debit_card','net_banking','wallet','gift_card'
);

create type app.payment_status as enum (
  'initiated','pending','success','failed','refunded','partially_refunded'
);

create type app.vehicle_type as enum ('bike','scooter','cycle','van');

create type app.discount_type as enum ('flat','percentage');

create type app.coupon_scope as enum (
  'global','category','brand','product','first_order','referral'
);

create type app.stock_movement_type as enum (
  'purchase_in','sale_out','transfer_in','transfer_out',
  'adjustment_in','adjustment_out','damaged','expired','return_in'
);

create type app.notification_channel as enum ('push','sms','whatsapp','email','in_app');

create type app.delivery_status as enum (
  'assigned','en_route_to_store','arrived_at_store','picked_up',
  'en_route_to_customer','arrived_at_customer','delivered','failed'
);

-- ---------------------------------------------------------------------
-- 3. COMMON AUDIT COLUMN TEMPLATE (applied to every table manually,
--    since Postgres has no "include" macro; kept consistent by convention)
--    created_at, updated_at, created_by, modified_by, is_deleted,
--    deleted_at, deleted_by
-- ---------------------------------------------------------------------

-- =====================================================================
-- MODULE: PLATFORM USERS (bridges to Supabase auth.users)
-- =====================================================================
create table app.user_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              app.user_role not null default 'customer',
  full_name         text,
  phone             text unique,
  email             text unique,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  modified_by       uuid,
  is_deleted        boolean not null default false,
  deleted_at        timestamptz,
  deleted_by        uuid
);
create index idx_user_profiles_role on app.user_profiles(role) where is_deleted = false;

-- =====================================================================
-- MODULE 1: PRODUCT MANAGEMENT
-- =====================================================================

create table app.brands (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  logo_url      text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app.user_profiles(id),
  modified_by   uuid references app.user_profiles(id),
  is_deleted    boolean not null default false,
  deleted_at    timestamptz,
  deleted_by    uuid references app.user_profiles(id)
);

create table app.categories (
  id              uuid primary key default gen_random_uuid(),
  parent_id       uuid references app.categories(id) on delete set null,
  name            text not null,
  tamil_name      text,
  slug            text not null unique,
  icon_url        text,
  banner_url      text,
  image_url       text,
  display_order   int not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references app.user_profiles(id),
  modified_by     uuid references app.user_profiles(id),
  is_deleted      boolean not null default false,
  deleted_at      timestamptz,
  deleted_by      uuid references app.user_profiles(id),
  constraint chk_categories_not_self_parent check (parent_id is distinct from id)
);
create index idx_categories_parent on app.categories(parent_id) where is_deleted = false;
create index idx_categories_active_order on app.categories(is_active, display_order);

create table app.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null unique,
  barcode             text unique,
  name                text not null,
  tamil_name          text,
  slug                text not null unique,
  description         text,
  short_description   text,
  brand_id            uuid references app.brands(id) on delete set null,
  category_id         uuid not null references app.categories(id) on delete restrict,
  subcategory_id      uuid references app.categories(id) on delete set null,
  unit                text not null default 'unit',        -- kg, g, l, ml, pcs
  weight              numeric(10,3),
  volume              numeric(10,3),
  size                text,
  pack_size           text,
  mrp                 numeric(10,2) not null check (mrp >= 0),
  selling_price       numeric(10,2) not null check (selling_price >= 0),
  purchase_price      numeric(10,2) check (purchase_price >= 0),
  discount_percent    numeric(5,2) generated always as (
                         case when mrp > 0
                           then round(((mrp - selling_price) / mrp) * 100, 2)
                           else 0 end) stored,
  gst_percent         numeric(5,2) not null default 0 check (gst_percent >= 0),
  hsn_code            text,
  tags                text[] default '{}',
  shelf_life_days     int check (shelf_life_days is null or shelf_life_days > 0),
  is_veg              boolean default true,
  is_organic          boolean default false,
  is_featured         boolean default false,
  is_trending         boolean default false,
  is_best_seller      boolean default false,
  is_active           boolean not null default true,
  search_vector       tsvector generated always as (
                         to_tsvector('simple',
                           coalesce(name,'') || ' ' || coalesce(tamil_name,'') || ' ' ||
                           coalesce(short_description,''))) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references app.user_profiles(id),
  modified_by         uuid references app.user_profiles(id),
  is_deleted          boolean not null default false,
  deleted_at          timestamptz,
  deleted_by          uuid references app.user_profiles(id),
  constraint chk_products_price check (selling_price <= mrp)
);
create index idx_products_category on app.products(category_id) where is_deleted = false;
create index idx_products_brand on app.products(brand_id) where is_deleted = false;
create index idx_products_active on app.products(is_active) where is_deleted = false;
create index idx_products_search on app.products using gin(search_vector);
create index idx_products_trgm_name on app.products using gin (name gin_trgm_ops);
create index idx_products_tags on app.products using gin(tags);
create index idx_products_flags on app.products(is_featured, is_trending, is_best_seller)
  where is_active = true and is_deleted = false;

create table app.product_images (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references app.products(id) on delete cascade,
  image_url     text not null,
  alt_text      text,
  display_order int not null default 0,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    uuid references app.user_profiles(id)
);
create unique index uq_product_primary_image on app.product_images(product_id)
  where is_primary = true;
create index idx_product_images_product on app.product_images(product_id);

create table app.product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references app.products(id) on delete cascade,
  variant_name    text not null,          -- '500 g', '1 kg', 'Small'
  barcode         text unique,
  sku             text not null unique,
  mrp             numeric(10,2) not null check (mrp >= 0),
  selling_price   numeric(10,2) not null check (selling_price >= 0),
  stock_quantity  int not null default 0 check (stock_quantity >= 0),
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references app.user_profiles(id),
  modified_by     uuid references app.user_profiles(id),
  is_deleted      boolean not null default false,
  constraint chk_variant_price check (selling_price <= mrp)
);
create index idx_product_variants_product on app.product_variants(product_id) where is_deleted = false;
create unique index uq_product_default_variant on app.product_variants(product_id)
  where is_default = true and is_deleted = false;

create table app.product_attributes (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references app.products(id) on delete cascade,
  attribute_name  text not null,     -- Color, Flavor, Brand, Size
  attribute_value text not null,
  created_at      timestamptz not null default now(),
  constraint uq_product_attribute unique (product_id, attribute_name)
);

create table app.product_reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references app.products(id) on delete cascade,
  customer_id   uuid not null references app.user_profiles(id) on delete cascade,
  order_item_id uuid, -- fk added after order_items is created (see 05_fk_patches)
  rating        smallint not null check (rating between 1 and 5),
  review_text   text,
  images        text[] default '{}',
  is_verified_purchase boolean not null default false,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  is_deleted    boolean not null default false,
  constraint uq_customer_product_review unique (product_id, customer_id)
);
create index idx_product_reviews_product on app.product_reviews(product_id) where is_deleted = false;

create table app.product_favorites (
  customer_id   uuid not null references app.user_profiles(id) on delete cascade,
  product_id    uuid not null references app.products(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (customer_id, product_id)
);

-- =====================================================================
-- MODULE 3: CUSTOMER MANAGEMENT
-- =====================================================================

create table app.customers (
  id                uuid primary key references app.user_profiles(id) on delete cascade,
  referral_code     text not null unique,
  referred_by       uuid references app.customers(id) on delete set null,
  wallet_balance    numeric(12,2) not null default 0 check (wallet_balance >= 0),
  loyalty_points    int not null default 0 check (loyalty_points >= 0),
  preferred_language text default 'ta',
  profile_image_url text,
  date_of_birth     date,
  gender            text,
  status            text not null default 'active' check (status in ('active','blocked','inactive')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  is_deleted        boolean not null default false
);

create table app.customer_addresses (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references app.customers(id) on delete cascade,
  address_type    app.address_type not null default 'home',
  label           text,
  contact_name    text,
  contact_phone   text,
  address_line1   text not null,
  address_line2   text,
  landmark        text,
  city            text not null,
  state           text not null,
  pincode         text not null,
  latitude        numeric(9,6) not null,
  longitude       numeric(9,6) not null,
  geog            geography(Point,4326) generated always as (
                     geography(ST_MakePoint(longitude, latitude))) stored,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  is_deleted      boolean not null default false
);
create index idx_customer_addresses_customer on app.customer_addresses(customer_id) where is_deleted = false;
create index idx_customer_addresses_geog on app.customer_addresses using gist(geog);
create unique index uq_customer_default_address on app.customer_addresses(customer_id)
  where is_default = true and is_deleted = false;

-- =====================================================================
-- MODULE 5: STORE / WAREHOUSE MANAGEMENT
-- =====================================================================

create table app.stores (
  id                uuid primary key default gen_random_uuid(),
  store_code        text not null unique,
  store_name        text not null,
  store_type        text not null default 'dark_store' check (store_type in ('dark_store','retail','warehouse')),
  address_line1     text not null,
  city              text not null,
  state             text not null,
  pincode           text not null,
  latitude          numeric(9,6) not null,
  longitude         numeric(9,6) not null,
  geog              geography(Point,4326) generated always as (
                       geography(ST_MakePoint(longitude, latitude))) stored,
  manager_id        uuid references app.user_profiles(id),
  phone             text,
  opening_time      time,
  closing_time      time,
  delivery_radius_km numeric(5,2) not null default 5.0 check (delivery_radius_km > 0),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  is_deleted        boolean not null default false
);
create index idx_stores_geog on app.stores using gist(geog);
create index idx_stores_active on app.stores(is_active) where is_deleted = false;

create table app.warehouses (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid references app.stores(id) on delete set null,
  warehouse_code text not null unique,
  name          text not null,
  address_line1 text,
  city          text,
  latitude      numeric(9,6),
  longitude     numeric(9,6),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =====================================================================
-- MODULE 4: SUPPLIER MANAGEMENT
-- =====================================================================

create table app.suppliers (
  id              uuid primary key default gen_random_uuid(),
  supplier_name   text not null,
  company_name    text,
  gst_number      text unique,
  pan_number      text unique,
  contact_person  text,
  email           text,
  phone           text not null,
  address_line1   text,
  city            text,
  state           text,
  pincode         text,
  bank_account_no text,
  bank_ifsc       text,
  bank_name       text,
  rating          numeric(2,1) default 0 check (rating between 0 and 5),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  is_deleted      boolean not null default false
);

create table app.supplier_products (
  supplier_id   uuid not null references app.suppliers(id) on delete cascade,
  product_id    uuid not null references app.products(id) on delete cascade,
  supply_price  numeric(10,2) not null check (supply_price >= 0),
  lead_time_days int default 1,
  is_preferred  boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (supplier_id, product_id)
);

create table app.purchase_orders (
  id              uuid primary key default gen_random_uuid(),
  po_number       text not null unique,
  supplier_id     uuid not null references app.suppliers(id) on delete restrict,
  warehouse_id    uuid not null references app.warehouses(id) on delete restrict,
  status          text not null default 'draft'
                    check (status in ('draft','submitted','approved','received','partially_received','cancelled')),
  order_date      date not null default current_date,
  expected_date   date,
  received_date   date,
  total_amount    numeric(12,2) not null default 0 check (total_amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references app.user_profiles(id)
);

create table app.purchase_order_items (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references app.purchase_orders(id) on delete cascade,
  product_id        uuid not null references app.products(id) on delete restrict,
  quantity_ordered  int not null check (quantity_ordered > 0),
  quantity_received int not null default 0 check (quantity_received >= 0),
  unit_price        numeric(10,2) not null check (unit_price >= 0),
  line_total        numeric(12,2) generated always as (quantity_ordered * unit_price) stored
);
create index idx_po_items_po on app.purchase_order_items(purchase_order_id);

create table app.supplier_payments (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references app.suppliers(id) on delete restrict,
  purchase_order_id uuid references app.purchase_orders(id) on delete set null,
  amount        numeric(12,2) not null check (amount > 0),
  payment_date  date not null default current_date,
  payment_mode  text not null default 'bank_transfer',
  reference_no  text,
  created_at    timestamptz not null default now(),
  created_by    uuid references app.user_profiles(id)
);

create table app.supplier_ledger (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid not null references app.suppliers(id) on delete cascade,
  entry_type    text not null check (entry_type in ('debit','credit')),
  amount        numeric(12,2) not null check (amount > 0),
  reference_type text,          -- 'purchase_order' | 'payment'
  reference_id  uuid,
  balance_after numeric(12,2) not null,
  created_at    timestamptz not null default now()
);
create index idx_supplier_ledger_supplier on app.supplier_ledger(supplier_id, created_at);

-- =====================================================================
-- MODULE 6: INVENTORY MANAGEMENT
-- =====================================================================

create table app.inventory (
  id              uuid primary key default gen_random_uuid(),
  warehouse_id    uuid not null references app.warehouses(id) on delete cascade,
  product_id      uuid not null references app.products(id) on delete cascade,
  variant_id      uuid references app.product_variants(id) on delete cascade,
  quantity_on_hand int not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved int not null default 0 check (quantity_reserved >= 0),
  reorder_level   int not null default 10,
  updated_at      timestamptz not null default now(),
  constraint uq_inventory_wh_product_variant unique (warehouse_id, product_id, variant_id)
);
create index idx_inventory_product on app.inventory(product_id);
create index idx_inventory_low_stock on app.inventory(warehouse_id) where quantity_on_hand <= reorder_level;

create table app.inventory_batches (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references app.warehouses(id) on delete cascade,
  product_id    uuid not null references app.products(id) on delete cascade,
  variant_id    uuid references app.product_variants(id),
  batch_number  text not null,
  quantity      int not null check (quantity >= 0),
  manufacture_date date,
  expiry_date   date,
  purchase_order_item_id uuid references app.purchase_order_items(id),
  created_at    timestamptz not null default now(),
  constraint uq_batch unique (warehouse_id, product_id, batch_number)
);
create index idx_inventory_batches_expiry on app.inventory_batches(expiry_date);

create table app.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  warehouse_id    uuid not null references app.warehouses(id),
  product_id      uuid not null references app.products(id),
  variant_id      uuid references app.product_variants(id),
  batch_id        uuid references app.inventory_batches(id),
  movement_type   app.stock_movement_type not null,
  quantity        int not null check (quantity <> 0),
  reference_type  text,   -- 'order' | 'purchase_order' | 'transfer' | 'adjustment'
  reference_id    uuid,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references app.user_profiles(id)
);
create index idx_stock_movements_product on app.stock_movements(product_id, created_at);
create index idx_stock_movements_warehouse on app.stock_movements(warehouse_id, created_at);

create table app.inventory_transfers (
  id              uuid primary key default gen_random_uuid(),
  from_warehouse_id uuid not null references app.warehouses(id),
  to_warehouse_id   uuid not null references app.warehouses(id),
  status          text not null default 'pending' check (status in ('pending','in_transit','completed','cancelled')),
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  created_by      uuid references app.user_profiles(id),
  constraint chk_transfer_diff_warehouse check (from_warehouse_id <> to_warehouse_id)
);

create table app.inventory_transfer_items (
  id            uuid primary key default gen_random_uuid(),
  transfer_id   uuid not null references app.inventory_transfers(id) on delete cascade,
  product_id    uuid not null references app.products(id),
  variant_id    uuid references app.product_variants(id),
  quantity      int not null check (quantity > 0)
);

create table app.damaged_stock (
  id            uuid primary key default gen_random_uuid(),
  warehouse_id  uuid not null references app.warehouses(id),
  product_id    uuid not null references app.products(id),
  variant_id    uuid references app.product_variants(id),
  quantity      int not null check (quantity > 0),
  reason        text,
  reported_at   timestamptz not null default now(),
  reported_by   uuid references app.user_profiles(id)
);

-- =====================================================================
-- MODULE 7: CUSTOMER ORDERS
-- =====================================================================

create table app.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,
  customer_id       uuid not null references app.customers(id) on delete restrict,
  store_id          uuid not null references app.stores(id) on delete restrict,
  delivery_address_id uuid not null references app.customer_addresses(id),
  status            app.order_status not null default 'pending',
  subtotal          numeric(12,2) not null check (subtotal >= 0),
  discount_amount   numeric(12,2) not null default 0 check (discount_amount >= 0),
  delivery_charge   numeric(10,2) not null default 0 check (delivery_charge >= 0),
  gst_amount        numeric(10,2) not null default 0 check (gst_amount >= 0),
  tip_amount        numeric(10,2) not null default 0 check (tip_amount >= 0),
  total_amount      numeric(12,2) not null check (total_amount >= 0),
  coupon_id         uuid,  -- fk added in patches after coupons table
  loyalty_points_used int not null default 0 check (loyalty_points_used >= 0),
  loyalty_points_earned int not null default 0 check (loyalty_points_earned >= 0),
  scheduled_delivery_at timestamptz,
  placed_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  is_deleted        boolean not null default false,
  constraint chk_order_total check (total_amount = subtotal - discount_amount + delivery_charge + gst_amount + tip_amount)
);
create index idx_orders_customer on app.orders(customer_id, created_at desc);
create index idx_orders_store on app.orders(store_id, created_at desc);
create index idx_orders_status on app.orders(status) where is_deleted = false;

create table app.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references app.orders(id) on delete cascade,
  product_id    uuid not null references app.products(id) on delete restrict,
  variant_id    uuid references app.product_variants(id),
  product_name_snapshot text not null,   -- denormalized for history integrity
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  quantity      int not null check (quantity > 0),
  line_total    numeric(12,2) generated always as (unit_price * quantity) stored,
  created_at    timestamptz not null default now()
);
create index idx_order_items_order on app.order_items(order_id);
create index idx_order_items_product on app.order_items(product_id);

alter table app.product_reviews
  add constraint fk_product_reviews_order_item
  foreign key (order_item_id) references app.order_items(id) on delete set null;

create table app.order_status_history (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references app.orders(id) on delete cascade,
  status        app.order_status not null,
  notes         text,
  changed_by    uuid references app.user_profiles(id),
  changed_at    timestamptz not null default now()
);
create index idx_order_status_history_order on app.order_status_history(order_id, changed_at);

create table app.order_notes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references app.orders(id) on delete cascade,
  note        text not null,
  is_internal boolean not null default true,
  created_by  uuid references app.user_profiles(id),
  created_at  timestamptz not null default now()
);

create table app.invoices (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references app.orders(id) on delete cascade,
  invoice_number text not null unique,
  invoice_url   text,
  issued_at     timestamptz not null default now()
);

create table app.order_cancellations (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references app.orders(id) on delete cascade,
  reason        text not null,
  cancelled_by  uuid references app.user_profiles(id),
  refund_amount numeric(12,2) default 0,
  created_at    timestamptz not null default now()
);

create table app.order_returns (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references app.order_items(id) on delete cascade,
  quantity      int not null check (quantity > 0),
  reason        text not null,
  status        text not null default 'requested'
                  check (status in ('requested','approved','rejected','picked_up','refunded')),
  is_exchange   boolean not null default false,
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz
);

-- =====================================================================
-- MODULE 12: PAYMENT MODULE
-- =====================================================================

create table app.payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references app.orders(id) on delete restrict,
  payment_method  app.payment_method not null,
  amount          numeric(12,2) not null check (amount > 0),
  status          app.payment_status not null default 'initiated',
  gateway_name    text,
  gateway_txn_id  text,
  gateway_response jsonb,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_payments_order on app.payments(order_id);
create index idx_payments_status on app.payments(status);

create table app.refunds (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references app.payments(id) on delete restrict,
  amount        numeric(12,2) not null check (amount > 0),
  reason        text,
  status        app.payment_status not null default 'initiated',
  refunded_to   text not null default 'source' check (refunded_to in ('source','wallet')),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create table app.customer_wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references app.customers(id) on delete cascade,
  entry_type    text not null check (entry_type in ('credit','debit')),
  amount        numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null,
  reference_type text,   -- 'order' | 'refund' | 'cashback' | 'referral' | 'manual'
  reference_id  uuid,
  notes         text,
  created_at    timestamptz not null default now()
);
create index idx_wallet_txn_customer on app.customer_wallet_transactions(customer_id, created_at desc);

create table app.loyalty_point_transactions (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references app.customers(id) on delete cascade,
  entry_type    text not null check (entry_type in ('earned','redeemed','expired','adjusted')),
  points        int not null,
  balance_after int not null,
  reference_type text,
  reference_id  uuid,
  created_at    timestamptz not null default now()
);
create index idx_loyalty_txn_customer on app.loyalty_point_transactions(customer_id, created_at desc);
