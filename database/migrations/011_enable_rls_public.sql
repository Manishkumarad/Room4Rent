-- 011_enable_rls_public.sql
-- Enables RLS for all public tables to satisfy Supabase linter rule 0013.
-- Adds a permissive service_role policy only when service_role exists.

DO $$
DECLARE
    rec RECORD;
    has_service_role BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'service_role'
    ) INTO has_service_role;

    FOR rec IN
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', rec.schemaname, rec.tablename);

        IF has_service_role THEN
            BEGIN
                EXECUTE format(
                    'CREATE POLICY %I ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
                    rec.tablename || '_service_role_all',
                    rec.schemaname,
                    rec.tablename
                );
            EXCEPTION
                WHEN duplicate_object THEN
                    NULL;
            END;
        END IF;
    END LOOP;
END
$$;
