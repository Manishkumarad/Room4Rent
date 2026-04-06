const request = require('supertest');
const app = require('../src/app');
const { query } = require('../src/config/database');

function uniquePhone(seed) {
  const n = Date.now().toString().slice(-6);
  return `91${seed}${n}`.slice(0, 12);
}

describe('API E2E coverage', () => {
  const state = {};

  it('covers auth, profile, listings, verification, membership, student, chat, engagement, immersive, admin, dashboard', async () => {
    const locality = await query('SELECT id FROM localities ORDER BY created_at ASC LIMIT 1');
    expect(locality.rows[0]).toBeTruthy();
    state.localityId = locality.rows[0].id;

    const landlordPayload = {
      role: 'landlord',
      fullName: 'E2E Landlord',
      phone: uniquePhone('88'),
      email: `landlord_${Date.now()}@test.local`,
      password: 'StrongPass123!',
      profile: { businessName: 'E2E Estates' }
    };
    const studentPayload = {
      role: 'student',
      fullName: 'E2E Student',
      phone: uniquePhone('77'),
      email: `student_${Date.now()}@test.local`,
      password: 'StrongPass123!',
      profile: { budgetMin: 5000, budgetMax: 12000, preferredGender: 'female' }
    };
    const adminPayload = {
      role: 'admin',
      fullName: 'E2E Admin',
      phone: uniquePhone('66'),
      email: `admin_${Date.now()}@test.local`,
      password: 'StrongPass123!'
    };

    const regLandlord = await request(app).post('/api/auth/register').send(landlordPayload);
    const regStudent = await request(app).post('/api/auth/register').send(studentPayload);
    const regAdmin = await request(app).post('/api/auth/register').send(adminPayload);

    expect(regLandlord.status).toBe(201);
    expect(regStudent.status).toBe(201);
    expect(regAdmin.status).toBe(201);

    state.landlordToken = regLandlord.body.accessToken;
    state.studentToken = regStudent.body.accessToken;
    state.adminToken = regAdmin.body.accessToken;
    state.landlordId = regLandlord.body.user.id;
    state.studentId = regStudent.body.user.id;

    const profileMe = await request(app)
      .get('/api/profile/me')
      .set('Authorization', `Bearer ${state.landlordToken}`);
    expect(profileMe.status).toBe(200);

    const createListing = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({
        localityId: state.localityId,
        title: 'E2E Listing',
        description: 'E2E listing description',
        addressLine1: '123 Test Street',
        monthlyRent: 9000,
        securityDeposit: 9000,
        roomType: 'single',
        furnishingType: 'semi-furnished',
        tenantGenderPreference: 'female',
        status: 'active'
      });

    expect(createListing.status).toBe(201);
    state.listingId = createListing.body.listing.id;

    const searchListings = await request(app).get('/api/listings?status=active&limit=5');
    expect(searchListings.status).toBe(200);

    const submitVerification = await request(app)
      .post(`/api/verifications/listings/${state.listingId}/submit`)
      .set('Authorization', `Bearer ${state.landlordToken}`);
    expect(submitVerification.status).toBe(200);

    const adminReviewListing = await request(app)
      .patch(`/api/admin/verifications/listings/${state.listingId}`)
      .set('Authorization', `Bearer ${state.adminToken}`)
      .send({ status: 'active', isVerified: true });
    expect(adminReviewListing.status).toBe(200);

    const membershipPlans = await request(app).get('/api/memberships/plans');
    expect(membershipPlans.status).toBe(200);

    const createCheckout = await request(app)
      .post('/api/memberships/checkout')
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({ planCode: 'PRO', provider: 'mock' });
    expect(createCheckout.status).toBe(201);

    const confirmCheckout = await request(app)
      .post('/api/memberships/checkout/confirm')
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({
        gatewayOrderId: createCheckout.body.payment.gatewayOrderId,
        gatewayPaymentId: `pay_${Date.now()}`
      });
    expect(confirmCheckout.status).toBe(200);

    const studentDiscovery = await request(app)
      .get('/api/students/listings/search')
      .set('Authorization', `Bearer ${state.studentToken}`);
    expect(studentDiscovery.status).toBe(200);

    const roommateUpdate = await request(app)
      .put('/api/students/roommates/me')
      .set('Authorization', `Bearer ${state.studentToken}`)
      .send({ isOptedIn: true, bio: 'prefers quiet study environment' });
    expect(roommateUpdate.status).toBe(200);

    const createSavedSearch = await request(app)
      .post('/api/students/saved-searches')
      .set('Authorization', `Bearer ${state.studentToken}`)
      .send({ name: 'E2E Search', filters: { city: 'Indore', maxBudget: 12000 } });
    expect(createSavedSearch.status).toBe(201);

    const createConversation = await request(app)
      .post('/api/chats/conversations')
      .set('Authorization', `Bearer ${state.studentToken}`)
      .send({ participantUserId: state.landlordId, listingId: state.listingId, initialMessage: 'Interested in viewing this place.' });
    expect([200, 201]).toContain(createConversation.status);
    state.conversationId = createConversation.body.conversation.id;

    const sendMessage = await request(app)
      .post(`/api/chats/conversations/${state.conversationId}/messages`)
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({ body: 'Sure, available tomorrow evening.' });
    expect(sendMessage.status).toBe(201);

    const saveListing = await request(app)
      .post(`/api/engagement/saved-listings/${state.listingId}`)
      .set('Authorization', `Bearer ${state.studentToken}`);
    expect([200, 201]).toContain(saveListing.status);

    const createInquiry = await request(app)
      .post(`/api/engagement/listings/${state.listingId}/inquiries`)
      .set('Authorization', `Bearer ${state.studentToken}`)
      .send({ message: 'Can I visit this weekend?' });
    expect(createInquiry.status).toBe(201);

    const updateInquiry = await request(app)
      .patch(`/api/engagement/inquiries/${createInquiry.body.inquiry.id}/status`)
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({ status: 'responded' });
    expect(updateInquiry.status).toBe(200);

    const requestImmersive = await request(app)
      .post(`/api/immersive/listings/${state.listingId}/generate`)
      .set('Authorization', `Bearer ${state.landlordToken}`)
      .send({ sourceProvider: 'synthetic-360' });
    expect(requestImmersive.status).toBe(202);

    const updateImmersive = await request(app)
      .patch(`/api/immersive/listings/${state.listingId}/status`)
      .set('Authorization', `Bearer ${state.adminToken}`)
      .send({ processingStatus: 'ready', assetUrl: 'https://cdn.example.com/e2e.glb', confidenceScore: 96.5 });
    expect(updateImmersive.status).toBe(200);

    const adminAuditLogs = await request(app)
      .get('/api/admin/audit-logs?limit=5')
      .set('Authorization', `Bearer ${state.adminToken}`);
    expect(adminAuditLogs.status).toBe(200);

    const adminOverview = await request(app)
      .get('/api/dashboard/admin/overview')
      .set('Authorization', `Bearer ${state.adminToken}`);
    expect(adminOverview.status).toBe(200);

    const landlordDash = await request(app)
      .get('/api/dashboard/landlord/me')
      .set('Authorization', `Bearer ${state.landlordToken}`);
    expect(landlordDash.status).toBe(200);

    const studentDash = await request(app)
      .get('/api/dashboard/student/me')
      .set('Authorization', `Bearer ${state.studentToken}`);
    expect(studentDash.status).toBe(200);
  });
});
