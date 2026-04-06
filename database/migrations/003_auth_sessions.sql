-- 003_auth_sessions.sql
-- Refresh token sessions and phone OTP verification support

CREATE TABLE IF NOT EXISTS refresh_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_jti VARCHAR(80) NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_jti VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires ON refresh_sessions(expires_at);

CREATE TRIGGER trg_refresh_sessions_updated_at
BEFORE UPDATE ON refresh_sessions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS phone_verification_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts_left INT NOT NULL DEFAULT 5 CHECK (attempts_left >= 0),
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_otps_user ON phone_verification_otps(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_verification_otps(phone, expires_at DESC);

CREATE TRIGGER trg_phone_verification_otps_updated_at
BEFORE UPDATE ON phone_verification_otps
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
