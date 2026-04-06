-- 004_saved_searches_alerts.sql
-- Student saved searches and listing alerts

CREATE TABLE IF NOT EXISTS saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_alerted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_student_active ON saved_searches(student_user_id, is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_searches_filters_gin ON saved_searches USING GIN(filters);

CREATE TRIGGER trg_saved_searches_updated_at
BEFORE UPDATE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS student_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    saved_search_id UUID REFERENCES saved_searches(id) ON DELETE SET NULL,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    alert_type VARCHAR(40) NOT NULL DEFAULT 'new_listing',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(saved_search_id, listing_id, alert_type)
);

CREATE INDEX IF NOT EXISTS idx_student_alerts_student_created ON student_alerts(student_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_alerts_listing ON student_alerts(listing_id, created_at DESC);
