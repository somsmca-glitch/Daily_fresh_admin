# WhatsApp Reminders — Setup Guide

## What you can now do (Reminders page)

- **Campaigns** — each one pairs a template with an interval ("days since
  last order") and a grace window. Create as many as you want: a 30-day
  "come back" nudge, a 60-day "we miss you", a 90-day "final offer", each
  with its own message. Toggle any campaign active/paused. Each shows a
  live "due now" count and a "Send now" button.
- **Templates** — create/list message templates (code, channel, body with
  `{{1}}`, `{{2}}`… placeholders). The **code must exactly match** the
  template name you submit to Meta for approval (see below).
- **Send to an individual customer** — search a customer by name/phone,
  pick a template, fill in the parameter values, send immediately. Doesn't
  touch the interval-based campaign logic at all — for one-off messages.
- **History** — every send attempt, campaign or individual, successful or
  failed.

## Setting your WhatsApp credentials (this part is on you)

I don't have a tool that can set Supabase secrets remotely — there's no
way for me to apply an access token even if you shared one, so **please
don't paste your WhatsApp access token into chat**. Set it directly:

**Dashboard → Edge Functions → `send-reorder-reminders` → Secrets**, or via CLI:
```bash
supabase secrets set WHATSAPP_ACCESS_TOKEN=your_token_here
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
supabase secrets set REORDER_LINK=https://your-storefront-or-app-link.com
```

Two IDs Meta gives you that are easy to mix up:
- **Phone Number ID** — this is what `WHATSAPP_PHONE_NUMBER_ID` needs. Find
  it under WhatsApp → API Setup in your Meta app — it's a numeric ID next
  to your sending number, **not the phone number itself**.
- **WhatsApp Business Account ID** — not used by this integration at all,
  safe to ignore here.

If "message ID" refers to something else you have (e.g. a specific message
template's ID rather than the phone number's ID) — that's not something
this integration needs; only the **template name** (which must match a
template's `code` field on the Reminders page) and the **Phone Number ID**
are required. Let me know exactly what you're looking at if you're not
sure which value you've got.

## Creating templates in Meta

Business-initiated WhatsApp messages must use a **pre-approved template**
— freeform text is rejected unless the customer messaged you first within
the last 24 hours. Under WhatsApp → Message Templates → Create Template:

- **Name**: must exactly match the `code` you enter on the Reminders page
  (case-sensitive)
- **Category**: Marketing
- **Body**: use `{{1}}`, `{{2}}`, etc. for anything variable

Example, matching the default seeded campaign:
```
Name: reorder_reminder
Body: Hi {{1}}, it's been a month since your last Daily Fresh order! Tap to reorder your usuals: {{2}}
```

Approval usually takes a few hours. Once approved, create the matching
template on the Reminders page with the same code, then build a campaign
around it (or use it for individual sends).

## Scheduling campaigns to run automatically

Each campaign needs its own scheduled trigger if you want it to run daily
without you clicking "Send now". This needs your project's **service role
key** (Dashboard → Settings → API) — same caveat as above, I don't have
access to it, so this step is yours to run in the SQL Editor:

```sql
-- One-time: store your service role key in Vault
select vault.create_secret(
  'PASTE_YOUR_SERVICE_ROLE_KEY_HERE',
  'service_role_key',
  'Used by pg_cron to call Edge Functions'
);

-- Schedule one campaign (repeat this block, with a different campaign_id
-- and job name, for each campaign you want automated)
select cron.schedule(
  'reminder-campaign-<short-name>',
  '30 4 * * *',  -- 10:00 AM IST daily; adjust as you like
  $$
  select net.http_post(
    url := 'https://ealuexdxdtsletojfnmx.supabase.co/functions/v1/send-reorder-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('mode', 'campaign', 'campaign_id', '<paste-campaign-uuid-here>')
  );
  $$
);
```

Get a campaign's UUID from the Reminders page (or `select id, name from app.reminder_campaigns;`).

To see what's scheduled: `select * from cron.job;`
To see run history: `select * from cron.job_run_details order by start_time desc limit 10;`
To stop one: `select cron.unschedule('reminder-campaign-<short-name>');`

## Testing before going live

- Use Meta's free **test phone number** first (WhatsApp → API Setup) —
  limited to 5 verified recipients, so you can't accidentally message real
  customers while testing.
- The Reminders page's "due now" count for each campaign shows you exactly
  who would be messaged before you click anything.
- "Send to an individual customer" and campaign "Send now" both hit the
  same Edge Function, so either is a true end-to-end test.
- Check `select * from app.notifications where channel = 'whatsapp' order by created_at desc;`
  after any send to see exactly what was logged, success or failure.
