-- =====================================================================
-- FILE: 06_views_reports.sql
-- PHASE 9: Views, Materialized Views, and Dashboard Queries
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- 9.1 Product catalog view (denormalized, safe for the storefront)
-- ---------------------------------------------------------------------
create or replace view reporting.v_product_catalog as
select
  p.id, p.sku, p.name, p.tamil_name, p.slug, p.short_description,
  b.name as brand_name, c.name as category_name, sc.name as subcategory_name,
  p.mrp, p.selling_price, p.discount_percent, p.gst_percent,
  p.is_veg, p.is_organic, p.is_featured, p.is_trending, p.is_best_seller,
  (select image_url from app.product_images pi where pi.product_id = p.id and pi.is_primary limit 1) as primary_image,
  coalesce((select sum(quantity_on_hand - quantity_reserved) from app.inventory i where i.product_id = p.id), 0) as available_stock
from app.products p
left join app.brands b on b.id = p.brand_id
join app.categories c on c.id = p.category_id
left join app.categories sc on sc.id = p.subcategory_id
where p.is_active = true and p.is_deleted = false;

-- ---------------------------------------------------------------------
-- 9.2 Order summary view for customer-facing "My Orders"
-- ---------------------------------------------------------------------
create or replace view reporting.v_customer_order_summary as
select
  o.id as order_id, o.order_number, o.customer_id, o.status,
  o.total_amount, o.placed_at,
  s.store_name,
  (select count(*) from app.order_items oi where oi.order_id = o.id) as item_count,
  d.status as delivery_status, d.delivered_at
from app.orders o
join app.stores s on s.id = o.store_id
left join app.delivery_orders d on d.order_id = o.id
where o.is_deleted = false;

-- ---------------------------------------------------------------------
-- 9.3 Daily sales (Phase 14 analytics)
-- ---------------------------------------------------------------------
create materialized view reporting.mv_daily_sales as
select
  o.store_id, s.store_name,
  date_trunc('day', o.placed_at) as sales_date,
  count(distinct o.id) as order_count,
  sum(o.total_amount) as gross_revenue,
  sum(o.discount_amount) as total_discount,
  avg(o.total_amount) as avg_order_value
from app.orders o
join app.stores s on s.id = o.store_id
where o.status not in ('cancelled') and o.is_deleted = false
group by o.store_id, s.store_name, date_trunc('day', o.placed_at);

create unique index uq_mv_daily_sales on reporting.mv_daily_sales(store_id, sales_date);

-- ---------------------------------------------------------------------
-- 9.4 Monthly sales rollup
-- ---------------------------------------------------------------------
create materialized view reporting.mv_monthly_sales as
select
  store_id, store_name,
  date_trunc('month', sales_date) as sales_month,
  sum(order_count) as order_count,
  sum(gross_revenue) as gross_revenue,
  sum(total_discount) as total_discount
from reporting.mv_daily_sales
group by store_id, store_name, date_trunc('month', sales_date);

create unique index uq_mv_monthly_sales on reporting.mv_monthly_sales(store_id, sales_month);

-- ---------------------------------------------------------------------
-- 9.5 Top products (rolling, computed live — cheap enough via index)
-- ---------------------------------------------------------------------
create or replace view reporting.v_top_products_30d as
select
  oi.product_id, p.name,
  sum(oi.quantity) as units_sold,
  sum(oi.line_total) as revenue
from app.order_items oi
join app.orders o on o.id = oi.order_id
join app.products p on p.id = oi.product_id
where o.placed_at >= now() - interval '30 days'
  and o.status not in ('cancelled')
group by oi.product_id, p.name
order by units_sold desc;

-- ---------------------------------------------------------------------
-- 9.6 Store performance dashboard
-- ---------------------------------------------------------------------
create or replace view reporting.v_store_performance as
select
  s.id as store_id, s.store_name,
  count(distinct o.id) filter (where o.placed_at >= now() - interval '30 days') as orders_30d,
  sum(o.total_amount) filter (where o.placed_at >= now() - interval '30 days') as revenue_30d,
  avg(extract(epoch from (d.delivered_at - o.placed_at)) / 60)
    filter (where d.delivered_at is not null and o.placed_at >= now() - interval '30 days') as avg_delivery_minutes
from app.stores s
left join app.orders o on o.store_id = s.id and o.is_deleted = false
left join app.delivery_orders d on d.order_id = o.id
group by s.id, s.store_name;

-- ---------------------------------------------------------------------
-- 9.7 Delivery partner performance
-- ---------------------------------------------------------------------
create or replace view reporting.v_delivery_partner_performance as
select
  dp.id as delivery_partner_id, up.full_name,
  dp.rating, dp.completed_deliveries, dp.total_earnings,
  count(d.id) filter (where d.assigned_at >= now() - interval '30 days') as deliveries_30d,
  avg(d.actual_minutes) filter (where d.assigned_at >= now() - interval '30 days') as avg_delivery_time_30d
from app.delivery_partners dp
join app.user_profiles up on up.id = dp.id
left join app.delivery_orders d on d.delivery_partner_id = dp.id and d.status = 'delivered'
group by dp.id, up.full_name, dp.rating, dp.completed_deliveries, dp.total_earnings;

-- ---------------------------------------------------------------------
-- 9.8 Supplier performance
-- ---------------------------------------------------------------------
create or replace view reporting.v_supplier_performance as
select
  sup.id as supplier_id, sup.supplier_name,
  count(po.id) as total_purchase_orders,
  sum(po.total_amount) as total_purchase_value,
  avg(extract(epoch from (po.received_date::timestamp - po.order_date::timestamp)) / 86400)
    filter (where po.received_date is not null) as avg_fulfillment_days,
  sup.rating
from app.suppliers sup
left join app.purchase_orders po on po.supplier_id = sup.id
group by sup.id, sup.supplier_name, sup.rating;

-- ---------------------------------------------------------------------
-- 9.9 Customer growth (new signups by day)
-- ---------------------------------------------------------------------
create or replace view reporting.v_customer_growth as
select date_trunc('day', c.created_at) as signup_date, count(*) as new_customers
from app.customers c
group by date_trunc('day', c.created_at)
order by signup_date;

-- ---------------------------------------------------------------------
-- 9.10 Employee performance overview
-- ---------------------------------------------------------------------
create or replace view reporting.v_employee_performance as
select
  e.id as employee_id, up.full_name, d.name as department, ds.title as designation,
  round(avg(pr.rating), 2) as avg_rating,
  count(*) filter (where a.status = 'present') as days_present_90d
from app.employees e
join app.user_profiles up on up.id = e.id
left join app.departments d on d.id = e.department_id
left join app.designations ds on ds.id = e.designation_id
left join app.employee_performance_reviews pr on pr.employee_id = e.id
left join app.employee_attendance a on a.employee_id = e.id and a.attendance_date >= current_date - 90
group by e.id, up.full_name, d.name, ds.title;

-- ---------------------------------------------------------------------
-- 9.11 Low stock dashboard view (wraps fn_low_stock_products)
-- ---------------------------------------------------------------------
create or replace view reporting.v_low_stock_alerts as
select w.name as warehouse_name, l.*
from app.fn_low_stock_products() l
join app.warehouses w on w.id = l.warehouse_id;

-- ---------------------------------------------------------------------
-- 9.12 Refresh helper for materialized views (call via cron / pg_cron)
-- ---------------------------------------------------------------------
create or replace function reporting.fn_refresh_sales_views()
returns void language plpgsql as $$
begin
  refresh materialized view concurrently reporting.mv_daily_sales;
  refresh materialized view concurrently reporting.mv_monthly_sales;
end;
$$;
-- Schedule (requires pg_cron extension, available on Supabase):
-- select cron.schedule('refresh-sales-views', '15 0 * * *',
--   $$select reporting.fn_refresh_sales_views();$$);
