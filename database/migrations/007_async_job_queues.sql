-- 007_async_job_queues.sql
-- Adds async job queues for immersive generation and payment reconciliation.

CREATE TABLE IF NOT EXISTS immersive_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id),
    source_provider VARCHAR(60) NOT NULL DEFAULT 'internal-ai',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_immersive_jobs_status_run_at
ON immersive_generation_jobs(status, run_at);

CREATE TABLE IF NOT EXISTS payment_reconciliation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    gateway_provider VARCHAR(30) NOT NULL,
    gateway_order_id VARCHAR(120) NOT NULL,
    landlord_user_id UUID REFERENCES landlords(user_id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(payment_id),
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_jobs_status_run_at
ON payment_reconciliation_jobs(status, run_at);

CREATE TRIGGER trg_immersive_generation_jobs_updated_at
BEFORE UPDATE ON immersive_generation_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_payment_reconciliation_jobs_updated_at
BEFORE UPDATE ON payment_reconciliation_jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
