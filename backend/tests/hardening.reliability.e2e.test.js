const { query } = require('../src/config/database');
const { processImmersiveGenerationJobs } = require('../src/workers/immersive.worker');
const { processPaymentReconciliationJobs } = require('../src/workers/payment-reconciliation.worker');

function uniqueValue(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

async function createLandlord() {
  const phone = `${Math.floor(8000000000 + Math.random() * 999999999)}`;
  const email = `${uniqueValue('landlord')}@test.local`;

  const userResult = await query(
    `
    INSERT INTO users (role, full_name, phone, email, password_hash, is_phone_verified)
    VALUES ('landlord', $1, $2, $3, 'x', TRUE)
    RETURNING id
    `,
    [uniqueValue('Hardening Landlord'), phone, email]
  );

  const userId = userResult.rows[0].id;
  await query(
    `
    INSERT INTO landlords (user_id, business_name, verification_status)
    VALUES ($1, $2, 'verified')
    `,
    [userId, uniqueValue('Hardening Realty')]
  );

  return userId;
}

async function createListing(landlordUserId) {
  const localityResult = await query('SELECT id FROM localities ORDER BY created_at ASC LIMIT 1');
  const localityId = localityResult.rows[0].id;

  const listingResult = await query(
    `
    INSERT INTO listings (
      landlord_user_id,
      locality_id,
      title,
      description,
      address_line1,
      monthly_rent,
      security_deposit,
      room_type,
      status,
      is_verified
    )
    VALUES ($1, $2, $3, 'hardening listing', '99 Test Lane', 9500, 9500, 'single', 'active', TRUE)
    RETURNING id
    `,
    [landlordUserId, localityId, uniqueValue('Hardening Listing')]
  );

  return listingResult.rows[0].id;
}

describe('Hardening reliability tests', () => {
  it('reschedules non-mock reconciliation jobs with backoff metadata', async () => {
    const landlordUserId = await createLandlord();

    const paymentResult = await query(
      `
      INSERT INTO payments (
        payer_user_id,
        gateway_provider,
        gateway_order_id,
        amount,
        currency,
        status,
        idempotency_key,
        landlord_user_id,
        membership_plan_id,
        created_at
      )
      VALUES ($1, 'razorpay', $2, 999, 'INR', 'created', $3, $1,
        (SELECT id FROM membership_plans WHERE code = 'PRO' LIMIT 1), NOW() - interval '10 minutes')
      RETURNING id, gateway_order_id
      `,
      [landlordUserId, uniqueValue('rzp_order'), uniqueValue('idempotency')]
    );

    const paymentId = paymentResult.rows[0].id;

    await query(
      `
      INSERT INTO payment_reconciliation_jobs (
        payment_id,
        gateway_provider,
        gateway_order_id,
        landlord_user_id,
        status,
        attempts,
        max_attempts,
        run_at,
        payload
      )
      VALUES ($1, 'razorpay', $2, $3, 'pending', 0, 3, NOW(), $4::jsonb)
      ON CONFLICT (payment_id) DO NOTHING
      `,
      [paymentId, paymentResult.rows[0].gateway_order_id, landlordUserId, JSON.stringify({ reason: 'backoff-test' })]
    );

    for (let i = 0; i < 5; i += 1) {
      await processPaymentReconciliationJobs(100);

      const check = await query(
        `
        SELECT attempts
        FROM payment_reconciliation_jobs
        WHERE payment_id = $1
        LIMIT 1
        `,
        [paymentId]
      );

      if (Number(check.rows[0]?.attempts || 0) > 0) {
        break;
      }
    }

    const jobState = await query(
      `
      SELECT status, attempts, last_error, run_at > NOW() AS moved_to_future
      FROM payment_reconciliation_jobs
      WHERE payment_id = $1
      LIMIT 1
      `,
      [paymentId]
    );

    expect(jobState.rows[0].status).toBe('pending');
    expect(Number(jobState.rows[0].attempts)).toBeGreaterThanOrEqual(1);
    expect(String(jobState.rows[0].last_error || '')).toContain('pending webhook callback');
    expect(jobState.rows[0].moved_to_future).toBe(true);
  });

  it('moves exhausted failed reconciliation job to dead letter', async () => {
    const landlordUserId = await createLandlord();

    const paymentResult = await query(
      `
      INSERT INTO payments (
        payer_user_id,
        gateway_provider,
        gateway_order_id,
        amount,
        currency,
        status,
        idempotency_key,
        landlord_user_id,
        membership_plan_id,
        created_at
      )
      VALUES ($1, 'mock', $2, 999, 'INR', 'created', $3, $1,
        (SELECT id FROM membership_plans WHERE code = 'PRO' LIMIT 1), NOW() - interval '20 minutes')
      RETURNING id, gateway_order_id
      `,
      [landlordUserId, uniqueValue('mock_order_fail'), uniqueValue('idempotency_fail')]
    );

    const paymentId = paymentResult.rows[0].id;

    await query(
      `
      INSERT INTO payment_reconciliation_jobs (
        payment_id,
        gateway_provider,
        gateway_order_id,
        landlord_user_id,
        status,
        attempts,
        max_attempts,
        run_at,
        payload
      )
      VALUES ($1, 'mock', $2, NULL, 'pending', 0, 2, NOW(), $3::jsonb)
      ON CONFLICT (payment_id) DO NOTHING
      `,
      [paymentId, paymentResult.rows[0].gateway_order_id, JSON.stringify({ reason: 'dead-letter-test' })]
    );

    for (let i = 0; i < 6; i += 1) {
      await processPaymentReconciliationJobs(100);
      const check = await query(
        `
        SELECT status, attempts
        FROM payment_reconciliation_jobs
        WHERE payment_id = $1
        LIMIT 1
        `,
        [paymentId]
      );

      if (check.rows[0]?.status === 'failed') {
        break;
      }

      if (check.rows[0]?.status === 'pending' && Number(check.rows[0]?.attempts || 0) >= 1) {
        await query(
          `
          UPDATE payment_reconciliation_jobs
          SET run_at = NOW()
          WHERE payment_id = $1
          `,
          [paymentId]
        );
      }
    }

    const jobState = await query(
      `
      SELECT id, status, attempts
      FROM payment_reconciliation_jobs
      WHERE payment_id = $1
      LIMIT 1
      `,
      [paymentId]
    );

    expect(jobState.rows[0].status).toBe('failed');
    expect(Number(jobState.rows[0].attempts)).toBeGreaterThanOrEqual(2);

    const deadLetter = await query(
      `
      SELECT queue_name, job_id
      FROM dead_letter_jobs
      WHERE queue_name = 'payment_reconciliation_jobs'
        AND job_id = $1
      LIMIT 1
      `,
      [jobState.rows[0].id]
    );

    expect(deadLetter.rows[0]).toBeTruthy();
  });

  it('claims immersive jobs safely under concurrent workers', async () => {
    const landlordUserId = await createLandlord();
    const listingA = await createListing(landlordUserId);
    const listingB = await createListing(landlordUserId);

    await query(
      `
      INSERT INTO immersive_generation_jobs (
        listing_id,
        requested_by,
        source_provider,
        status,
        attempts,
        max_attempts,
        run_at,
        payload
      )
      VALUES
        ($1, $3, 'concurrency-test', 'pending', 0, 5, NOW(), '{"k":"a"}'::jsonb),
        ($2, $3, 'concurrency-test', 'pending', 0, 5, NOW(), '{"k":"b"}'::jsonb)
      `,
      [listingA, listingB, landlordUserId]
    );

    const [r1, r2] = await Promise.all([
      processImmersiveGenerationJobs(1),
      processImmersiveGenerationJobs(1)
    ]);

    await processImmersiveGenerationJobs(10);
    expect(r1.processed + r2.processed).toBeGreaterThanOrEqual(1);

    const state = await query(
      `
      SELECT status, COUNT(*)::int AS count
      FROM immersive_generation_jobs
      WHERE listing_id = ANY($1::uuid[])
      GROUP BY status
      `,
      [[listingA, listingB]]
    );

    const map = new Map(state.rows.map((row) => [row.status, Number(row.count)]));
    expect(map.get('completed')).toBe(2);
    expect(map.get('processing') || 0).toBe(0);
    expect(map.get('pending') || 0).toBe(0);
  });
});
