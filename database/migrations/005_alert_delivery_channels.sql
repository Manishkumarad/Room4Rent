-- 005_alert_delivery_channels.sql
-- Delivery tracking for email, WhatsApp, and in-app alert channels

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES student_alerts(id) ON DELETE CASCADE,
    channel VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    response_code INT,
    provider_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (channel IN ('email', 'whatsapp', 'in_app')),
    CHECK (status IN ('sent', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_alert_deliveries_alert ON alert_deliveries(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_deliveries_channel_status ON alert_deliveries(channel, status, created_at DESC);
