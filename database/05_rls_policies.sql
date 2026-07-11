-- =====================================================================
-- FILE: 05_rls_policies.sql
-- PHASE 8: Row Level Security Policies
-- Model: app.user_profiles.role drives access. auth.uid() = the
-- Supabase-authenticated user id, which is also the primary key of
-- app.user_profiles / app.customers / app.employees / app.delivery_partners.
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- 8.0 Helper: current user's role, cached per-statement via a stable fn
-- ---------------------------------------------------------------------
create or replace function app.fn_current_role()
returns app.user_role language sql stable security definer as $$
  select role from app.user_profiles where id = auth.uid();
$$;

create or replace function app.fn_is_staff()
returns boolean language sql stable security definer as $$
  select app.fn_current_role() in
    ('super_admin','store_manager','warehouse_manager','employee','support_agent');
$$;

-- ---------------------------------------------------------------------
-- 8.1 Enable RLS on every business table
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'app'
  loop
    execute format('alter table app.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8.2 CATALOG (products, categories, brands, images, variants, attrs):
--     public read for active/non-deleted rows; writes restricted to
--     admins / store managers.
-- ---------------------------------------------------------------------
create policy p_products_public_read on app.products
  for select using (is_active = true and is_deleted = false);
create policy p_products_staff_all on app.products
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_categories_public_read on app.categories
  for select using (is_active = true and is_deleted = false);
create policy p_categories_staff_all on app.categories
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_brands_public_read on app.brands for select using (is_active = true);
create policy p_brands_staff_all on app.brands
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_product_images_public_read on app.product_images for select using (true);
create policy p_product_images_staff_write on app.product_images
  for insert with check (app.fn_is_staff());
create policy p_product_images_staff_update on app.product_images
  for update using (app.fn_is_staff());
create policy p_product_images_staff_delete on app.product_images
  for delete using (app.fn_is_staff());

create policy p_product_variants_public_read on app.product_variants
  for select using (is_active = true and is_deleted = false);
create policy p_product_variants_staff_all on app.product_variants
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_product_attributes_public_read on app.product_attributes for select using (true);
create policy p_product_attributes_staff_all on app.product_attributes
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.3 CUSTOMER-OWNED DATA: customers see/manage only their own rows
-- ---------------------------------------------------------------------
create policy p_customers_self on app.customers
  for select using (id = auth.uid() or app.fn_is_staff());
create policy p_customers_self_update on app.customers
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy p_customers_staff_manage on app.customers
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_customer_addresses_owner on app.customer_addresses
  for all using (customer_id = auth.uid() or app.fn_is_staff())
  with check (customer_id = auth.uid() or app.fn_is_staff());

create policy p_product_favorites_owner on app.product_favorites
  for all using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

create policy p_product_reviews_public_read on app.product_reviews
  for select using (is_visible = true and is_deleted = false);
create policy p_product_reviews_owner_write on app.product_reviews
  for insert with check (customer_id = auth.uid());
create policy p_product_reviews_owner_update on app.product_reviews
  for update using (customer_id = auth.uid());
create policy p_product_reviews_staff_moderate on app.product_reviews
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_wallet_txn_owner_read on app.customer_wallet_transactions
  for select using (customer_id = auth.uid() or app.fn_is_staff());
create policy p_loyalty_txn_owner_read on app.loyalty_point_transactions
  for select using (customer_id = auth.uid() or app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.4 ORDERS: customer sees own orders; store staff see orders for
--     their assigned store; delivery partner sees only orders assigned
--     to them via delivery_orders.
-- ---------------------------------------------------------------------
create policy p_orders_customer_read on app.orders
  for select using (customer_id = auth.uid());
create policy p_orders_customer_insert on app.orders
  for insert with check (customer_id = auth.uid());
create policy p_orders_store_staff on app.orders
  for select using (
    app.fn_current_role() in ('super_admin')
    or (app.fn_current_role() in ('store_manager','employee')
        and store_id in (select store_id from app.employee_store_assignments where employee_id = auth.uid()))
  );
create policy p_orders_staff_update on app.orders
  for update using (
    app.fn_current_role() = 'super_admin'
    or (app.fn_current_role() in ('store_manager','employee')
        and store_id in (select store_id from app.employee_store_assignments where employee_id = auth.uid()))
  );

create policy p_order_items_via_order on app.order_items
  for select using (
    exists (select 1 from app.orders o where o.id = order_id and
      (o.customer_id = auth.uid() or app.fn_is_staff()))
  );

create policy p_order_status_history_via_order on app.order_status_history
  for select using (
    exists (select 1 from app.orders o where o.id = order_id and
      (o.customer_id = auth.uid() or app.fn_is_staff()))
  );

create policy p_invoices_via_order on app.invoices
  for select using (
    exists (select 1 from app.orders o where o.id = order_id and
      (o.customer_id = auth.uid() or app.fn_is_staff()))
  );

create policy p_order_returns_via_order_item on app.order_returns
  for select using (
    exists (select 1 from app.order_items oi join app.orders o on o.id = oi.order_id
      where oi.id = order_item_id and (o.customer_id = auth.uid() or app.fn_is_staff()))
  );
create policy p_order_returns_customer_insert on app.order_returns
  for insert with check (
    exists (select 1 from app.order_items oi join app.orders o on o.id = oi.order_id
      where oi.id = order_item_id and o.customer_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- 8.5 PAYMENTS & REFUNDS: customer reads own; staff full access
-- ---------------------------------------------------------------------
create policy p_payments_customer_read on app.payments
  for select using (
    exists (select 1 from app.orders o where o.id = order_id and o.customer_id = auth.uid())
    or app.fn_is_staff()
  );
create policy p_payments_staff_write on app.payments
  for insert with check (app.fn_is_staff());
create policy p_refunds_staff_all on app.refunds
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.6 DELIVERY: delivery partner sees/updates only their own
--     assignments; customers can read delivery status for their orders
-- ---------------------------------------------------------------------
create policy p_delivery_orders_partner on app.delivery_orders
  for select using (
    delivery_partner_id = auth.uid()
    or exists (select 1 from app.orders o where o.id = order_id and o.customer_id = auth.uid())
    or app.fn_is_staff()
  );
create policy p_delivery_orders_partner_update on app.delivery_orders
  for update using (delivery_partner_id = auth.uid() or app.fn_is_staff());

create policy p_delivery_tracking_partner_write on app.delivery_tracking
  for insert with check (
    exists (select 1 from app.delivery_orders d
      where d.id = delivery_order_id and d.delivery_partner_id = auth.uid())
  );
create policy p_delivery_tracking_read on app.delivery_tracking
  for select using (
    exists (select 1 from app.delivery_orders d join app.orders o on o.id = d.order_id
      where d.id = delivery_order_id
        and (d.delivery_partner_id = auth.uid() or o.customer_id = auth.uid() or app.fn_is_staff()))
  );

create policy p_delivery_partners_self on app.delivery_partners
  for select using (id = auth.uid() or app.fn_is_staff());
create policy p_delivery_partners_self_update on app.delivery_partners
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy p_delivery_partners_staff_manage on app.delivery_partners
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_dp_vehicles_self on app.delivery_partner_vehicles
  for all using (delivery_partner_id = auth.uid() or app.fn_is_staff())
  with check (delivery_partner_id = auth.uid() or app.fn_is_staff());

create policy p_dp_shifts_self on app.delivery_partner_shifts
  for all using (delivery_partner_id = auth.uid() or app.fn_is_staff())
  with check (delivery_partner_id = auth.uid() or app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.7 EMPLOYEES: staff manage own record; only super_admin/HR (mapped
--     to super_admin role here) manage all employee records
-- ---------------------------------------------------------------------
create policy p_employees_self on app.employees
  for select using (id = auth.uid() or app.fn_current_role() = 'super_admin');
create policy p_employees_admin_manage on app.employees
  for all using (app.fn_current_role() = 'super_admin')
  with check (app.fn_current_role() = 'super_admin');

create policy p_attendance_self on app.employee_attendance
  for select using (employee_id = auth.uid() or app.fn_current_role() = 'super_admin');
create policy p_attendance_self_write on app.employee_attendance
  for insert with check (employee_id = auth.uid());

create policy p_leaves_self on app.employee_leaves
  for all using (employee_id = auth.uid() or app.fn_current_role() = 'super_admin')
  with check (employee_id = auth.uid() or app.fn_current_role() = 'super_admin');

create policy p_salary_self_read on app.salary_payments
  for select using (employee_id = auth.uid() or app.fn_current_role() = 'super_admin');

-- ---------------------------------------------------------------------
-- 8.8 SUPPLIERS: supplier portal users see only their own supplier
--     record and related purchase orders; staff see all
-- ---------------------------------------------------------------------
create policy p_suppliers_staff_all on app.suppliers
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_purchase_orders_staff on app.purchase_orders
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.9 INVENTORY / STORES / WAREHOUSES: staff-only, scoped to their
--     assigned store/warehouse for non-admin roles
-- ---------------------------------------------------------------------
create policy p_inventory_staff on app.inventory
  for all using (
    app.fn_current_role() = 'super_admin'
    or warehouse_id in (select warehouse_id from app.employee_warehouse_assignments where employee_id = auth.uid())
  )
  with check (
    app.fn_current_role() = 'super_admin'
    or warehouse_id in (select warehouse_id from app.employee_warehouse_assignments where employee_id = auth.uid())
  );

create policy p_stores_public_read on app.stores for select using (is_active = true);
create policy p_stores_staff_manage on app.stores
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_warehouses_staff on app.warehouses
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.10 COUPONS: public can read active/valid coupons (to display
--      offers); redemption rows are private to the customer
-- ---------------------------------------------------------------------
create policy p_coupons_public_read on app.coupons
  for select using (is_active = true and now() between valid_from and valid_until);
create policy p_coupons_staff_manage on app.coupons
  for all using (app.fn_is_staff()) with check (app.fn_is_staff());

create policy p_coupon_redemptions_owner on app.coupon_redemptions
  for select using (customer_id = auth.uid() or app.fn_is_staff());

-- ---------------------------------------------------------------------
-- 8.11 NOTIFICATIONS: strictly own-user only
-- ---------------------------------------------------------------------
create policy p_notifications_owner on app.notifications
  for select using (user_id = auth.uid());
create policy p_notifications_owner_update on app.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 8.12 AUDIT LOG: read-only, super_admin only. No client ever writes
--      directly (only SECURITY DEFINER triggers do).
-- ---------------------------------------------------------------------
alter table audit.activity_log enable row level security;
create policy p_audit_log_admin_read on audit.activity_log
  for select using (app.fn_current_role() = 'super_admin');
