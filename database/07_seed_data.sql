-- =====================================================================
-- FILE: 07_seed_data.sql
-- PHASE 6: Seed Data
-- NOTE: app.user_profiles rows normally come from Supabase Auth signup
-- (auth.users). For seeding in a dev/staging project, insert matching
-- rows into auth.users first (via Supabase Admin API or the auth
-- schema directly), then run this script. UUIDs below are illustrative
-- fixed values so foreign keys stay consistent across this file.
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- Departments & Designations
-- ---------------------------------------------------------------------
insert into app.departments (id, name) values
  ('11111111-0000-0000-0000-000000000001','Operations'),
  ('11111111-0000-0000-0000-000000000002','Warehouse'),
  ('11111111-0000-0000-0000-000000000003','Customer Support');

insert into app.designations (id, department_id, title) values
  ('11111111-0000-0000-0000-000000000101','11111111-0000-0000-0000-000000000001','Store Manager'),
  ('11111111-0000-0000-0000-000000000102','11111111-0000-0000-0000-000000000002','Warehouse Manager'),
  ('11111111-0000-0000-0000-000000000103','11111111-0000-0000-0000-000000000003','Support Agent');

-- ---------------------------------------------------------------------
-- Brands & Categories
-- ---------------------------------------------------------------------
insert into app.brands (id, name) values
  ('22222222-0000-0000-0000-000000000001','Amul'),
  ('22222222-0000-0000-0000-000000000002','Aachi'),
  ('22222222-0000-0000-0000-000000000003','Tata');

insert into app.categories (id, name, tamil_name, slug, display_order) values
  ('33333333-0000-0000-0000-000000000001','Vegetables & Fruits','காய்கறிகள் & பழங்கள்','vegetables-fruits',1),
  ('33333333-0000-0000-0000-000000000002','Dairy & Breakfast','பால் பொருட்கள்','dairy-breakfast',2),
  ('33333333-0000-0000-0000-000000000003','Masalas & Spices','மசாலா & மசாலா பொருட்கள்','masalas-spices',3);

insert into app.categories (id, parent_id, name, slug, display_order) values
  ('33333333-0000-0000-0000-000000000011','33333333-0000-0000-0000-000000000001','Fresh Vegetables','fresh-vegetables',1),
  ('33333333-0000-0000-0000-000000000012','33333333-0000-0000-0000-000000000002','Milk','milk',1);

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------
insert into app.products (id, sku, barcode, name, tamil_name, slug, category_id, subcategory_id,
                           brand_id, unit, mrp, selling_price, gst_percent, hsn_code, is_veg) values
  ('44444444-0000-0000-0000-000000000001','SKU-TOM-001','8901000001','Tomato','தக்காளி','tomato',
    '33333333-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000011',
    null,'kg',40.00,32.00,0,'0702',true),
  ('44444444-0000-0000-0000-000000000002','SKU-MLK-001','8901000002','Amul Toned Milk','அமுல் பால்','amul-toned-milk',
    '33333333-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000012',
    '22222222-0000-0000-0000-000000000001','l',66.00,64.00,5,'0401',true),
  ('44444444-0000-0000-0000-000000000003','SKU-SPC-001','8901000003','Aachi Sambar Powder','ஆச்சி சாம்பார் தூள்','aachi-sambar-powder',
    '33333333-0000-0000-0000-000000000003',null,
    '22222222-0000-0000-0000-000000000002','g',95.00,89.00,12,'0910',true);

insert into app.product_variants (product_id, variant_name, sku, mrp, selling_price, stock_quantity, is_default) values
  ('44444444-0000-0000-0000-000000000002','500 ml','SKU-MLK-001-500ML',66.00,64.00,200,true),
  ('44444444-0000-0000-0000-000000000003','200 g','SKU-SPC-001-200G',95.00,89.00,150,true);

-- ---------------------------------------------------------------------
-- Stores & Warehouses
-- ---------------------------------------------------------------------
insert into app.stores (id, store_code, store_name, address_line1, city, state, pincode,
                         latitude, longitude, phone, opening_time, closing_time, delivery_radius_km) values
  ('55555555-0000-0000-0000-000000000001','STR-DPM-01','Dharapuram Dark Store','Main Bazaar Road',
    'Dharapuram','Tamil Nadu','638656', 10.7378, 77.5312, '+919000000001','06:00','23:00',6.0);

insert into app.warehouses (id, store_id, warehouse_code, name, city) values
  ('66666666-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000001',
    'WH-DPM-01','Dharapuram Warehouse','Dharapuram');

-- ---------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------
insert into app.inventory (warehouse_id, product_id, variant_id, quantity_on_hand, reorder_level) values
  ('66666666-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001', null, 500, 50),
  ('66666666-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002',
    (select id from app.product_variants where sku = 'SKU-MLK-001-500ML'), 200, 30),
  ('66666666-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000003',
    (select id from app.product_variants where sku = 'SKU-SPC-001-200G'), 150, 20);

-- ---------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------
insert into app.suppliers (id, supplier_name, company_name, gst_number, phone, city, state) values
  ('77777777-0000-0000-0000-000000000001','Kumar Traders','Kumar Agro Traders Pvt Ltd',
    '33AAAAA0000A1Z5','+919000000010','Tiruppur','Tamil Nadu');

insert into app.supplier_products (supplier_id, product_id, supply_price, is_preferred) values
  ('77777777-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001', 24.00, true);

-- ---------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------
insert into app.coupons (id, code, description, scope, discount_type, discount_value,
                          max_discount_amount, min_order_value, usage_limit_per_customer, valid_until) values
  ('88888888-0000-0000-0000-000000000001','WELCOME50','50% off up to ₹100 on first order',
    'first_order','percentage',50.00,100.00,199.00,1, now() + interval '90 days'),
  ('88888888-0000-0000-0000-000000000002','FLAT20','Flat ₹20 off on orders above ₹299',
    'global','flat',20.00,null,299.00,3, now() + interval '30 days');

-- ---------------------------------------------------------------------
-- Notification templates
-- ---------------------------------------------------------------------
insert into app.notification_templates (code, channel, subject, body_template) values
  ('order_confirmed','push','Order Confirmed','Your order {{order_number}} has been confirmed!'),
  ('otp_delivery','sms', null, 'Your delivery OTP is {{otp}}. Share this with your delivery partner.'),
  ('order_delivered','push','Order Delivered','Your order {{order_number}} has been delivered. Enjoy!');

-- NOTE: customer / employee / delivery_partner rows are intentionally
-- omitted here — create them via Supabase Auth signup first (so
-- auth.users.id exists), then insert the matching app.user_profiles /
-- app.customers / app.employees / app.delivery_partners row using that
-- same id, e.g.:
--
--   insert into app.user_profiles (id, role, full_name, phone)
--   values ('<auth-user-uuid>', 'customer', 'Somasundaram', '+919000000099');
--
--   insert into app.customers (id, referral_code)
--   values ('<auth-user-uuid>', 'SOM100');
