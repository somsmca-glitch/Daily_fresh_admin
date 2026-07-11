# Dharapuram Grocery — Admin Panel

A staff-only ops console for the grocery delivery database: dashboard KPIs,
product catalog management, order status control, inventory/low-stock
tracking, and a customer directory. Built with **React + TypeScript + Vite +
Tailwind + `@supabase/supabase-js`**, wired directly to your live Supabase
project (`ealuexdxdtsletojfnmx`).

## Why this stack

- **Supabase's JS SDK is first-class** — best-documented, most examples,
  least friction of any client for this backend.
- **Vite** gives instant local dev and a static production build you can host
  anywhere (Vercel, Netlify, Supabase's own static hosting, or a plain
  `nginx` box) — no server to run.
- Considered and passed on for this use case: **Next.js** (adds SSR
  complexity an internal, staff-only tool doesn't need), **Refine.dev**
  (faster CRUD scaffolding, but another framework to learn on top of React),
  **Retool/Appsmith** (fastest to a working panel, but you don't own the code
  and it's a separate paid service).
- **Your Flutter app is a separate client of the same backend** — it doesn't
  need to match this stack. See "Flutter integration" below.

## Run it locally

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`. `.env` is already filled in with your
project's URL and **publishable (anon) key** — safe to keep in client code,
since real access control comes from the Row Level Security policies already
on your database, not from hiding this key.

```bash
npm run build      # type-checks + produces a static build in dist/
npm run preview    # serves that build locally to sanity-check it
```

## Create your first admin login

Nobody can sign into this panel until they exist as a **staff** row in the
database (customer accounts are explicitly rejected — see `src/lib/auth.tsx`).
Two steps:

**1. Create the auth user.** In the Supabase Dashboard → Authentication →
Users → **Add user** (or **Invite user** to send them a setup email). Note
the user's UUID once created.

**2. Promote them to staff**, in the SQL Editor:

```sql
-- Replace the UUID with the one from step 1.
update app.user_profiles
set role = 'super_admin', full_name = 'Som'
where id = '00000000-0000-0000-0000-000000000000';

insert into app.employees (id, employee_code, department_id, designation_id)
values (
  '00000000-0000-0000-0000-000000000000',
  'EMP-001',
  (select id from app.departments where name = 'Operations'),
  (select id from app.designations where title = 'Store Manager')
);
```

(A trigger already auto-creates the `app.user_profiles` row with
`role = 'customer'` the moment the auth user is created — this step just
upgrades that role and adds the employee record. Any of the five staff roles
— `super_admin`, `store_manager`, `warehouse_manager`, `employee`,
`support_agent` — can sign into the panel; only `super_admin` can manage
other employees, per the RLS policies already in place.)

## Demo data

The database now has a full demo dataset for testing/screenshots, not just
the original 3-product seed:

- **23 products** across 8 categories (produce, dairy, bakery, snacks,
  personal care, household, staples) and **2 stores** (Dharapuram + Palladam)
- **15 demo customers** and **3 demo delivery partners**, each with a real
  login — email `customer1@demo.dailyfresh.local` through `customer15@...`
  (and `partner1@...` through `partner3@...`), all sharing the password
  `Demo@12345`
- **~103 historical orders** spread across the last 60 days with a realistic
  status mix (~60% delivered, ~12% cancelled, rest in various in-progress
  states) and real payments/loyalty points, generated through the actual
  `fn_place_order`/`fn_record_payment` RPCs — not hand-inserted rows — so
  stock deduction and totals are all genuinely correct
- Two inventory rows deliberately left below reorder level, so the low-stock
  alert on the dashboard has something to show

Migration files `database/11_demo_data_part1.sql` (catalog/stores/inventory),
`part2.sql` (customers/delivery partners), and `part3.sql` (the order
generator) are all safe to re-run on a fresh database if you want to reset
or regenerate the demo set — `part3.sql` uses random data each run, so
re-running it adds another ~100 orders rather than replacing the old ones.

## WhatsApp reorder reminders

The **Reminders** page finds customers whose last delivered order was
~30 days ago and haven't reordered since, and sends them a WhatsApp
message via Meta's Cloud API — either on a daily schedule or on demand via
a "Send reminders now" button. Fully built and deployed (database function,
Edge Function, admin UI), but sending real messages needs your own Meta
Business account, an approved message template, and a few secrets —
**see `WHATSAPP_SETUP.md` for the exact steps**, none of which I can
complete on your behalf.

## Dashboard charts

The dashboard now includes a 30-day revenue trend line chart and an orders-
by-status bar chart (`recharts`), alongside the existing KPI cards, low-stock
table, top-products list, and store performance table — all reading from
`app.orders` and the `reporting.*` views directly, so they reflect whatever
data is actually in the database.



| Path | Purpose |
|---|---|
| `src/lib/supabase.ts` | Two Supabase clients — one scoped to the `app` schema (tables), one to `reporting` (dashboard views) |
| `src/lib/auth.tsx` | Auth context; blocks sign-in for non-staff roles |
| `src/pages/Dashboard.tsx` | KPIs, low-stock alerts, top products, store performance — all from the `reporting.*` views you already have |
| `src/pages/Products.tsx` | Catalog list + add-product form |
| `src/pages/Orders.tsx` | Order list with live status updates (writes to `app.orders.status`, which your existing trigger cascades into inventory deduction/stock movements automatically) |
| `src/pages/Inventory.tsx` | Stock levels, editable reorder thresholds |
| `src/pages/Customers.tsx` | Customer directory with wallet/loyalty balances |

Every read/write goes through Supabase's REST layer, so it's governed by the
exact same RLS policies as any other client — this panel has no special
back-door access.

## Database changes made to support this panel

Two things were fixed directly on your live project so the panel (and your
future Flutter app) can actually reach the data:

1. **Exposed the `app` and `reporting` schemas** over the Data API. By
   default Supabase's REST layer only serves the `public` schema — I set
   `pgrst.db_schemas = 'public, app, reporting'` on the `authenticator` role
   and granted `anon`/`authenticated` access to those schemas' tables,
   views, and functions (RLS still governs which *rows* are visible; this
   just makes the objects reachable at all). `audit` was deliberately left
   un-exposed — forensic reads stay SQL-editor-only.
2. **Added `app.fn_handle_new_auth_user`**, a trigger on `auth.users` that
   auto-creates the matching `app.user_profiles` (role defaults to
   `customer`) and `app.customers` row (with a generated referral code) the
   instant someone signs up — this is what your Flutter app's signup flow
   needs to work without extra client-side plumbing.

## Flutter integration

Your Flutter app talks to the **same Supabase project**, independently of
this admin panel, using the official `supabase_flutter` package.

**1. Add the dependency** (`pubspec.yaml`):
```yaml
dependencies:
  supabase_flutter: ^2.6.0
```

**2. Initialize once, at app startup:**
```dart
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: 'https://ealuexdxdtsletojfnmx.supabase.co',
    anonKey: 'sb_publishable_6-zVTaBZY8sKpqNR2amgJw_FHz3cMe-', // same key as .env here
  );
  runApp(const MyApp());
}

final supabase = Supabase.instance.client;
```

**3. Sign-up / sign-in** (customers only — the `fn_handle_new_auth_user`
trigger provisions their `app.customers` row automatically):
```dart
await supabase.auth.signUp(email: email, password: password);
// or phone OTP, which fits an Indian grocery app well:
await supabase.auth.signInWithOtp(phone: '+91XXXXXXXXXX');
```

**4. Query the same tables, scoped by RLS to `app` schema:**
```dart
final products = await supabase
    .schema('app')
    .from('products')
    .select('id, name, selling_price, mrp')
    .eq('is_active', true);

final myOrders = await supabase
    .schema('reporting')
    .from('v_customer_order_summary')
    .select()
    .order('placed_at', ascending: false);
```

**5. Place an order through the same RPC function this panel's data model
relies on** (never insert into `orders`/`order_items` directly from the
client — the totals/stock-reservation logic lives server-side in
`fn_place_order` for a reason):
```dart
final orderId = await supabase.schema('app').rpc('fn_place_order', params: {
  'p_customer_id': supabase.auth.currentUser!.id,
  'p_store_id': storeId,
  'p_delivery_address_id': addressId,
  'p_items': [
    {'product_id': productId, 'quantity': 2},
  ],
  'p_coupon_code': null,
});
```

**6. Realtime order tracking** (Supabase Realtime is enabled the same way
regardless of client):
```dart
supabase
    .schema('app')
    .from('delivery_tracking')
    .stream(primaryKey: ['id'])
    .eq('delivery_order_id', deliveryOrderId)
    .listen((rows) { /* update the map */ });
```

That's the whole integration surface — the Flutter app and this admin panel
are two independent front-ends of the same RLS-governed Postgres database,
exactly as intended.
