-- =====================================================================
-- FILE: 08_rls_gaps_and_function_hardening.sql
-- Applied directly to the live Supabase project after initial rollout,
-- based on findings from Supabase's built-in security/performance
-- advisors (Supabase:get_advisors). Two fixes:
--
--   A) ~26 tables had RLS enabled but zero policies (default-deny is
--      safe, but explicit policies are required for legitimate access
--      and are clearer than relying on the default).
--   B) Every SECURITY DEFINER / plpgsql function had a mutable
--      search_path — pinned to prevent search_path hijacking.
--
-- A follow-up pass (not a separate file — applied inline via a DO
-- block, see bottom of this file) also rewrote every RLS policy that
-- called auth.uid() / app.fn_is_staff() / app.fn_current_role()
-- directly, wrapping them as `(select auth.uid())` etc. Postgres then
-- evaluates the call once per query instead of once per row — this is
-- the standard Supabase RLS performance fix, confirmed via the
-- performance advisor (auth_rls_initplan dropped from 55 -> 8, with
-- the remaining 8 belonging to pre-existing, unrelated tables in the
-- `public` schema — profiles/addresses/orders/order_items/wishlists —
-- that were not touched, since they predate this deployment and
-- weren't part of this schema).
-- =====================================================================
set search_path = app, public;

-- ---------------------------------------------------------------------
-- A) Missing RLS policies
-- ---------------------------------------------------------------------
create policy p_user_profiles_self on app.user_profiles
  for select using (id = (select auth.uid()) or (select app.fn_is_staff()));
create policy p_user_profiles_self_update on app.user_profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy p_combo_offers_public_read on app.combo_offers
  for select using (is_active = true);
create policy p_combo_offers_staff_manage on app.combo_offers
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create policy p_combo_offer_products_public_read on app.combo_offer_products
  for select using (true);
create policy p_combo_offer_products_staff_manage on app.combo_offer_products
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create policy p_flash_sales_public_read on app.flash_sales
  for select using (is_active = true);
create policy p_flash_sales_staff_manage on app.flash_sales
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create policy p_flash_sale_products_public_read on app.flash_sale_products
  for select using (true);
create policy p_flash_sale_products_staff_manage on app.flash_sale_products
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create policy p_happy_hours_public_read on app.happy_hours
  for select using (is_active = true);
create policy p_happy_hours_staff_manage on app.happy_hours
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create policy p_damaged_stock_staff on app.damaged_stock
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_inventory_batches_staff on app.inventory_batches
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_inventory_transfers_staff on app.inventory_transfers
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_inventory_transfer_items_staff on app.inventory_transfer_items
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_stock_movements_staff on app.stock_movements
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_purchase_order_items_staff on app.purchase_order_items
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_supplier_ledger_staff on app.supplier_ledger
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_supplier_payments_staff on app.supplier_payments
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_supplier_products_staff on app.supplier_products
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_notification_templates_staff on app.notification_templates
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_roles_permissions_staff on app.roles_permissions
  for select using ((select app.fn_is_staff()));
create policy p_roles_permissions_admin_manage on app.roles_permissions
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_departments_staff_read on app.departments
  for select using ((select app.fn_is_staff()));
create policy p_departments_admin_manage on app.departments
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_designations_staff_read on app.designations
  for select using ((select app.fn_is_staff()));
create policy p_designations_admin_manage on app.designations
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_employee_performance_reviews_self on app.employee_performance_reviews
  for select using (employee_id = (select auth.uid()) or (select app.fn_current_role()) = 'super_admin');
create policy p_employee_performance_reviews_admin_write on app.employee_performance_reviews
  for insert with check ((select app.fn_current_role()) = 'super_admin');

create policy p_employee_shifts_self on app.employee_shifts
  for select using (employee_id = (select auth.uid()) or (select app.fn_current_role()) = 'super_admin');
create policy p_employee_shifts_admin_manage on app.employee_shifts
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_employee_store_assignments_self on app.employee_store_assignments
  for select using (employee_id = (select auth.uid()) or (select app.fn_current_role()) = 'super_admin');
create policy p_employee_store_assignments_admin_manage on app.employee_store_assignments
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_employee_warehouse_assignments_self on app.employee_warehouse_assignments
  for select using (employee_id = (select auth.uid()) or (select app.fn_current_role()) = 'super_admin');
create policy p_employee_warehouse_assignments_admin_manage on app.employee_warehouse_assignments
  for all using ((select app.fn_current_role()) = 'super_admin')
  with check ((select app.fn_current_role()) = 'super_admin');

create policy p_order_cancellations_via_order on app.order_cancellations
  for select using (
    exists (select 1 from app.orders o where o.id = order_id and
      (o.customer_id = (select auth.uid()) or (select app.fn_is_staff())))
  );
create policy p_order_cancellations_customer_insert on app.order_cancellations
  for insert with check (
    exists (select 1 from app.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy p_order_notes_staff_all on app.order_notes
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));
create policy p_order_notes_customer_read_external on app.order_notes
  for select using (
    is_internal = false and
    exists (select 1 from app.orders o where o.id = order_id and o.customer_id = (select auth.uid()))
  );

create policy p_delivery_photos_read on app.delivery_photos
  for select using (
    exists (select 1 from app.delivery_orders d join app.orders o on o.id = d.order_id
      where d.id = delivery_order_id
        and (d.delivery_partner_id = (select auth.uid()) or o.customer_id = (select auth.uid()) or (select app.fn_is_staff())))
  );
create policy p_delivery_photos_partner_write on app.delivery_photos
  for insert with check (
    exists (select 1 from app.delivery_orders d
      where d.id = delivery_order_id and d.delivery_partner_id = (select auth.uid()))
  );

create policy p_referral_offers_parties on app.referral_offers
  for select using (referrer_id = (select auth.uid()) or referee_id = (select auth.uid()) or (select app.fn_is_staff()));
create policy p_referral_offers_staff_manage on app.referral_offers
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

-- ---------------------------------------------------------------------
-- B) Pin search_path on every function
-- ---------------------------------------------------------------------
alter function app.fn_set_updated_at() set search_path = app, pg_catalog;
alter function app.fn_current_role() set search_path = app, pg_catalog;
alter function app.fn_is_staff() set search_path = app, pg_catalog;
alter function app.fn_reserve_stock_on_order_item() set search_path = app, pg_catalog;
alter function app.fn_handle_order_status_change() set search_path = app, pg_catalog;
alter function app.fn_low_stock_products(uuid) set search_path = app, pg_catalog;
alter function app.fn_place_order(uuid,uuid,uuid,jsonb,text,boolean,integer) set search_path = app, pg_catalog;
alter function app.fn_assign_delivery_partner(uuid) set search_path = app, pg_catalog, extensions;
alter function app.fn_record_payment(uuid,app.payment_method,numeric,text,text,jsonb) set search_path = app, pg_catalog;
alter function app.fn_process_refund(uuid,numeric,text,text) set search_path = app, pg_catalog;
alter function app.fn_wallet_credit(uuid,numeric,text,uuid,text) set search_path = app, pg_catalog;
alter function app.fn_wallet_debit(uuid,numeric,text,uuid,text) set search_path = app, pg_catalog;
alter function app.fn_award_loyalty_points(uuid,int,text,uuid) set search_path = app, pg_catalog;
alter function app.fn_redeem_loyalty_points(uuid,int,text,uuid) set search_path = app, pg_catalog;
alter function app.fn_validate_coupon(text,uuid,numeric) set search_path = app, pg_catalog;
alter function app.fn_calculate_coupon_discount(uuid,numeric) set search_path = app, pg_catalog;
alter function audit.fn_log_activity() set search_path = audit, app, pg_catalog;
alter function reporting.fn_refresh_sales_views() set search_path = reporting, pg_catalog;

-- ---------------------------------------------------------------------
-- C) RLS initplan fix (generic, run once): wraps every direct
--    auth.uid() / app.fn_is_staff() / app.fn_current_role() call in
--    every policy on schemas app/audit as `(select ...)`, so Postgres
--    evaluates it once per query instead of once per row.
--    (The A) policies above are already written pre-wrapped; this
--    block is what was actually run against the live project and is
--    idempotent/safe to re-run after adding new policies later.)
-- ---------------------------------------------------------------------
do $$
declare
  pol record;
  new_qual text;
  new_check text;
  sql text;
begin
  for pol in
    select n.nspname as schema_name, c.relname as table_name, p.polname as policy_name,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('app','audit')
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'app.fn_is_staff()', '(select app.fn_is_staff())');
      new_qual := replace(new_qual, 'app.fn_current_role()', '(select app.fn_current_role())');
    end if;
    if new_check is not null then
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'app.fn_is_staff()', '(select app.fn_is_staff())');
      new_check := replace(new_check, 'app.fn_current_role()', '(select app.fn_current_role())');
    end if;

    if (new_qual is distinct from pol.qual) or (new_check is distinct from pol.with_check) then
      sql := format('alter policy %I on %I.%I', pol.policy_name, pol.schema_name, pol.table_name);
      if new_qual is not null then
        sql := sql || format(' using (%s)', new_qual);
      end if;
      if new_check is not null then
        sql := sql || format(' with check (%s)', new_check);
      end if;
      execute sql;
    end if;
  end loop;
end $$;
