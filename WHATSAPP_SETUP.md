# WhatsApp Reorder Reminders — Setup Guide

Sends a WhatsApp message to any customer whose last delivered order was
~30 days ago and who hasn't ordered again since, nudging them to reorder.
Runs automatically once a day, and can also be triggered manually from the
admin panel's **Reminders** page.

## How it works (already built and deployed)

- **`app.fn_get_reorder_reminder_candidates()`** — a database function that
  finds eligible customers (delivered order 30–37 days ago, no reorder
  since, not already reminded for that order). Tested against real data
  before deployment.
- **`send-reorder-reminders` Edge Function** — deployed and live at
  `https://ealuexdxdtsletojfnmx.supabase.co/functions/v1/send-reorder-reminders`.
  Calls the candidate function, sends each one a WhatsApp template message
  via Meta's Cloud API, and logs every attempt to `app.notifications`
  (which doubles as the de-duplication record).
- **Reminders page** in the admin panel — shows who's due today, a
  "Send reminders now" button, and a history of past sends.
- **Staff-only**: the Edge Function checks the caller's role in
  `app.user_profiles` before doing anything (or accepts the service role
  key, for the scheduled cron job).

None of this can actually send a message yet — that needs three things
from you, none of which I can do on your behalf (they all require your own
Meta Business account and your project's private service role key, which
I deliberately don't have access to).

## 1. Get a WhatsApp Business Cloud API account

1. Go to [developers.facebook.com](https://developers.facebook.com) → create
   an app → type **Business**.
2. Add the **WhatsApp** product to the app.
3. Under WhatsApp → API Setup, you'll get a **test phone number** for free
   to start (limited to 5 recipients/day — fine for testing, not for real
   use). For production, add your own business phone number under
   WhatsApp → Configuration and complete Meta's verification.
4. Note two values from the API Setup page:
   - **Phone Number ID** (not the phone number itself — a numeric ID)
   - **Temporary access token** (24-hour token, fine for testing). For
     production, generate a **permanent token** via a System User under
     Business Settings → System Users → generate token with
     `whatsapp_business_messaging` permission.

## 2. Create and submit the message template

Business-initiated WhatsApp messages (i.e. anything you send first, not a
reply) **must** use a pre-approved template — Meta rejects freeform text
for this. Under WhatsApp → Message Templates → Create Template:

- **Name**: `reorder_reminder` (must match exactly, case-sensitive)
- **Category**: Marketing
- **Language**: English
- **Body**:
  ```
  Hi {{1}}, it's been a month since your last Daily Fresh order! Tap to reorder your usuals: {{2}}
  ```
- Submit for review. Approval usually takes a few hours, sometimes up to a
  day. You'll see the status change to "Approved" in the same screen.

## 3. Set the Edge Function's secrets

In the Supabase Dashboard → Edge Functions → `send-reorder-reminders` →
Secrets (or via CLI: `supabase secrets set KEY=value`), set:

| Secret | Value |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | the token from step 1 |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone Number ID from step 1 |
| `REORDER_LINK` | URL customers should tap — your storefront or a Flutter app deep link. Placeholder (`https://dailyfresh.example.com/reorder`) is used until you set this. |
| `WHATSAPP_TEMPLATE_NAME` | only needed if you name the template something other than `reorder_reminder` |
| `WHATSAPP_TEMPLATE_LANG` | only needed if not `en` |

## 4. Schedule the daily run

This step needs your project's **service role key** (Dashboard → Settings
→ API → reveal the `service_role` key) — I don't have access to that key,
by design, so this part is on you. Run this in the SQL Editor, with your
actual key pasted in:

```sql
-- Store the service role key in Supabase Vault (encrypted at rest)
select vault.create_secret(
  'PASTE_YOUR_SERVICE_ROLE_KEY_HERE',
  'service_role_key',
  'Used by pg_cron to call Edge Functions'
);

-- Run daily at 10:00 AM IST (04:30 UTC)
select cron.schedule(
  'send-reorder-reminders-daily',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://ealuexdxdtsletojfnmx.supabase.co/functions/v1/send-reorder-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

`pg_cron` and `pg_net` are already enabled on your project — that part's done.

To confirm it's scheduled: `select * from cron.job;`
To see run history: `select * from cron.job_run_details order by start_time desc limit 10;`
To stop it: `select cron.unschedule('send-reorder-reminders-daily');`

## Testing before going live

- Use the **test phone number** from step 1 first — it only works for up
  to 5 numbers you've explicitly verified in the Meta dashboard, which
  keeps you from accidentally messaging real customers while testing.
- The admin panel's **Reminders** page shows exactly who's currently
  eligible before you send anything — check that list looks right first.
- The "Send reminders now" button and the daily cron job both hit the same
  Edge Function, so testing via the button is a true test of the whole path.
- Check `select * from app.notifications where channel = 'whatsapp' order by created_at desc;`
  after a send to see exactly what was logged, success or failure.
