-- =====================================================================
-- FILE: 15_super_admin_full_access.sql
-- Grants super_admin an unconditional, unrestricted policy on every
-- table in the app schema, in addition to (not replacing) the existing
-- narrower role-based policies. RLS permissive policies OR together, so
-- this guarantees super_admin can read/write/delete anything in the
-- business schema regardless of what any other policy on that table
-- says (e.g. inventory's warehouse-assignment scoping, employees'
-- admin-only restriction, etc. all still apply correctly to everyone
-- else, but no longer constrain super_admin).
--
-- Deliberately NOT applied to the audit schema — even super_admin
-- should not be able to edit or delete audit log entries; that would
-- defeat the purpose of an audit trail. super_admin can still READ
-- audit.activity_log via the existing p_audit_log_admin_read policy.
--
-- Safe to re-run: drops and recreates each policy first.
-- =====================================================================
set search_path = app, public;

do $$
declare
  r record;
  v_policy_name text;
begin
  for r in select tablename from pg_tables where schemaname = 'app'
  loop
    v_policy_name := 'p_' || r.tablename || '_super_admin_bypass';
    execute format('drop policy if exists %I on app.%I;', v_policy_name, r.tablename);
    execute format(
      'create policy %I on app.%I
         for all
         using ((select app.fn_current_role()) = ''super_admin'')
         with check ((select app.fn_current_role()) = ''super_admin'');',
      v_policy_name, r.tablename
    );
  end loop;
end $$;
