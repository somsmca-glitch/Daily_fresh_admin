-- =====================================================================
-- FILE: 10_expose_schemas_for_data_api.sql
-- By default, Supabase's PostgREST-based Data API only serves the
-- `public` schema. This exposes `app` and `reporting` (used by the
-- admin panel and, later, the Flutter app) while deliberately leaving
-- `audit` un-exposed — forensic reads stay SQL-editor/service-role only.
-- =====================================================================

alter role authenticator set pgrst.db_schemas = 'public, app, reporting';
notify pgrst, 'reload config';

grant usage on schema app to anon, authenticated, service_role;
grant usage on schema reporting to anon, authenticated, service_role;

grant all on all tables in schema app to anon, authenticated, service_role;
grant all on all tables in schema reporting to anon, authenticated, service_role;

grant execute on all functions in schema app to anon, authenticated, service_role;
grant execute on all functions in schema reporting to anon, authenticated, service_role;

-- Keep future tables/functions in these schemas exposed automatically too.
alter default privileges for role postgres in schema app
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema app
  grant execute on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema reporting
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema reporting
  grant execute on functions to anon, authenticated, service_role;

notify pgrst, 'reload schema';
