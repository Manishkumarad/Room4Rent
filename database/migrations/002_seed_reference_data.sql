-- 002_seed_reference_data.sql
-- Seed reference data needed by product features

INSERT INTO membership_plans (code, name, monthly_price, listing_boost_quota, lead_quota)
VALUES
    ('FREE', 'Free', 0, 0, 15),
    ('PRO', 'Pro', 999, 10, 80),
    ('PREMIUM', 'Premium', 2499, 40, 300)
ON CONFLICT (code) DO NOTHING;

INSERT INTO amenities (code, label)
VALUES
    ('wifi', 'Wi-Fi'),
    ('ac', 'Air Conditioning'),
    ('geyser', 'Geyser'),
    ('laundry', 'Laundry'),
    ('parking', 'Parking'),
    ('cctv', 'CCTV'),
    ('power_backup', 'Power Backup'),
    ('water_purifier', 'Water Purifier'),
    ('study_table', 'Study Table')
ON CONFLICT (code) DO NOTHING;

-- Starter locality records for pilot launch examples
INSERT INTO localities (city, state, locality_name, pincode, safety_score, transport_score, avg_rent)
VALUES
    ('Indore', 'Madhya Pradesh', 'Vijay Nagar', '452010', 8.1, 8.4, 8500),
    ('Bhopal', 'Madhya Pradesh', 'MP Nagar', '462011', 7.8, 8.0, 7800),
    ('Nagpur', 'Maharashtra', 'Dharampeth', '440010', 8.0, 7.7, 9000),
    ('Jaipur', 'Rajasthan', 'Malviya Nagar', '302017', 8.2, 8.1, 9200)
ON CONFLICT (city, locality_name) DO NOTHING;
