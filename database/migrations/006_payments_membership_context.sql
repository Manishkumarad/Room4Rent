-- 006_payments_membership_context.sql
-- Add explicit membership context to payments for robust subscription fulfillment

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS membership_plan_id UUID REFERENCES membership_plans(id),
ADD COLUMN IF NOT EXISTS landlord_user_id UUID REFERENCES landlords(user_id);

CREATE INDEX IF NOT EXISTS idx_payments_membership_plan ON payments(membership_plan_id);
CREATE INDEX IF NOT EXISTS idx_payments_landlord ON payments(landlord_user_id, created_at DESC);
