-- 001_init_schema.sql
-- Room Rental Platform schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Enums ----------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'landlord', 'admin');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status') THEN
        CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'listing_status') THEN
        CREATE TYPE listing_status AS ENUM ('draft', 'pending_verification', 'active', 'inactive', 'rejected');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
        CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'expired');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
        CREATE TYPE payment_status AS ENUM ('created', 'authorized', 'captured', 'failed', 'refunded');
    END IF;
END
$$;

-- ---------- Timestamps trigger ----------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- Users ----------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role user_role NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    phone VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS students (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    university_name VARCHAR(160),
    course_name VARCHAR(160),
    year_of_study SMALLINT CHECK (year_of_study BETWEEN 1 AND 8),
    budget_min NUMERIC(10,2) CHECK (budget_min >= 0),
    budget_max NUMERIC(10,2) CHECK (budget_max >= 0),
    preferred_gender VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max)
);

CREATE TRIGGER trg_students_updated_at
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS landlords (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(160),
    verification_status verification_status NOT NULL DEFAULT 'pending',
    avg_rating NUMERIC(3,2) DEFAULT 0 CHECK (avg_rating >= 0 AND avg_rating <= 5),
    total_listings INT NOT NULL DEFAULT 0 CHECK (total_listings >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_landlords_updated_at
BEFORE UPDATE ON landlords
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS landlord_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landlord_user_id UUID NOT NULL REFERENCES landlords(user_id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_landlord_docs_landlord ON landlord_documents(landlord_user_id);

CREATE TRIGGER trg_landlord_documents_updated_at
BEFORE UPDATE ON landlord_documents
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Locality + Listing ----------
CREATE TABLE IF NOT EXISTS localities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80) NOT NULL,
    locality_name VARCHAR(120) NOT NULL,
    pincode VARCHAR(12),
    safety_score NUMERIC(4,2),
    transport_score NUMERIC(4,2),
    avg_rent NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(city, locality_name)
);

CREATE INDEX IF NOT EXISTS idx_localities_city ON localities(city);

CREATE TRIGGER trg_localities_updated_at
BEFORE UPDATE ON localities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landlord_user_id UUID NOT NULL REFERENCES landlords(user_id) ON DELETE CASCADE,
    locality_id UUID NOT NULL REFERENCES localities(id),
    title VARCHAR(180) NOT NULL,
    description TEXT,
    address_line1 VARCHAR(255) NOT NULL,
    monthly_rent NUMERIC(10,2) NOT NULL CHECK (monthly_rent >= 0),
    security_deposit NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
    room_type VARCHAR(30) NOT NULL,
    furnishing_type VARCHAR(30),
    tenant_gender_preference VARCHAR(20),
    available_from DATE,
    latitude NUMERIC(9,6),
    longitude NUMERIC(9,6),
    status listing_status NOT NULL DEFAULT 'draft',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    view_count INT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_search ON listings(status, monthly_rent, locality_id);
CREATE INDEX IF NOT EXISTS idx_listings_landlord ON listings(landlord_user_id);

CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id);

CREATE TABLE IF NOT EXISTS listing_immersive_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL UNIQUE REFERENCES listings(id) ON DELETE CASCADE,
    source_provider VARCHAR(60),
    asset_url TEXT,
    confidence_score NUMERIC(5,2),
    processing_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_listing_immersive_assets_updated_at
BEFORE UPDATE ON listing_immersive_assets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Amenities ----------
CREATE TABLE IF NOT EXISTS amenities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    label VARCHAR(80) NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_amenities (
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    amenity_id UUID NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
    PRIMARY KEY (listing_id, amenity_id)
);

-- ---------- Roommate matching ----------
CREATE TABLE IF NOT EXISTS roommate_profiles (
    student_user_id UUID PRIMARY KEY REFERENCES students(user_id) ON DELETE CASCADE,
    sleep_schedule VARCHAR(30),
    food_preference VARCHAR(30),
    smoking_preference VARCHAR(20),
    study_noise_preference VARCHAR(30),
    bio TEXT,
    is_opted_in BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_roommate_profiles_updated_at
BEFORE UPDATE ON roommate_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS roommate_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id_a UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    student_user_id_b UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    compatibility_score NUMERIC(5,2) NOT NULL CHECK (compatibility_score >= 0 AND compatibility_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(student_user_id_a, student_user_id_b),
    CHECK (student_user_id_a <> student_user_id_b)
);

-- ---------- Membership + Billing ----------
CREATE TABLE IF NOT EXISTS membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    monthly_price NUMERIC(10,2) NOT NULL CHECK (monthly_price >= 0),
    listing_boost_quota INT NOT NULL DEFAULT 0 CHECK (listing_boost_quota >= 0),
    lead_quota INT NOT NULL DEFAULT 0 CHECK (lead_quota >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_membership_plans_updated_at
BEFORE UPDATE ON membership_plans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS landlord_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landlord_user_id UUID NOT NULL REFERENCES landlords(user_id) ON DELETE CASCADE,
    membership_plan_id UUID NOT NULL REFERENCES membership_plans(id),
    status subscription_status NOT NULL DEFAULT 'active',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_landlord_subscriptions_landlord ON landlord_subscriptions(landlord_user_id, status);

CREATE TRIGGER trg_landlord_subscriptions_updated_at
BEFORE UPDATE ON landlord_subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_user_id UUID NOT NULL REFERENCES users(id),
    subscription_id UUID REFERENCES landlord_subscriptions(id),
    gateway_provider VARCHAR(30) NOT NULL,
    gateway_order_id VARCHAR(120) NOT NULL UNIQUE,
    gateway_payment_id VARCHAR(120),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    status payment_status NOT NULL DEFAULT 'created',
    idempotency_key VARCHAR(120) UNIQUE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_user_id, created_at DESC);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gateway_provider VARCHAR(30) NOT NULL,
    gateway_event_id VARCHAR(120) NOT NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    status VARCHAR(30) NOT NULL DEFAULT 'received',
    UNIQUE(gateway_provider, gateway_event_id)
);

-- ---------- Chat ----------
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_listing ON conversations(listing_id);

CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS conversation_participants (
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users(id),
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    body TEXT,
    attachment_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at ON messages(conversation_id, sent_at DESC);

-- ---------- Engagement ----------
CREATE TABLE IF NOT EXISTS saved_listings (
    student_user_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS listing_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    message TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_inquiries_listing ON listing_inquiries(listing_id, created_at DESC);

CREATE TRIGGER trg_listing_inquiries_updated_at
BEFORE UPDATE ON listing_inquiries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- Audit ----------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
