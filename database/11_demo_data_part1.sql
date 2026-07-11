-- =====================================================================
-- FILE: 11_demo_data.sql
-- Expands the seed data into a realistic demo dataset: more categories
-- and products, a second store, ~15 customers, 3 delivery partners,
-- and ~100 historical orders spread across the last 60 days with a
-- realistic status distribution — enough for the admin panel's charts
-- and analytics views to show real trends instead of near-empty data.
-- Safe to run once; re-running will create duplicate customers/orders
-- (guarded only where natural unique constraints exist, e.g. SKUs).
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- 1. More categories
-- ---------------------------------------------------------------------
insert into app.categories (id, name, slug, display_order) values
  ('33333333-0000-0000-0000-000000000004','Bakery','bakery',4),
  ('33333333-0000-0000-0000-000000000005','Snacks & Beverages','snacks-beverages',5),
  ('33333333-0000-0000-0000-000000000006','Personal Care','personal-care',6),
  ('33333333-0000-0000-0000-000000000007','Household Essentials','household-essentials',7),
  ('33333333-0000-0000-0000-000000000008','Staples & Grains','staples-grains',8)
on conflict (slug) do nothing;

insert into app.categories (id, parent_id, name, slug, display_order) values
  ('33333333-0000-0000-0000-000000000013','33333333-0000-0000-0000-000000000001','Fresh Fruits','fresh-fruits',2),
  ('33333333-0000-0000-0000-000000000014','33333333-0000-0000-0000-000000000002','Curd & Yogurt','curd-yogurt',2),
  ('33333333-0000-0000-0000-000000000015','33333333-0000-0000-0000-000000000004','Bread & Buns','bread-buns',1),
  ('33333333-0000-0000-0000-000000000016','33333333-0000-0000-0000-000000000005','Chips & Namkeen','chips-namkeen',1),
  ('33333333-0000-0000-0000-000000000017','33333333-0000-0000-0000-000000000005','Soft Drinks & Beverages','soft-drinks-beverages',2),
  ('33333333-0000-0000-0000-000000000018','33333333-0000-0000-0000-000000000006','Bath & Body','bath-body',1),
  ('33333333-0000-0000-0000-000000000019','33333333-0000-0000-0000-000000000007','Cleaning Supplies','cleaning-supplies',1),
  ('33333333-0000-0000-0000-000000000020','33333333-0000-0000-0000-000000000008','Dals & Pulses','dals-pulses',1),
  ('33333333-0000-0000-0000-000000000021','33333333-0000-0000-0000-000000000008','Rice & Flours','rice-flours',2),
  ('33333333-0000-0000-0000-000000000022','33333333-0000-0000-0000-000000000008','Edible Oils','edible-oils',3)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2. More brands
-- ---------------------------------------------------------------------
insert into app.brands (id, name) values
  ('22222222-0000-0000-0000-000000000004','Britannia'),
  ('22222222-0000-0000-0000-000000000005','Lays'),
  ('22222222-0000-0000-0000-000000000006','Haldiram''s'),
  ('22222222-0000-0000-0000-000000000007','Coca-Cola'),
  ('22222222-0000-0000-0000-000000000008','Bru'),
  ('22222222-0000-0000-0000-000000000009','Dove'),
  ('22222222-0000-0000-0000-000000000010','Colgate'),
  ('22222222-0000-0000-0000-000000000011','Vim'),
  ('22222222-0000-0000-0000-000000000012','Surf Excel'),
  ('22222222-0000-0000-0000-000000000013','Fortune')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- 3. More products
-- ---------------------------------------------------------------------
insert into app.products (id, sku, name, slug, category_id, subcategory_id, brand_id, unit, mrp, selling_price, gst_percent, is_veg) values
  ('44444444-0000-0000-0000-000000000004','SKU-ONI-001','Onion','onion','33333333-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000011', null,'kg',35.00,28.00,0,true),
  ('44444444-0000-0000-0000-000000000005','SKU-POT-001','Potato','potato','33333333-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000011', null,'kg',30.00,24.00,0,true),
  ('44444444-0000-0000-0000-000000000006','SKU-BAN-001','Banana','banana','33333333-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000013', null,'kg',50.00,42.00,0,true),
  ('44444444-0000-0000-0000-000000000007','SKU-APP-001','Apple','apple','33333333-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000013', null,'kg',180.00,159.00,0,true),
  ('44444444-0000-0000-0000-000000000008','SKU-CRD-001','Fresh Curd','fresh-curd','33333333-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000014','22222222-0000-0000-0000-000000000001','g',45.00,42.00,5,true),
  ('44444444-0000-0000-0000-000000000009','SKU-PNR-001','Paneer','paneer','33333333-0000-0000-0000-000000000002',null,'22222222-0000-0000-0000-000000000001','g',90.00,85.00,5,true),
  ('44444444-0000-0000-0000-000000000010','SKU-BRD-001','White Bread','white-bread','33333333-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000015','22222222-0000-0000-0000-000000000004','pcs',45.00,40.00,5,true),
  ('44444444-0000-0000-0000-000000000011','SKU-BUN-001','Butter Bun (4 pcs)','butter-bun','33333333-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000015','22222222-0000-0000-0000-000000000004','pcs',35.00,32.00,5,true),
  ('44444444-0000-0000-0000-000000000012','SKU-CHP-001','Lays Classic Chips','lays-classic-chips','33333333-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000016','22222222-0000-0000-0000-000000000005','g',20.00,20.00,12,true),
  ('44444444-0000-0000-0000-000000000013','SKU-NMK-001','Haldiram''s Aloo Bhujia','haldiram-aloo-bhujia','33333333-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000016','22222222-0000-0000-0000-000000000006','g',55.00,50.00,12,true),
  ('44444444-0000-0000-0000-000000000014','SKU-CKE-001','Coca-Cola 750ml','coca-cola-750ml','33333333-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000017','22222222-0000-0000-0000-000000000007','ml',45.00,42.00,18,true),
  ('44444444-0000-0000-0000-000000000015','SKU-COF-001','Bru Instant Coffee','bru-instant-coffee','33333333-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000017','22222222-0000-0000-0000-000000000008','g',120.00,110.00,12,true),
  ('44444444-0000-0000-0000-000000000016','SKU-TEA-002','Tata Tea Gold','tata-tea-gold','33333333-0000-0000-0000-000000000005','33333333-0000-0000-0000-000000000017','22222222-0000-0000-0000-000000000003','g',140.00,129.00,5,true),
  ('44444444-0000-0000-0000-000000000017','SKU-SOP-001','Dove Soap','dove-soap','33333333-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000018','22222222-0000-0000-0000-000000000009','pcs',65.00,60.00,18,true),
  ('44444444-0000-0000-0000-000000000018','SKU-TPS-001','Colgate Toothpaste','colgate-toothpaste','33333333-0000-0000-0000-000000000006','33333333-0000-0000-0000-000000000018','22222222-0000-0000-0000-000000000010','g',55.00,49.00,18,true),
  ('44444444-0000-0000-0000-000000000019','SKU-DSH-001','Vim Dishwash Gel','vim-dishwash-gel','33333333-0000-0000-0000-000000000007','33333333-0000-0000-0000-000000000019','22222222-0000-0000-0000-000000000011','ml',110.00,99.00,18,true),
  ('44444444-0000-0000-0000-000000000020','SKU-DET-001','Surf Excel Detergent','surf-excel-detergent','33333333-0000-0000-0000-000000000007','33333333-0000-0000-0000-000000000019','22222222-0000-0000-0000-000000000012','g',180.00,165.00,18,true),
  ('44444444-0000-0000-0000-000000000021','SKU-DAL-001','Toor Dal','toor-dal','33333333-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000020', null,'kg',150.00,138.00,0,true),
  ('44444444-0000-0000-0000-000000000022','SKU-RIC-001','Basmati Rice','basmati-rice','33333333-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000021', null,'kg',120.00,109.00,0,true),
  ('44444444-0000-0000-0000-000000000023','SKU-OIL-001','Fortune Sunflower Oil','fortune-sunflower-oil','33333333-0000-0000-0000-000000000008','33333333-0000-0000-0000-000000000022','22222222-0000-0000-0000-000000000013','l',165.00,152.00,5,true)
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------
-- 4. A second store + warehouse (multi-store realism)
-- ---------------------------------------------------------------------
insert into app.stores (id, store_code, store_name, address_line1, city, state, pincode, latitude, longitude, phone, opening_time, closing_time, delivery_radius_km) values
  ('55555555-0000-0000-0000-000000000002','STR-PLD-01','Palladam Dark Store','Trichy Road', 'Palladam','Tamil Nadu','641664', 10.9917, 77.2894, '+919000000002','06:00','23:00',6.0)
on conflict (store_code) do nothing;

insert into app.warehouses (id, store_id, warehouse_code, name, city) values
  ('66666666-0000-0000-0000-000000000002','55555555-0000-0000-0000-000000000002','WH-PLD-01','Palladam Warehouse','Palladam')
on conflict (warehouse_code) do nothing;

-- ---------------------------------------------------------------------
-- 5. Inventory for every product at both warehouses
-- ---------------------------------------------------------------------
insert into app.inventory (warehouse_id, product_id, variant_id, quantity_on_hand, reorder_level)
select wh.id, p.id, null, 50 + floor(random() * 250)::int, 15 + floor(random() * 20)::int
from app.warehouses wh
cross join app.products p
where p.id not in (select product_id from app.product_variants where is_default = true and is_deleted = false)
on conflict (warehouse_id, product_id, variant_id) do nothing;

insert into app.inventory (warehouse_id, product_id, variant_id, quantity_on_hand, reorder_level)
select wh.id, pv.product_id, pv.id, 50 + floor(random() * 250)::int, 15 + floor(random() * 20)::int
from app.warehouses wh
cross join app.product_variants pv
where pv.is_default = true and pv.is_deleted = false
on conflict (warehouse_id, product_id, variant_id) do nothing;

-- deliberately leave a couple of rows low, for the low-stock alert demo
update app.inventory set quantity_on_hand = 8
where warehouse_id = '66666666-0000-0000-0000-000000000001'
  and product_id = '44444444-0000-0000-0000-000000000004';
update app.inventory set quantity_on_hand = 5
where warehouse_id = '66666666-0000-0000-0000-000000000002'
  and product_id = '44444444-0000-0000-0000-000000000021';
