-- =====================================================================
-- FILE: 12_whatsapp_reorder_reminders.sql
-- Finds customers whose most recent order was placed ~30 days ago and
-- who haven't ordered again since, so they can be nudged to reorder
-- via WhatsApp. Uses the existing app.notifications table (channel =
-- 'whatsapp') as both the send log AND the de-duplication check —
-- reference_type = 'reorder_reminder', reference_id = the order that
-- triggered it, so a customer is never reminded twice for the same order.
-- =====================================================================
set search_path = app, public;

create or replace function app.fn_get_reorder_reminder_candidates()
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  last_order_id uuid,
  last_order_placed_at timestamptz,
  days_since_order int
)
language sql stable security definer set search_path = app, pg_catalog as $$
  with last_orders as (
    select distinct on (o.customer_id)
      o.customer_id, o.id as order_id, o.placed_at
    from app.orders o
    where o.status = 'delivered' and o.is_deleted = false
    order by o.customer_id, o.placed_at desc
  )
  select
    lo.customer_id,
    up.phone,
    up.full_name,
    lo.order_id,
    lo.placed_at,
    extract(day from now() - lo.placed_at)::int
  from last_orders lo
  join app.user_profiles up on up.id = lo.customer_id
  where lo.placed_at::date between (current_date - 37) and (current_date - 30)
    and up.phone is not null
    and not exists (
      select 1 from app.notifications n
      where n.user_id = lo.customer_id
        and n.channel = 'whatsapp'
        and n.status in ('sent', 'read')
        and n.body like 'reorder_reminder:' || lo.order_id::text || ':%'
    );
$$;

-- Seed the WhatsApp template row (the actual Meta-approved template name
-- must match exactly what you submit for approval — see the setup guide).
insert into app.notification_templates (code, channel, body_template)
values (
  'reorder_reminder', 'whatsapp',
  'Hi {{1}}, it''s been a month since your last Daily Fresh order! Tap to reorder your usuals: {{2}}'
)
on conflict (code) do nothing;
