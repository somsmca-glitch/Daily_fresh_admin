# Online Grocery Delivery Platform — Database Architecture

A production-oriented PostgreSQL/Supabase schema for a Zepto/Blinkit/Instamart-style
multi-store grocery delivery platform. This document covers Phases 1, 2, 10, 11, 12
of the deliverable; SQL for Phases 3–9 lives in the numbered `.sql` files in this folder.

## File map

| File | Phase(s) | Contents |
|---|---|---|
| `01_schema_core.sql` | 3, 4, 5 | Extensions, enums, product catalog, customers, stores/warehouses, suppliers, inventory, orders, payments |
| `02_schema_operations.sql` | 3, 4, 5 | Delivery partners, delivery orders/tracking, employees, coupons/offers, notifications |
| `03_audit_log.sql` | 15 | Partitioned generic audit log table |
| `04_functions_triggers.sql` | 7 | Triggers + RPC functions: inventory reservation/deduction, order placement, delivery assignment, payments, wallet, loyalty points, coupon validation |
| `05_rls_policies.sql` | 16 | Row Level Security for every role |
| `06_views_reports.sql` | 9, 14 | Catalog view, order summary, materialized sales rollups, top products, store/partner/supplier/employee performance |
| `07_seed_data.sql` | 6 | Representative sample rows |

Run them in numeric order against a fresh Supabase project (via the SQL editor or
`supabase db push` with these as migration files).

---

## Phase 1 — Database Architecture Overview

**Core design decisions**

- **Schemas**: `app` (business data), `audit` (activity log, partitioned by month),
  `reporting` (views/materialized views). Keeping reporting objects out of `app`
  keeps `pg_dump`, RLS, and Supabase's auto-generated REST API surface clean —
  the API only needs to expose `app` and `reporting`.
- **Identity**: every human-facing entity (customer, employee, delivery partner)
  reuses `auth.users.id` as its own primary key via `app.user_profiles`, avoiding a
  duplicate identity table and keeping RLS checks (`auth.uid()`) a single join away.
- **Normalization**: 3NF throughout, with two deliberate denormalizations for
  performance/history integrity:
  - `order_items.product_name_snapshot` — preserves what the customer actually saw,
    independent of later product renames.
  - `products.discount_percent` — a generated (computed) column, not stored input,
    so it can never drift from `mrp`/`selling_price`.
- **Money**: `numeric(10,2)` / `numeric(12,2)` everywhere — never `float`.
- **Geospatial**: PostGIS `geography(Point,4326)` generated columns on addresses,
  stores, delivery-partner live location, and delivery tracking pings, enabling
  `ST_DWithin` / `ST_Distance` queries for "stores near me" and delivery assignment.
- **Soft deletes**: `is_deleted` + `deleted_at` + `deleted_by` on customer-owned and
  catalog tables where "undo" or historical reporting matters (products, categories,
  customers, orders, reviews). Pure transactional/log tables (stock movements, audit
  log, order status history) are append-only instead — nothing to soft-delete.
- **Audit**: two layers, not one —
  1. Lightweight per-row `created_by` / `modified_by` / `created_at` / `updated_at`
     on every table (cheap, always available).
  2. A full-diff `audit.activity_log` (old value / new value as JSONB) attached via
     trigger to the tables that actually need forensic history: orders, payments,
     inventory, products, coupons, employees, wallet transactions. Attaching it to
     literally every table would be wasteful — attach more triggers if compliance
     needs widen.
- **Stock integrity**: `quantity_reserved` is separated from `quantity_on_hand` so
  that "add to cart / place order" reserves stock immediately (preventing
  overselling during the packing window) while the physical deduction only happens
  when the order actually moves to `packed`, and is reversed cleanly on
  cancellation/return.

## Phase 2 — Entity Relationship Diagram (textual)

A full visual ERD is best generated directly from the live schema (Supabase's
Table Editor renders one automatically, or run the schema through
[dbdiagram.io](https://dbdiagram.io) / `pg_dump --schema-only` → a tool like
SchemaSpy). The high-level entity clusters and their relationships:

```
auth.users ──1:1── app.user_profiles ──1:1── {customers | employees | delivery_partners}

app.customers ──1:N── customer_addresses
app.customers ──1:N── orders ──1:N── order_items ──N:1── products
app.customers ──1:N── customer_wallet_transactions
app.customers ──1:N── loyalty_point_transactions
app.customers ──1:N── product_reviews ──N:1── products
app.customers ──1:N── product_favorites ──N:1── products

app.categories ──1:N── categories (self, parent/child)
app.categories ──1:N── products ──1:N── product_images
                                 ──1:N── product_variants
                                 ──1:N── product_attributes
app.brands ──1:N── products

app.stores ──1:N── warehouses ──1:N── inventory ──N:1── products
app.warehouses ──1:N── inventory_batches
app.warehouses ──1:N── stock_movements
app.stores ──1:N── orders

app.suppliers ──1:N── supplier_products ──N:1── products
app.suppliers ──1:N── purchase_orders ──1:N── purchase_order_items
app.suppliers ──1:N── supplier_payments, supplier_ledger

app.orders ──1:1── delivery_orders ──N:1── delivery_partners
                                    ──1:N── delivery_tracking
                                    ──1:N── delivery_photos
app.orders ──1:N── payments ──1:N── refunds
app.orders ──1:1── invoices
app.orders ──1:N── order_status_history, order_notes, order_cancellations
app.orders ──N:1── coupons ──1:N── coupon_redemptions

app.employees ──N:1── departments, designations
app.employees ──1:N── employee_attendance, employee_leaves, employee_shifts,
                       employee_performance_reviews, salary_payments
app.employees ──N:N── stores (employee_store_assignments)
app.employees ──N:N── warehouses (employee_warehouse_assignments)

app.delivery_partners ──1:N── delivery_partner_vehicles, delivery_partner_shifts

audit.activity_log ── polymorphic reference (table_name, record_id) to any app.* row
```

---

## Phase 10 — Performance Optimization Recommendations

- **Indexing already applied**: FK columns, status/flag columns used in `WHERE`,
  a GIN full-text index (`products.search_vector`) plus `pg_trgm` for fuzzy
  autocomplete, GIST indexes on all `geography` columns, and partial indexes
  (e.g. low-stock, active-only) so hot queries skip soft-deleted/inactive rows
  without a full scan.
- **Read/write separation**: point the storefront's catalog browsing and search
  at Supabase read replicas (available on Team/Enterprise plans) once traffic
  grows; keep order placement and payment writes on the primary.
- **Materialized views** (`mv_daily_sales`, `mv_monthly_sales`) absorb expensive
  aggregation so dashboards don't hit raw `orders`/`order_items` on every load.
  Refresh via `pg_cron` (bundled with Supabase) on a schedule (nightly or hourly),
  using `REFRESH MATERIALIZED VIEW CONCURRENTLY` (requires the unique indexes
  already defined) to avoid blocking readers during refresh.
- **Partitioning**: `audit.activity_log` is range-partitioned by month; do the
  same for `orders` / `order_items` / `stock_movements` / `delivery_tracking` once
  volumes reach tens of millions of rows — high-frequency GPS pings in
  `delivery_tracking` in particular should be partitioned (daily) and pruned/archived
  aggressively (e.g. keep 30 days live, archive to cold storage after).
- **Connection pooling**: use Supabase's built-in PgBouncer (transaction mode) for
  application traffic; reserve direct connections for migrations/admin work.
- **N+1 avoidance**: the `reporting.v_product_catalog` view precomputes primary
  image and available stock per product so the storefront needs one query per
  page, not one plus N.
- **Vacuum/autovacuum tuning**: high-churn tables (`inventory`, `delivery_tracking`,
  `notifications`) benefit from more aggressive autovacuum settings
  (`autovacuum_vacuum_scale_factor` lowered) to keep bloat down given frequent
  UPDATE/INSERT bursts.

## Phase 11 — Supabase Integration Guide

- **Auth**: use Supabase Auth for all sign-in (phone OTP is the natural fit for an
  Indian grocery app). On first login, an `on_auth_user_created` trigger (add to
  `auth.users`, not shown above since it lives outside the `app` schema) should
  insert the matching `app.user_profiles` row with `role = 'customer'` by default;
  staff/delivery-partner roles get provisioned by an admin flow, not self-signup.
- **REST API**: PostgREST auto-generates endpoints for every table in `app` and
  `reporting`; RLS policies (Phase 8 / file `05_rls_policies.sql`) are what actually
  secure them — never rely on hiding a table from the client. RPC functions
  (`fn_place_order`, `fn_record_payment`, `fn_wallet_credit`, etc.) should be the
  only way clients mutate multi-table workflows; grant `EXECUTE` on those functions
  to `authenticated` and revoke direct `INSERT`/`UPDATE` on the underlying tables
  where a function exists, so totals/stock can never be spoofed from the client.
- **Realtime**: enable Supabase Realtime on `delivery_tracking` (live map), 
  `orders`/`order_status_history` (order status chip), and `notifications` (in-app
  bell) — these are the tables that benefit from push updates; leave it off
  elsewhere to limit replication overhead.
- **Storage buckets** (Supabase Storage):

  | Bucket | Access | Contents |
  |---|---|---|
  | `product-images` | public read, staff write | Product & variant photography |
  | `category-assets` | public read, staff write | Category icons/banners |
  | `review-images` | public read, owner write | Customer review photos |
  | `delivery-proof` | staff/partner/owning-customer read, partner write | Delivery photos, signatures |
  | `kyc-documents` | private, owner + admin only | Aadhaar/PAN/DL/insurance scans for delivery partners & suppliers |
  | `invoices` | owner + staff read | Generated invoice PDFs |
  | `employee-documents` | private, HR/admin only | Employee onboarding paperwork |

  Mirror the RLS pattern for Storage policies: `kyc-documents` and
  `employee-documents` must never be public buckets given the sensitive PII involved.
- **Edge Functions**: good fit for anything needing a third-party call — payment
  gateway webhooks (updating `payments.status` on confirmation), SMS/WhatsApp
  dispatch for `notifications`, and the nightly `fn_refresh_sales_views()` /
  low-stock digest email.

## Phase 12 — Best Practices for Production Deployment

- **Migrations**: manage every change in this repo as sequential, timestamped SQL
  migration files (Supabase CLI: `supabase migration new <name>`); never hand-edit
  the production schema through the dashboard. Keep `01`–`07` here as the seed
  history, then continue with `supabase migration new` for anything after.
- **Environments**: separate Supabase projects for dev / staging / production;
  promote migrations staging → production only after running the seed +
  integration tests against staging.
- **Secrets**: payment gateway keys, SMS/WhatsApp provider credentials, and any
  service-role key belong in Edge Function / server environment variables —
  never in client code, and never in a table without column-level encryption.
- **Least privilege**: the `service_role` key (which bypasses RLS) should only be
  used server-side (Edge Functions, your backend), never shipped to a mobile/web
  client. All client traffic goes through the `anon`/`authenticated` roles and is
  therefore fully governed by the RLS policies in `05_rls_policies.sql`.
- **Backup & disaster recovery**:
  - Enable Supabase's Point-in-Time Recovery (PITR) once volume justifies it —
    gives second-level recovery granularity instead of nightly-only snapshots.
  - Daily automated backups (Supabase default) retained per your plan's window;
    additionally export a weekly `pg_dump` to an external store (S3/GCS) for an
    off-platform copy, since PITR/backups are still inside Supabase's own
    infrastructure.
  - Rehearse restores quarterly — a backup you haven't restored is a hypothesis,
    not a guarantee.
  - For `audit.activity_log` and `delivery_tracking`, define an explicit retention/
    archival policy (e.g., roll partitions older than 12 months to cold storage)
    so backups don't balloon indefinitely.
- **Monitoring**: watch Supabase's built-in Postgres metrics (connections, cache
  hit ratio, slow queries) plus alerting on the `reporting.v_low_stock_alerts`
  view and payment failure rate (`payments.status = 'failed'`) as business-level
  health signals, not just infra-level ones.
- **Testing**: exercise `fn_place_order` → `fn_assign_delivery_partner` →
  `fn_record_payment` → status transitions end-to-end in staging with the seed
  data before every release; these RPCs are the critical path where a bug directly
  costs money or oversells stock.

## Deployment status

This schema is **live** on the connected Supabase project
(`somsmca-glitch's Project`, ref `ealuexdxdtsletojfnmx`, `ap-southeast-2`).
Files `01`–`07` plus `08_rls_gaps_and_function_hardening.sql` were applied in
order, then verified against Supabase's security and performance advisors:

- 63 tables in `app`, 4 in `audit`, 9 views/materialized views in `reporting`,
  107 RLS policies.
- Fixed after the advisor flagged them: ~26 tables that had RLS enabled but no
  policy, mutable `search_path` on all 18 functions, and 55 RLS policies that
  called `auth.uid()` / `fn_is_staff()` / `fn_current_role()` directly instead
  of `(select ...)` (the latter gets evaluated once per query instead of once
  per row — a standard Supabase RLS performance fix).
- Ran a full functional test through the real `fn_place_order` → pack →
  `fn_record_payment` → wallet/loyalty path against the live database before
  declaring it done, not just the DDL.
- Left untouched: `public.spatial_ref_sys` (PostGIS system table, not owned by
  this schema, can't `ALTER` it) and five pre-existing `public` schema tables
  (`profiles`, `addresses`, `orders`, `order_items`, `wishlists`) that predate
  this deployment and aren't part of this grocery schema — flagging their
  existence rather than touching another app's tables silently.
- Not yet addressed (lower priority, safe to defer): ~79 `unindexed_foreign_keys`
  info-level notices (mostly on low-traffic `created_by`/`modified_by`/`deleted_by`
  audit columns, not core relationship FKs) and 145 `multiple_permissive_policies`
  notices (from intentionally separate "owner" vs "staff" policies per table —
  functionally correct, just a minor per-row OR-evaluation cost; consolidating
  them is a larger refactor best done once real usage patterns are visible).
- One item needs the Supabase dashboard, not SQL: enable **Leaked Password
  Protection** under Authentication → Policies.

## Admin panel

A working staff admin panel (React + TypeScript + Vite + Tailwind +
`@supabase/supabase-js`) was built against this schema and is documented
separately in the `grocery-admin-panel/` project — see its `README.md` for
setup, the first-admin bootstrap procedure, and a full Flutter integration
guide (`supabase_flutter`, same project, same RLS rules, independent client).

Building it required two additional migrations beyond `01`–`08`:

- `09_auto_provision_customer_on_signup.sql` — a trigger on `auth.users`
  that auto-creates the matching `app.user_profiles`/`app.customers` row on
  signup (role defaults to `customer`), which any client — this admin panel
  or the future Flutter app — depends on for self-serve signup to work.
- `10_expose_schemas_for_data_api.sql` — exposes `app` and `reporting` over
  Supabase's Data API. By default only `public` is exposed; without this,
  every REST call from any client (including Flutter) would fail with
  `PGRST106`. `audit` is deliberately left un-exposed.

## Naming conventions used throughout

- Tables: `snake_case`, plural (`products`, `order_items`).
- Columns: `snake_case`, singular, `*_id` for foreign keys, `is_*` for booleans,
  `*_at` for timestamps, `*_date` for dates without time.
- Enums: `app.<concept>` singular (`order_status`, `payment_method`).
- Functions: `fn_<verb>_<noun>` (`fn_place_order`, `fn_validate_coupon`).
- Triggers: `trg_<what_it_does>`.
- Indexes: `idx_<table>_<columns>`; unique indexes `uq_<table>_<columns>`.
- RLS policies: `p_<table>_<role_or_intent>`.
