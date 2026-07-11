-- =====================================================================
-- FILE: 11_demo_data_part3.sql
-- Generates ~100 historical orders using the real fn_place_order /
-- fn_record_payment RPCs (so totals, stock deduction, and loyalty
-- points all go through the actual business logic), then backdates
-- timestamps to spread them realistically across the last 60 days.
-- Each order is wrapped in its own exception handler so one bad
-- random pick can't abort the whole batch.
-- =====================================================================
set search_path = app, public;

do $$
declare
  v_customer_ids uuid[];
  v_store_ids uuid[];
  v_partner_ids uuid[];
  v_customer_id uuid;
  v_store_id uuid;
  v_address_id uuid;
  v_items jsonb;
  v_order_id uuid;
  v_status text;
  v_roll numeric;
  v_placed_at timestamptz;
  v_payment_id uuid;
  v_created_count int := 0;
  i int;
  j int;
  v_num_items int;
begin
  select array_agg(id) into v_customer_ids from app.customers;
  select array_agg(id) into v_store_ids from app.stores where is_active = true;
  select array_agg(id) into v_partner_ids from app.delivery_partners;

  for i in 1..110 loop
    begin
      v_customer_id := v_customer_ids[1 + floor(random() * array_length(v_customer_ids, 1))];
      v_store_id := v_store_ids[1 + floor(random() * array_length(v_store_ids, 1))];

      select id into v_address_id from app.customer_addresses
        where customer_id = v_customer_id and is_deleted = false limit 1;
      if v_address_id is null then continue; end if;

      -- 1-4 random distinct products as order items
      v_num_items := 1 + floor(random() * 4)::int;
      select jsonb_agg(jsonb_build_object('product_id', pid, 'quantity', 1 + floor(random()*3)::int))
      into v_items
      from (select id as pid from app.products order by random() limit v_num_items) sub;

      v_order_id := app.fn_place_order(v_customer_id, v_store_id, v_address_id, v_items, null);

      -- weighted random final status
      v_roll := random();
      v_status := case
        when v_roll < 0.60 then 'delivered'
        when v_roll < 0.70 then 'cancelled'
        when v_roll < 0.78 then 'out_for_delivery'
        when v_roll < 0.85 then 'packed'
        when v_roll < 0.90 then 'packing'
        when v_roll < 0.95 then 'accepted'
        else 'pending'
      end;

      -- backdate: completed orders spread over last 60 days, in-progress
      -- ones look "current" (last 0-2 days)
      if v_status in ('delivered', 'cancelled') then
        v_placed_at := now() - (floor(random()*60)::text || ' days')::interval
                             - (floor(random()*24)::text || ' hours')::interval;
      else
        v_placed_at := now() - (floor(random()*2)::text || ' days')::interval
                             - (floor(random()*24)::text || ' hours')::interval;
      end if;

      if v_status = 'cancelled' then
        update app.orders set status = 'cancelled' where id = v_order_id;
      else
        -- reach 'packed' first (this is what actually deducts stock)
        update app.orders set status = 'packed' where id = v_order_id;
        if v_status <> 'packed' then
          update app.orders set status = v_status::app.order_status where id = v_order_id;
        end if;

        -- prepaid for anything at packing stage or beyond
        v_payment_id := app.fn_record_payment(
          v_order_id, (array['upi','cash','wallet','debit_card'])[1+floor(random()*4)::int]::app.payment_method,
          (select total_amount from app.orders where id = v_order_id)
        );
        update app.payments set paid_at = v_placed_at + interval '3 minutes', created_at = v_placed_at + interval '3 minutes'
          where id = v_payment_id;

        if v_status = 'delivered' and v_partner_ids is not null and array_length(v_partner_ids,1) > 0 then
          insert into app.delivery_orders (order_id, delivery_partner_id, status, distance_km, estimated_minutes, actual_minutes, assigned_at, picked_up_at, delivered_at)
          values (
            v_order_id, v_partner_ids[1 + floor(random()*array_length(v_partner_ids,1))],
            'delivered', round((0.5 + random()*5)::numeric,1), 15 + floor(random()*20)::int, 15 + floor(random()*25)::int,
            v_placed_at + interval '5 minutes', v_placed_at + interval '15 minutes', v_placed_at + interval '35 minutes'
          );
          update app.delivery_partners set completed_deliveries = completed_deliveries + 1
            where id = v_partner_ids[1];
        elsif v_status = 'out_for_delivery' and v_partner_ids is not null and array_length(v_partner_ids,1) > 0 then
          insert into app.delivery_orders (order_id, delivery_partner_id, status, assigned_at, picked_up_at)
          values (v_order_id, v_partner_ids[1 + floor(random()*array_length(v_partner_ids,1))],
                  'en_route_to_customer', v_placed_at + interval '5 minutes', v_placed_at + interval '15 minutes');
        end if;
      end if;

      -- backdate the order itself last, after all status-trigger side effects
      update app.orders set placed_at = v_placed_at, created_at = v_placed_at where id = v_order_id;

      v_created_count := v_created_count + 1;
    exception when others then
      raise notice 'Skipped one dummy order (%): %', i, sqlerrm;
    end;
  end loop;

  raise notice 'Created % demo orders', v_created_count;
end $$;
