-- =====================================================================
-- FILE: 18_analytics_functions.sql
-- Backs the super_admin-only Analytics/Reports page: sales over time
-- (bucketed by hour/day/week/month), top products, top customers, and
-- top delivery locations (geo-clustered by rounding lat/lng to ~111m
-- grid cells, since there's no predefined "neighborhood" entity in the
-- schema). Low stock reuses the existing reporting.v_low_stock_alerts
-- view — no new function needed there.
--
-- Every function checks the caller is super_admin itself (not just
-- relying on RLS on the underlying tables), consistent with
-- fn_create_staff_member's pattern — this is business-sensitive
-- aggregate data (revenue, customer spend) that shouldn't be reachable
-- by guessing the RPC name even if RLS on individual tables were ever
-- loosened later.
-- =====================================================================
set search_path = app, public;

create or replace function app.fn_require_super_admin()
returns void language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  if (select role from app.user_profiles where id = auth.uid()) is distinct from 'super_admin' then
    raise exception 'Only super_admin can access this';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Sales over time, bucketed by the requested granularity
-- ---------------------------------------------------------------------
create or replace function app.fn_sales_over_time(
  p_granularity text,      -- 'hour' | 'day' | 'week' | 'month'
  p_range_start timestamptz,
  p_range_end timestamptz
) returns table(bucket timestamptz, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  perform app.fn_require_super_admin();
  if p_granularity not in ('hour','day','week','month') then
    raise exception 'Invalid granularity: %', p_granularity;
  end if;

  return query
    select date_trunc(p_granularity, o.placed_at), count(*)::bigint, coalesce(sum(o.total_amount), 0)
    from app.orders o
    where o.placed_at between p_range_start and p_range_end
      and o.status <> 'cancelled' and o.is_deleted = false
    group by 1
    order by 1;
end;
$$;

-- ---------------------------------------------------------------------
-- Top products by revenue within a date range
-- ---------------------------------------------------------------------
create or replace function app.fn_top_products(
  p_range_start timestamptz, p_range_end timestamptz, p_limit int default 10
) returns table(product_id uuid, product_name text, units_sold bigint, revenue numeric)
language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  perform app.fn_require_super_admin();
  return query
    select oi.product_id, p.name, sum(oi.quantity)::bigint, sum(oi.line_total)
    from app.order_items oi
    join app.orders o on o.id = oi.order_id
    join app.products p on p.id = oi.product_id
    where o.placed_at between p_range_start and p_range_end
      and o.status <> 'cancelled' and o.is_deleted = false
    group by oi.product_id, p.name
    order by sum(oi.line_total) desc
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- Top customers by spend within a date range
-- ---------------------------------------------------------------------
create or replace function app.fn_top_customers(
  p_range_start timestamptz, p_range_end timestamptz, p_limit int default 10
) returns table(customer_id uuid, full_name text, phone text, order_count bigint, total_spent numeric)
language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  perform app.fn_require_super_admin();
  return query
    select o.customer_id, up.full_name, up.phone, count(*)::bigint, sum(o.total_amount)
    from app.orders o
    join app.user_profiles up on up.id = o.customer_id
    where o.placed_at between p_range_start and p_range_end
      and o.status <> 'cancelled' and o.is_deleted = false
    group by o.customer_id, up.full_name, up.phone
    order by sum(o.total_amount) desc
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- Top delivery locations, clustered by rounding lat/lng to 3 decimal
-- places (~111m grid cells at the equator, finer in practice this far
-- from it) — a simple, fast approximation of "nearest lat/lng" grouping
-- without needing a full spatial clustering algorithm.
-- ---------------------------------------------------------------------
create or replace function app.fn_top_locations(
  p_range_start timestamptz, p_range_end timestamptz, p_limit int default 10
) returns table(lat_bucket numeric, lng_bucket numeric, city text, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = app, pg_catalog as $$
begin
  perform app.fn_require_super_admin();
  return query
    select
      round(ca.latitude, 3), round(ca.longitude, 3),
      mode() within group (order by ca.city),
      count(*)::bigint, sum(o.total_amount)
    from app.orders o
    join app.customer_addresses ca on ca.id = o.delivery_address_id
    where o.placed_at between p_range_start and p_range_end
      and o.status <> 'cancelled' and o.is_deleted = false
    group by round(ca.latitude, 3), round(ca.longitude, 3)
    order by count(*) desc
    limit p_limit;
end;
$$;
