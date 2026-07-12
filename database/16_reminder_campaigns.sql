-- =====================================================================
-- FILE: 16_reminder_campaigns.sql
-- Generalizes the single hardcoded "30 days since last order" reminder
-- into configurable campaigns: pick a template, an interval, and a
-- grace window. Multiple campaigns can run side by side (e.g. a 30-day
-- "come back" nudge and a 60-day "we miss you" one, each with its own
-- template). Also supports one-off messages to an individual customer,
-- outside the interval-based candidate logic entirely.
-- =====================================================================
set search_path = app, public;

create table app.reminder_campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  channel       app.notification_channel not null default 'whatsapp',
  template_id   uuid not null references app.notification_templates(id) on delete restrict,
  interval_days int not null check (interval_days > 0),
  grace_days    int not null default 7 check (grace_days >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references app.user_profiles(id)
);

alter table app.reminder_campaigns enable row level security;
create policy p_reminder_campaigns_staff on app.reminder_campaigns
  for all using ((select app.fn_is_staff())) with check ((select app.fn_is_staff()));

create trigger trg_set_updated_at before update on app.reminder_campaigns
  for each row execute function app.fn_set_updated_at();

-- Generalized candidate finder: same logic as before, parameterized by
-- whichever campaign's interval/grace window and template you pass in.
-- De-duplication is now per-campaign (a customer can independently be
-- eligible for a 30-day campaign AND a 60-day campaign without either
-- suppressing the other).
create or replace function app.fn_get_reminder_candidates(p_campaign_id uuid)
returns table (
  customer_id uuid,
  phone text,
  full_name text,
  last_order_id uuid,
  last_order_placed_at timestamptz,
  days_since_order int
)
language plpgsql stable security definer set search_path = app, pg_catalog as $$
declare
  v_campaign app.reminder_campaigns%rowtype;
begin
  select * into v_campaign from app.reminder_campaigns where id = p_campaign_id and is_active = true;
  if not found then
    raise exception 'Campaign % not found or inactive', p_campaign_id;
  end if;

  return query
  with last_orders as (
    select distinct on (o.customer_id) o.customer_id, o.id as order_id, o.placed_at
    from app.orders o
    where o.status = 'delivered' and o.is_deleted = false
    order by o.customer_id, o.placed_at desc
  )
  select
    lo.customer_id, up.phone, up.full_name, lo.order_id, lo.placed_at,
    extract(day from now() - lo.placed_at)::int
  from last_orders lo
  join app.user_profiles up on up.id = lo.customer_id
  where lo.placed_at::date between (current_date - (v_campaign.interval_days + v_campaign.grace_days))
                              and (current_date - v_campaign.interval_days)
    and up.phone is not null
    and not exists (
      select 1 from app.notifications n
      where n.user_id = lo.customer_id
        and n.channel = v_campaign.channel
        and n.status in ('sent', 'read')
        and n.body like 'campaign:' || p_campaign_id::text || ':' || lo.order_id::text || ':%'
    );
end;
$$;

-- Superseded by fn_get_reminder_candidates(campaign_id); kept only so
-- nothing referencing the old name breaks during the transition. New
-- code should not call this.
drop function if exists app.fn_get_reorder_reminder_candidates();

-- Seed the default campaign, matching the original hardcoded behavior
-- (30 days + 7-day grace window, using the existing reorder_reminder
-- template).
insert into app.reminder_campaigns (name, channel, template_id, interval_days, grace_days, is_active)
select 'Reorder reminder (30 days)', 'whatsapp', t.id, 30, 7, true
from app.notification_templates t
where t.code = 'reorder_reminder'
  and not exists (select 1 from app.reminder_campaigns where name = 'Reorder reminder (30 days)');
