const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/database');
const { processImmersiveGenerationJobs } = require('../src/workers/immersive.worker');
const { processPaymentReconciliationJobs } = require('../src/workers/payment-reconciliation.worker');

function uniquePhone(seed) {
  const n = Date.now().toString().slice(-6);
  return `92${seed}${n}`.slice(0, 12);
}

describe('Worker E2E coverage', () => {
  it('processes immersive and payment reconciliation queues', async () => {
    const locality = await query('SELECT id FROM localities ORDER BY created_at ASC LIMIT 1');

    const landlordReg = await request(app).post('/api/auth/register').send({
      role: 'landlord',
      fullName: 'Worker Landlord',
      phone: uniquePhone('55'),
      email: `worker_landlord_${Date.now()}@test.local`,
      password: 'StrongPass123!',
      profile: { businessName: 'Worker Realty' }
    });

    expect(landlordReg.status).toBe(201);
    const landlordToken = landlordReg.body.accessToken;

    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        localityId: locality.rows[0].id,
        title: 'Worker Listing',
        description: 'Worker listing',
        addressLine1: '77 Worker Road',
        monthlyRent: 9500,
        securityDeposit: 9500,
        roomType: 'single',
        status: 'active'
      });

    expect(listingRes.status).toBe(201);
    const listingId = listingRes.body.listing.id;

    const immersiveReq = await request(app)
      .post(`/api/immersive/listings/${listingId}/generate`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ sourceProvider: 'worker-test' });

    expect(immersiveReq.status).toBe(202);

    const plans = await request(app).get('/api/memberships/plans');
    expect(plans.status).toBe(200);

    const checkout = await request(app)
      .post('/api/memberships/checkout')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ planCode: 'PRO', provider: 'mock' });

    expect(checkout.status).toBe(201);

    const paymentId = checkout.body.payment.id;
    await query(
      "UPDATE payments SET created_at = NOW() - interval '5 minutes' WHERE id = $1",
      [paymentId]
    );

    const immersiveProcess = await processImmersiveGenerationJobs(10);
    const paymentProcess = await processPaymentReconciliationJobs(10);

    expect(immersiveProcess.processed).toBeGreaterThan(0);
    expect(paymentProcess.processed).toBeGreaterThan(0);

    const immersiveState = await query(
      'SELECT processing_status, asset_url FROM listing_immersive_assets WHERE listing_id = $1 LIMIT 1',
      [listingId]
    );

    expect(immersiveState.rows[0].processing_status).toBe('ready');
    expect(immersiveState.rows[0].asset_url).toBeTruthy();

    const paymentState = await query(
      'SELECT status, gateway_payment_id FROM payments WHERE id = $1 LIMIT 1',
      [paymentId]
    );

    expect(paymentState.rows[0].status).toBe('captured');
    expect(paymentState.rows[0].gateway_payment_id).toBeTruthy();
  });
});
