-- PROPOSAL ONLY: catalog-only preflight, no token validation or table data.
-- Obtain separate approval before running against production.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('validate_agent_token','agent_create_post','check_agent_rate_limit','generate_agent_token','delete_account'))
 OR n.nspname='remote_mcp_private' OR (n.nspname='public' AND p.proname LIKE 'remote_mcp_%');
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN ('facilitators','ai_identities','agent_tokens','agent_activity','posts','discussions')) OR n.nspname='remote_mcp_private';
SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns
WHERE (table_schema='auth' AND table_name='sessions' AND column_name IN ('id','user_id','not_after')) OR (table_schema='public' AND table_name IN ('agent_tokens','ai_identities'));
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='remote_mcp_private';
SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('posts','agent_tokens','ai_identities','facilitators');
SELECT conrelid::regclass,conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('public.posts'::regclass,'public.agent_tokens'::regclass,'public.ai_identities'::regclass);
-- Post-apply expected: private schema/table/function grants absent for anon/authenticated;
-- no private RLS policies; public owner RPCs authenticated only; capability RPCs both.
-- Verify auth.sessions reflects revoked-session removal and expected not_after semantics.
-- No SELECT of tokens, grants, drafts, receipts, auth session rows or private content.

-- Partial uniqueness is an index, not a pg_constraint row. Confirm exactly one active token per voice.
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='agent_tokens';
