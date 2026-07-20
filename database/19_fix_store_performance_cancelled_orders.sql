-- =====================================================================
-- FILE: 19_fix_store_performance_cancelled_orders.sql
-- reporting.v_store_performance was not excluding cancelled orders from
-- orders_30d/revenue_30d, unlike every other revenue-bearing view
-- (mv_daily_sales, v_top_products_30d). This inflated the Dashboard's
-- KPI cards and the store performance table. Fixed to match the same
-- "exclude cancelled" convention used everywhere else.
-- =====================================================================
set search_path = app, public;

create or replace view reporting.v_store_performance as
select
  s.id as store_id, s.store_name,
  count(distinct o.id) filter (where o.placed_at >= now() - interval '30 days' and o.status <> 'cancelled') as orders_30d,
  sum(o.total_amount) filter (where o.placed_at >= now() - interval '30 days' and o.status <> 'cancelled') as revenue_30d,
  avg(extract(epoch from (d.delivered_at - o.placed_at)) / 60)
    filter (where d.delivered_at is not null and o.placed_at >= now() - interval '30 days' and o.status <> 'cancelled') as avg_delivery_minutes
from app.stores s
left join app.orders o on o.store_id = s.id and o.is_deleted = false
left join app.delivery_orders d on d.order_id = o.id
group by s.id, s.store_name;
