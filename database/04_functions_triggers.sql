-- =====================================================================
-- FILE: 04_functions_triggers.sql
-- PHASE 7: Triggers and Functions
-- Covers: updated_at maintenance, generic audit trigger, inventory
-- update on order placement/cancellation, order total calculation,
-- delivery assignment logic, payment functions, wallet functions,
-- loyalty point calculation, coupon validation.
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- 7.1 updated_at auto-maintenance (generic, attach to any table with
--     an updated_at column)
-- ---------------------------------------------------------------------
create or replace function app.fn_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in
    select table_schema, table_name from information_schema.columns
    where column_name = 'updated_at' and table_schema = 'app'
  loop
    execute format(
      'drop trigger if exists trg_set_updated_at on %I.%I;
       create trigger trg_set_updated_at before update on %I.%I
       for each row execute function app.fn_set_updated_at();',
      r.table_schema, r.table_name, r.table_schema, r.table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7.2 Generic audit trigger — writes INSERT/UPDATE/DELETE diffs to
--     audit.activity_log. Attach selectively to sensitive tables
--     (orders, payments, inventory, products, coupons, employees...).
-- ---------------------------------------------------------------------
create or replace function audit.fn_log_activity()
returns trigger language plpgsql security definer as $$
declare
  v_record_id uuid;
  v_actor uuid;
begin
  v_record_id := coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null);
  begin
    v_actor := auth.uid();
  exception when others then
    v_actor := null;
  end;

  insert into audit.activity_log (
    table_name, record_id, action, old_value, new_value,
    changed_by, ip_address, device_info
  ) values (
    tg_table_schema || '.' || tg_table_name,
    v_record_id,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end,
    v_actor,
    nullif(current_setting('app.current_ip', true), '')::inet,
    nullif(current_setting('app.current_device', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- Attach to key sensitive tables:
create trigger trg_audit_orders after insert or update or delete on app.orders
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_payments after insert or update or delete on app.payments
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_products after insert or update or delete on app.products
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_inventory after insert or update or delete on app.inventory
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_coupons after insert or update or delete on app.coupons
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_employees after insert or update or delete on app.employees
  for each row execute function audit.fn_log_activity();
create trigger trg_audit_customer_wallet after insert on app.customer_wallet_transactions
  for each row execute function audit.fn_log_activity();

-- ---------------------------------------------------------------------
-- 7.3 Inventory reservation & deduction on order lifecycle
-- ---------------------------------------------------------------------

-- Reserve stock when an order_item is inserted (order placed)
create or replace function app.fn_reserve_stock_on_order_item()
returns trigger language plpgsql as $$
declare
  v_warehouse_id uuid;
begin
  select w.id into v_warehouse_id
  from app.orders o
  join app.warehouses w on w.store_id = o.store_id
  where o.id = new.order_id
  limit 1;

  if v_warehouse_id is null then
    raise exception 'No warehouse found for order %', new.order_id;
  end if;

  update app.inventory
     set quantity_reserved = quantity_reserved + new.quantity,
         updated_at = now()
   where warehouse_id = v_warehouse_id
     and product_id = new.product_id
     and variant_id is not distinct from new.variant_id;

  if not found then
    raise exception 'No inventory row for product % in warehouse %', new.product_id, v_warehouse_id;
  end if;

  return new;
end;
$$;

create trigger trg_reserve_stock after insert on app.order_items
  for each row execute function app.fn_reserve_stock_on_order_item();

-- Deduct actual stock + log stock_movement when order status -> 'packed'
-- Release reservation when order is cancelled/returned.
create or replace function app.fn_handle_order_status_change()
returns trigger language plpgsql as $$
declare
  v_item record;
  v_warehouse_id uuid;
begin
  if new.status = old.status then
    return new;
  end if;

  insert into app.order_status_history(order_id, status, changed_by)
  values (new.id, new.status, auth.uid());

  select w.id into v_warehouse_id
  from app.warehouses w where w.store_id = new.store_id limit 1;

  if new.status = 'packed' then
    for v_item in select * from app.order_items where order_id = new.id loop
      update app.inventory
         set quantity_on_hand = quantity_on_hand - v_item.quantity,
             quantity_reserved = quantity_reserved - v_item.quantity,
             updated_at = now()
       where warehouse_id = v_warehouse_id
         and product_id = v_item.product_id
         and variant_id is not distinct from v_item.variant_id;

      insert into app.stock_movements(warehouse_id, product_id, variant_id, movement_type,
                                       quantity, reference_type, reference_id, created_by)
      values (v_warehouse_id, v_item.product_id, v_item.variant_id, 'sale_out',
              -v_item.quantity, 'order', new.id, auth.uid());
    end loop;

  elsif new.status in ('cancelled','returned') and old.status not in ('cancelled','returned') then
    for v_item in select * from app.order_items where order_id = new.id loop
      -- release reservation if it was still reserved (pre-packed cancellation)
      if old.status in ('pending','accepted','packing') then
        update app.inventory
           set quantity_reserved = greatest(quantity_reserved - v_item.quantity, 0),
               updated_at = now()
         where warehouse_id = v_warehouse_id
           and product_id = v_item.product_id
           and variant_id is not distinct from v_item.variant_id;
      else
        -- stock already deducted (post-pack); restock on return
        update app.inventory
           set quantity_on_hand = quantity_on_hand + v_item.quantity,
               updated_at = now()
         where warehouse_id = v_warehouse_id
           and product_id = v_item.product_id
           and variant_id is not distinct from v_item.variant_id;

        insert into app.stock_movements(warehouse_id, product_id, variant_id, movement_type,
                                         quantity, reference_type, reference_id, created_by)
        values (v_warehouse_id, v_item.product_id, v_item.variant_id, 'return_in',
                v_item.quantity, 'order', new.id, auth.uid());
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger trg_order_status_change before update of status on app.orders
  for each row execute function app.fn_handle_order_status_change();

-- ---------------------------------------------------------------------
-- 7.4 Low stock alert helper (queried by a scheduled job / dashboard,
--     not a trigger — exposed as a function for Supabase RPC / cron)
-- ---------------------------------------------------------------------
create or replace function app.fn_low_stock_products(p_warehouse_id uuid default null)
returns table(warehouse_id uuid, product_id uuid, product_name text,
              quantity_on_hand int, reorder_level int)
language sql stable as $$
  select i.warehouse_id, i.product_id, p.name, i.quantity_on_hand, i.reorder_level
  from app.inventory i
  join app.products p on p.id = i.product_id
  where i.quantity_on_hand <= i.reorder_level
    and (p_warehouse_id is null or i.warehouse_id = p_warehouse_id);
$$;

-- ---------------------------------------------------------------------
-- 7.5 Order processing: compute totals atomically (RPC callable from
--     the app instead of trusting client-computed totals)
-- ---------------------------------------------------------------------
create or replace function app.fn_place_order(
  p_customer_id uuid,
  p_store_id uuid,
  p_delivery_address_id uuid,
  p_items jsonb,          -- [{product_id, variant_id, quantity}]
  p_coupon_code text default null,
  p_use_wallet boolean default false,
  p_loyalty_points_to_use int default 0
) returns uuid
language plpgsql security definer as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_order_number text;
  v_item jsonb;
  v_product app.products%rowtype;
  v_subtotal numeric(12,2) := 0;
  v_gst numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_delivery_charge numeric(10,2) := 25.00;
  v_total numeric(12,2);
  v_coupon app.coupons%rowtype;
  v_variant_id uuid;
  v_unit_price numeric(10,2);
begin
  v_order_number := 'ORD' || to_char(now(),'YYYYMMDD') || substr(v_order_id::text, 1, 8);

  -- validate coupon first (see fn_validate_coupon below)
  if p_coupon_code is not null then
    select * into v_coupon from app.fn_validate_coupon(p_coupon_code, p_customer_id, 0);
  end if;

  -- create the order shell first with zero totals, items trigger reservation
  insert into app.orders (id, order_number, customer_id, store_id, delivery_address_id,
                           status, subtotal, discount_amount, delivery_charge, gst_amount,
                           total_amount)
  values (v_order_id, v_order_number, p_customer_id, p_store_id, p_delivery_address_id,
          'pending', 0, 0, v_delivery_charge, 0, v_delivery_charge);

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from app.products where id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Invalid product %', v_item->>'product_id';
    end if;

    -- resolve variant: use the one supplied by the client, or fall back to
    -- the product's default variant (if it has variants at all)
    v_variant_id := nullif(v_item->>'variant_id','')::uuid;
    if v_variant_id is null then
      select id into v_variant_id from app.product_variants
       where product_id = v_product.id and is_default = true and is_deleted = false
       limit 1;
    end if;

    v_unit_price := coalesce(
      (select selling_price from app.product_variants where id = v_variant_id),
      v_product.selling_price);

    insert into app.order_items (order_id, product_id, variant_id, product_name_snapshot,
                                  unit_price, quantity)
    values (v_order_id, v_product.id, v_variant_id, v_product.name,
            v_unit_price, (v_item->>'quantity')::int);

    v_subtotal := v_subtotal + v_unit_price * (v_item->>'quantity')::int;
    v_gst := v_gst + (v_unit_price * (v_item->>'quantity')::int * v_product.gst_percent / 100);
  end loop;

  if p_coupon_code is not null then
    v_discount := app.fn_calculate_coupon_discount(v_coupon.id, v_subtotal);
  end if;

  v_total := v_subtotal - v_discount + v_delivery_charge + v_gst;

  update app.orders
     set subtotal = v_subtotal, gst_amount = v_gst, discount_amount = v_discount,
         total_amount = v_total, coupon_id = case when p_coupon_code is not null then v_coupon.id else null end
   where id = v_order_id;

  if p_coupon_code is not null then
    insert into app.coupon_redemptions(coupon_id, customer_id, order_id, discount_applied)
    values (v_coupon.id, p_customer_id, v_order_id, v_discount);
    update app.coupons set used_count = used_count + 1 where id = v_coupon.id;
  end if;

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7.6 Delivery assignment logic — nearest available partner to the
--     order's store, within a reasonable radius, lowest current load
-- ---------------------------------------------------------------------
create or replace function app.fn_assign_delivery_partner(p_order_id uuid)
returns uuid language plpgsql security definer as $$
declare
  v_store_geog geography;
  v_partner_id uuid;
  v_delivery_order_id uuid;
begin
  select geog into v_store_geog from app.stores s
  join app.orders o on o.store_id = s.id where o.id = p_order_id;

  select dp.id into v_partner_id
  from app.delivery_partners dp
  left join app.delivery_orders do2
    on do2.delivery_partner_id = dp.id and do2.status not in ('delivered','failed')
  where dp.is_available = true
    and dp.status = 'active'
    and dp.current_geog is not null
    and ST_DWithin(dp.current_geog, v_store_geog, 8000) -- 8 km radius
  group by dp.id, dp.current_geog
  order by count(do2.id) asc, ST_Distance(dp.current_geog, v_store_geog) asc
  limit 1;

  if v_partner_id is null then
    raise notice 'No available delivery partner found near store for order %', p_order_id;
    return null;
  end if;

  insert into app.delivery_orders (order_id, delivery_partner_id, status, otp)
  values (p_order_id, v_partner_id, 'assigned', lpad(floor(random()*10000)::text, 4, '0'))
  returning id into v_delivery_order_id;

  update app.delivery_partners set is_available = false where id = v_partner_id;

  return v_delivery_order_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7.7 Payment functions
-- ---------------------------------------------------------------------
create or replace function app.fn_record_payment(
  p_order_id uuid, p_method app.payment_method, p_amount numeric,
  p_gateway_name text default null, p_gateway_txn_id text default null,
  p_gateway_response jsonb default null
) returns uuid language plpgsql security definer as $$
declare v_payment_id uuid;
begin
  insert into app.payments (order_id, payment_method, amount, status,
                             gateway_name, gateway_txn_id, gateway_response, paid_at)
  values (p_order_id, p_method, p_amount, 'success',
          p_gateway_name, p_gateway_txn_id, p_gateway_response, now())
  returning id into v_payment_id;

  -- award loyalty points: 1 point per ₹100 spent
  perform app.fn_award_loyalty_points(
    (select customer_id from app.orders where id = p_order_id),
    floor(p_amount / 100)::int, 'order', p_order_id
  );

  return v_payment_id;
end;
$$;

create or replace function app.fn_process_refund(
  p_payment_id uuid, p_amount numeric, p_reason text, p_refund_to text default 'source'
) returns uuid language plpgsql security definer as $$
declare
  v_refund_id uuid;
  v_customer_id uuid;
begin
  insert into app.refunds (payment_id, amount, reason, status, refunded_to, processed_at)
  values (p_payment_id, p_amount, p_reason, 'success', p_refund_to, now())
  returning id into v_refund_id;

  if p_refund_to = 'wallet' then
    select o.customer_id into v_customer_id
    from app.payments pay join app.orders o on o.id = pay.order_id
    where pay.id = p_payment_id;

    perform app.fn_wallet_credit(v_customer_id, p_amount, 'refund', v_refund_id, 'Refund credited to wallet');
  end if;

  return v_refund_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 7.8 Customer wallet functions
-- ---------------------------------------------------------------------
create or replace function app.fn_wallet_credit(
  p_customer_id uuid, p_amount numeric, p_reference_type text,
  p_reference_id uuid, p_notes text default null
) returns numeric language plpgsql security definer as $$
declare v_new_balance numeric;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  update app.customers
     set wallet_balance = wallet_balance + p_amount, updated_at = now()
   where id = p_customer_id
   returning wallet_balance into v_new_balance;

  insert into app.customer_wallet_transactions
    (customer_id, entry_type, amount, balance_after, reference_type, reference_id, notes)
  values (p_customer_id, 'credit', p_amount, v_new_balance, p_reference_type, p_reference_id, p_notes);

  return v_new_balance;
end;
$$;

create or replace function app.fn_wallet_debit(
  p_customer_id uuid, p_amount numeric, p_reference_type text,
  p_reference_id uuid, p_notes text default null
) returns numeric language plpgsql security definer as $$
declare v_new_balance numeric;
begin
  if p_amount <= 0 then
    raise exception 'Debit amount must be positive';
  end if;

  update app.customers
     set wallet_balance = wallet_balance - p_amount, updated_at = now()
   where id = p_customer_id and wallet_balance >= p_amount
   returning wallet_balance into v_new_balance;

  if not found then
    raise exception 'Insufficient wallet balance for customer %', p_customer_id;
  end if;

  insert into app.customer_wallet_transactions
    (customer_id, entry_type, amount, balance_after, reference_type, reference_id, notes)
  values (p_customer_id, 'debit', p_amount, v_new_balance, p_reference_type, p_reference_id, p_notes);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- 7.9 Loyalty point calculation functions
-- ---------------------------------------------------------------------
create or replace function app.fn_award_loyalty_points(
  p_customer_id uuid, p_points int, p_reference_type text, p_reference_id uuid
) returns int language plpgsql security definer as $$
declare v_new_balance int;
begin
  if p_points <= 0 then
    return (select loyalty_points from app.customers where id = p_customer_id);
  end if;

  update app.customers
     set loyalty_points = loyalty_points + p_points, updated_at = now()
   where id = p_customer_id
   returning loyalty_points into v_new_balance;

  insert into app.loyalty_point_transactions
    (customer_id, entry_type, points, balance_after, reference_type, reference_id)
  values (p_customer_id, 'earned', p_points, v_new_balance, p_reference_type, p_reference_id);

  return v_new_balance;
end;
$$;

create or replace function app.fn_redeem_loyalty_points(
  p_customer_id uuid, p_points int, p_reference_type text, p_reference_id uuid
) returns int language plpgsql security definer as $$
declare v_new_balance int;
begin
  update app.customers
     set loyalty_points = loyalty_points - p_points, updated_at = now()
   where id = p_customer_id and loyalty_points >= p_points
   returning loyalty_points into v_new_balance;

  if not found then
    raise exception 'Insufficient loyalty points for customer %', p_customer_id;
  end if;

  insert into app.loyalty_point_transactions
    (customer_id, entry_type, points, balance_after, reference_type, reference_id)
  values (p_customer_id, 'redeemed', -p_points, v_new_balance, p_reference_type, p_reference_id);

  return v_new_balance;
end;
$$;

-- ---------------------------------------------------------------------
-- 7.10 Coupon validation & discount calculation functions
-- ---------------------------------------------------------------------
create or replace function app.fn_validate_coupon(
  p_code text, p_customer_id uuid, p_order_subtotal numeric
) returns app.coupons language plpgsql stable as $$
declare
  v_coupon app.coupons%rowtype;
  v_customer_usage int;
begin
  select * into v_coupon from app.coupons
   where code = p_code and is_active = true;

  if not found then
    raise exception 'Coupon % not found or inactive', p_code;
  end if;

  if now() not between v_coupon.valid_from and v_coupon.valid_until then
    raise exception 'Coupon % is not currently valid', p_code;
  end if;

  if v_coupon.usage_limit_total is not null and v_coupon.used_count >= v_coupon.usage_limit_total then
    raise exception 'Coupon % has reached its usage limit', p_code;
  end if;

  select count(*) into v_customer_usage
  from app.coupon_redemptions
  where coupon_id = v_coupon.id and customer_id = p_customer_id;

  if v_customer_usage >= v_coupon.usage_limit_per_customer then
    raise exception 'Coupon % already used by this customer', p_code;
  end if;

  if p_order_subtotal > 0 and p_order_subtotal < v_coupon.min_order_value then
    raise exception 'Order does not meet minimum value of % for coupon %', v_coupon.min_order_value, p_code;
  end if;

  return v_coupon;
end;
$$;

create or replace function app.fn_calculate_coupon_discount(
  p_coupon_id uuid, p_subtotal numeric
) returns numeric language plpgsql stable as $$
declare
  v_coupon app.coupons%rowtype;
  v_discount numeric;
begin
  select * into v_coupon from app.coupons where id = p_coupon_id;

  if v_coupon.discount_type = 'flat' then
    v_discount := v_coupon.discount_value;
  else
    v_discount := p_subtotal * v_coupon.discount_value / 100;
    if v_coupon.max_discount_amount is not null then
      v_discount := least(v_discount, v_coupon.max_discount_amount);
    end if;
  end if;

  return least(v_discount, p_subtotal);
end;
$$;
