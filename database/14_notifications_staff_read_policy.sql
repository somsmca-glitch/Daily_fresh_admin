-- =====================================================================
-- FILE: 14_notifications_staff_read_policy.sql
-- The original RLS on app.notifications only let a customer see their
-- own rows. Staff need to read all notifications (e.g. the WhatsApp
-- reminder history) for the admin panel's Reminders page.
-- =====================================================================
set search_path = app, public;

create policy p_notifications_staff_read on app.notifications
  for select using ((select app.fn_is_staff()));
