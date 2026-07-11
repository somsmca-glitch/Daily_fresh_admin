-- =====================================================================
-- FILE: 03_audit_log.sql
-- MODULE 15: AUDIT LOGS
-- A single generic, partition-friendly audit table captures every
-- INSERT/UPDATE/DELETE across business tables, instead of duplicating
-- audit columns' history per-table. Row-level created_by/modified_by
-- already live on each table (see 01/02); this table stores full diffs.
-- =====================================================================

create table audit.activity_log (
  id            bigint generated always as identity,
  table_name    text not null,
  record_id     uuid not null,
  action        text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_value     jsonb,
  new_value     jsonb,
  changed_by    uuid references app.user_profiles(id),
  ip_address    inet,
  device_info   text,
  changed_at    timestamptz not null default now(),
  primary key (id, changed_at)
) partition by range (changed_at);

-- Monthly partitions (create ahead of time; a scheduled job should
-- roll these forward automatically — see performance recommendations).
create table audit.activity_log_2026_07 partition of audit.activity_log
  for values from ('2026-07-01') to ('2026-08-01');
create table audit.activity_log_2026_08 partition of audit.activity_log
  for values from ('2026-08-01') to ('2026-09-01');
create table audit.activity_log_2026_09 partition of audit.activity_log
  for values from ('2026-09-01') to ('2026-10-01');

create index idx_activity_log_table_record on audit.activity_log(table_name, record_id);
create index idx_activity_log_changed_by on audit.activity_log(changed_by);
create index idx_activity_log_changed_at on audit.activity_log(changed_at desc);

-- Session-scoped context so triggers can attach ip/device without every
-- caller having to pass them explicitly. Set these once per request:
--   select set_config('app.current_ip', '203.0.113.7', true);
--   select set_config('app.current_device', 'iOS App 2.3', true);
-- app.user_profiles(id) for changed_by is inferred from auth.uid().
