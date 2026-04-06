-- 008_worker_observability.sql
-- Adds worker heartbeat, dead-letter tracking, and alert event state.

CREATE TABLE IF NOT EXISTS worker_heartbeats (
    worker_name VARCHAR(80) PRIMARY KEY,
    last_tick_started_at TIMESTAMPTZ,
    last_tick_finished_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_worker_heartbeats_updated_at
BEFORE UPDATE ON worker_heartbeats
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_name VARCHAR(80) NOT NULL,
    job_id UUID NOT NULL,
    payload JSONB,
    error_message TEXT,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(queue_name, job_id)
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_queue_failed_at
ON dead_letter_jobs(queue_name, failed_at DESC);

CREATE TABLE IF NOT EXISTS worker_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_key VARCHAR(120) NOT NULL UNIQUE,
    last_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trigger_count INT NOT NULL DEFAULT 1,
    last_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_worker_alert_events_updated_at
BEFORE UPDATE ON worker_alert_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
