-- MindGym catalog inventory v1 | 2026-09-23
-- Paste the ENTIRE file into Supabase SQL Editor and export the result as CSV.
-- One SELECT, no DDL/DML, no application table rows or secret stores queried.
-- All non-system schemas including auth/storage are inventoried, not all are
-- application-owned. Raw ACLs and OIDs are retained for later interpretation.
-- Function bodies/default expressions may contain embedded credentials.
-- Keep the raw export private. This is NOT executable migration SQL or a backup.
-- Cron, bucket configuration, Auth dashboard and Edge Functions are separate.
-- Each category is one JSON array; item_count and bytes help detect truncation.
WITH ns AS (
  SELECT * FROM pg_namespace
  WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
), inventory AS (
SELECT 'metadata'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT current_database() AS database, current_user AS reader, version() AS version, statement_timestamp() AS captured_at, 'Catalog inventory, not a restorable dump; platform settings and cron exported separately' AS scope) x
UNION ALL
SELECT 'schemas'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.*, pg_get_userbyid(n.nspowner) AS owner_name FROM ns n) x
UNION ALL
SELECT 'relations'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT c.*, n.nspname, pg_get_userbyid(c.relowner) AS owner_name, CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, false) END AS view_definition, CASE WHEN c.relkind='p' THEN pg_get_partkeydef(c.oid) END AS partition_key, pg_get_expr(c.relpartbound,c.oid) AS partition_bound FROM pg_class c JOIN ns n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','S','f')) x
UNION ALL
SELECT 'columns'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, c.relname, a.*, format_type(a.atttypid,a.atttypmod) AS formatted_type, pg_get_expr(d.adbin,d.adrelid) AS default_expression, col_description(c.oid,a.attnum) AS comment FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN ns n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')) x
UNION ALL
SELECT 'constraints'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, c.*, pg_get_constraintdef(c.oid,false) AS definition FROM pg_constraint c JOIN ns n ON n.oid=c.connamespace) x
UNION ALL
SELECT 'indexes'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, c.relname AS table_name, i.*, pg_get_indexdef(i.indexrelid) AS definition FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN ns n ON n.oid=c.relnamespace) x
UNION ALL
SELECT 'policies'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, c.relname, p.*, ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r)::text END FROM unnest(p.polroles) r) AS role_names, pg_get_expr(p.polqual,p.polrelid) AS using_expression, pg_get_expr(p.polwithcheck,p.polrelid) AS check_expression FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN ns n ON n.oid=c.relnamespace) x
UNION ALL
SELECT 'routines'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, p.oid, p.proname, p.prokind, pg_get_userbyid(p.proowner) AS owner_name, p.proacl, p.proconfig, p.prosecdef, pg_get_function_identity_arguments(p.oid) AS identity_arguments, CASE WHEN p.prokind IN ('f','p','w') THEN pg_get_functiondef(p.oid) END AS definition FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace) x
UNION ALL
SELECT 'aggregates'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, p.proname, a.* FROM pg_aggregate a JOIN pg_proc p ON p.oid=a.aggfnoid JOIN ns n ON n.oid=p.pronamespace) x
UNION ALL
SELECT 'triggers'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname, c.relname, t.*, pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN ns n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal) x
UNION ALL
SELECT 'event_triggers'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT * FROM pg_event_trigger) x
UNION ALL
SELECT 'rules'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname,c.relname,r.rulename,pg_get_ruledef(r.oid,false) AS definition FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN ns n ON n.oid=c.relnamespace WHERE r.rulename <> '_RETURN') x
UNION ALL
SELECT 'types'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname,t.*, format_type(t.typbasetype,t.typtypmod) AS base_type FROM pg_type t JOIN ns n ON n.oid=t.typnamespace) x
UNION ALL
SELECT 'enums'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname,t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN ns n ON n.oid=t.typnamespace) x
UNION ALL
SELECT 'sequences'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT n.nspname,c.relname,s.* FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN ns n ON n.oid=c.relnamespace) x
UNION ALL
SELECT 'inheritance'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT i.* FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN ns n ON n.oid=c.relnamespace) x
UNION ALL
SELECT 'default_privileges'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT d.*,pg_get_userbyid(d.defaclrole) AS owner_name,n.nspname FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace) x
UNION ALL
SELECT 'roles'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls FROM pg_roles) x
UNION ALL
SELECT 'role_memberships'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT m.*,pg_get_userbyid(m.roleid) AS role_name,pg_get_userbyid(m.member) AS member_name,pg_get_userbyid(m.grantor) AS grantor_name FROM pg_auth_members m) x
UNION ALL
SELECT 'extensions'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT e.*,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace) x
UNION ALL
SELECT 'dependencies'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT * FROM pg_depend) x
UNION ALL
SELECT 'publications'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT * FROM pg_publication) x
UNION ALL
SELECT 'publication_tables'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT * FROM pg_publication_tables) x
UNION ALL
SELECT 'comments'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT d.* FROM pg_description d WHERE (d.classoid='pg_class'::regclass AND d.objoid IN (SELECT c.oid FROM pg_class c JOIN ns n ON n.oid=c.relnamespace)) OR (d.classoid='pg_proc'::regclass AND d.objoid IN (SELECT p.oid FROM pg_proc p JOIN ns n ON n.oid=p.pronamespace))) x
UNION ALL
SELECT 'optional_objects'::text AS category, count(*) AS item_count, coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS payload FROM (SELECT to_regclass('cron.job')::text AS cron_jobs, to_regclass('storage.buckets')::text AS storage_buckets) x
)
SELECT category, item_count, octet_length(payload::text) AS payload_bytes, payload::text AS payload
FROM inventory ORDER BY category;
