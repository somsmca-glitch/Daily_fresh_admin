-- =====================================================================
-- FILE: 13_enable_cron_and_net.sql
-- Enables pg_cron (scheduled jobs) and pg_net (async HTTP from SQL),
-- needed to call the send-reorder-reminders Edge Function on a daily
-- schedule. See WHATSAPP_SETUP.md for the actual cron.schedule() call
-- (it needs your project's service_role key, which isn't in this repo).
-- =====================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
