const crypto = require('crypto');
const { z } = require('zod');
const env = require('../config/env');
const { query, withTransaction } = require('../config/database');

const createCheckoutSchema = z.object({
  planCode: z.string().trim().min(2).max(40),
  provider: z.enum(['mock', 'razorpay']).default('mock')
});

const confirmCheckoutSchema = z.object({
  gatewayOrderId: z.string().trim().min(6),
  gatewayPaymentId: z.string().trim().min(4).optional(),
  razorpaySignature: z.string().trim().optional()
});

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureLandlord(userId) {
  const result = await query(
    `
    SELECT u.id, u.role, l.user_id AS landlord_user_id
    FROM users u
    LEFT JOIN landlords l ON l.user_id = u.id
    WHERE u.id = $1
    LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row || row.role !== 'landlord' || !row.landlord_user_id) {
    const error = new Error('Only landlords can access membership billing.');
    error.statusCode = 403;
    throw error;
  }
}

async function listMembershipPlans() {
  const result = await query(
    `
    SELECT id, code, name, monthly_price, listing_boost_quota, lead_quota, is_active, created_at, updated_at
    FROM membership_plans
    WHERE is_active = TRUE
    ORDER BY monthly_price ASC
    `
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      monthlyPrice: row.monthly_price,
      listingBoostQuota: row.listing_boost_quota,
      leadQuota: row.lead_quota,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  };
}

async function getMyMembership(landlordUserId) {
  await ensureLandlord(landlordUserId);

  const result = await query(
    `
    SELECT
      ls.id,
      ls.landlord_user_id,
      ls.membership_plan_id,
      ls.status,
      ls.starts_at,
      ls.ends_at,
      ls.auto_renew,
      ls.created_at,
      ls.updated_at,
      mp.code,
      mp.name,
      mp.monthly_price,
      mp.listing_boost_quota,
      mp.lead_quota
    FROM landlord_subscriptions ls
    JOIN membership_plans mp ON mp.id = ls.membership_plan_id
    WHERE ls.landlord_user_id = $1
    ORDER BY ls.created_at DESC
    LIMIT 1
    `,
    [landlordUserId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    landlordUserId: row.landlord_user_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    autoRenew: row.auto_renew,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    plan: {
      id: row.membership_plan_id,
      code: row.code,
      name: row.name,
      monthlyPrice: row.monthly_price,
      listingBoostQuota: row.listing_boost_quota,
      leadQuota: row.lead_quota
    }
  };
}

async function createRazorpayOrder({ amountInPaise, receipt }) {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new Error('Razorpay credentials are not configured.');
  }

  const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      payment_capture: 1
    })
  });

  const body = await response.text();
  if (!response.ok) {
    const err = new Error(`Razorpay order creation failed: ${body}`);
    err.statusCode = 502;
    throw err;
  }

  const parsed = JSON.parse(body);
  return {
    gatewayOrderId: parsed.id,
    raw: parsed
  };
}

async function createMembershipCheckout(landlordUserId, payload) {
  await ensureLandlord(landlordUserId);
  const data = createCheckoutSchema.parse(payload);

  const planResult = await query(
    `
    SELECT id, code, name, monthly_price, is_active
    FROM membership_plans
    WHERE code = $1
    LIMIT 1
    `,
    [data.planCode]
  );

  const plan = planResult.rows[0];
  if (!plan || !plan.is_active) {
    const error = new Error('Membership plan is not available.');
    error.statusCode = 404;
    throw error;
  }

  let gatewayOrderId;
  let providerMeta = null;

  if (data.provider === 'mock') {
    gatewayOrderId = `mock_order_${crypto.randomUUID()}`;
  } else {
    const amountInPaise = Math.round(Number(plan.monthly_price) * 100);
    const receipt = `sub_${landlordUserId.slice(0, 8)}_${Date.now()}`;
    const razorpayOrder = await createRazorpayOrder({ amountInPaise, receipt });
    gatewayOrderId = razorpayOrder.gatewayOrderId;
    providerMeta = {
      razorpayOrder: razorpayOrder.raw,
      keyId: env.razorpayKeyId
    };
  }

  const paymentResult = await query(
    `
    INSERT INTO payments (
      payer_user_id,
      subscription_id,
      gateway_provider,
      gateway_order_id,
      amount,
      currency,
      status,
      idempotency_key,
      membership_plan_id,
      landlord_user_id
    )
    VALUES ($1, NULL, $2, $3, $4, 'INR', 'created', $5, $6, $7)
    RETURNING id, payer_user_id, gateway_provider, gateway_order_id, amount, currency, status, created_at
    `,
    [
      landlordUserId,
      data.provider,
      gatewayOrderId,
      Number(plan.monthly_price),
      `checkout_${crypto.randomUUID()}`,
      plan.id,
      landlordUserId
    ]
  );

  await query(
    `
    INSERT INTO payment_reconciliation_jobs (
      payment_id,
      gateway_provider,
      gateway_order_id,
      landlord_user_id,
      status,
      run_at,
      payload
    )
    VALUES ($1, $2, $3, $4, 'pending', NOW(), $5::jsonb)
    ON CONFLICT (payment_id) DO NOTHING
    `,
    [
      paymentResult.rows[0].id,
      data.provider,
      gatewayOrderId,
      landlordUserId,
      JSON.stringify({ planCode: plan.code })
    ]
  );

  return {
    payment: {
      id: paymentResult.rows[0].id,
      provider: paymentResult.rows[0].gateway_provider,
      gatewayOrderId: paymentResult.rows[0].gateway_order_id,
      amount: paymentResult.rows[0].amount,
      currency: paymentResult.rows[0].currency,
      status: paymentResult.rows[0].status,
      createdAt: paymentResult.rows[0].created_at
    },
    plan: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      monthlyPrice: plan.monthly_price
    },
    checkout: {
      provider: data.provider,
      ...(providerMeta || {})
    }
  };
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!env.razorpayKeySecret) {
    return true;
  }

  if (!paymentId || !signature) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', env.razorpayKeySecret);
  hmac.update(`${orderId}|${paymentId}`);
  const expected = hmac.digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function confirmMembershipCheckout(landlordUserId, payload) {
  await ensureLandlord(landlordUserId);
  const data = confirmCheckoutSchema.parse(payload);

  return withTransaction(async (client) => {
    const paymentResult = await client.query(
      `
      SELECT id, payer_user_id, gateway_provider, gateway_order_id, gateway_payment_id, amount, currency, status, membership_plan_id, landlord_user_id
      FROM payments
      WHERE gateway_order_id = $1
      LIMIT 1
      `,
      [data.gatewayOrderId]
    );

    const payment = paymentResult.rows[0];
    if (!payment) {
      const error = new Error('Checkout order not found.');
      error.statusCode = 404;
      throw error;
    }

    if (payment.landlord_user_id !== landlordUserId) {
      const error = new Error('This checkout does not belong to you.');
      error.statusCode = 403;
      throw error;
    }

    if (payment.gateway_provider === 'razorpay') {
      const ok = verifyRazorpaySignature(data.gatewayOrderId, data.gatewayPaymentId, data.razorpaySignature);
      if (!ok) {
        const error = new Error('Invalid Razorpay payment signature.');
        error.statusCode = 400;
        throw error;
      }
    }

    if (payment.status === 'captured') {
      const existingSub = await client.query(
        `
        SELECT id, landlord_user_id, membership_plan_id, status, starts_at, ends_at, auto_renew, created_at, updated_at
        FROM landlord_subscriptions
        WHERE landlord_user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [landlordUserId]
      );

      return {
        payment: {
          id: payment.id,
          status: payment.status,
          gatewayOrderId: payment.gateway_order_id,
          gatewayPaymentId: payment.gateway_payment_id,
          amount: payment.amount,
          currency: payment.currency
        },
        subscription: existingSub.rows[0] || null
      };
    }

    await client.query(
      `
      UPDATE landlord_subscriptions
      SET status = 'expired'
      WHERE landlord_user_id = $1
        AND status = 'active'
      `,
      [landlordUserId]
    );

    const startsAt = new Date();
    const endsAt = daysFromNow(30);

    const subscriptionResult = await client.query(
      `
      INSERT INTO landlord_subscriptions (
        landlord_user_id,
        membership_plan_id,
        status,
        starts_at,
        ends_at,
        auto_renew
      )
      VALUES ($1, $2, 'active', $3, $4, TRUE)
      RETURNING id, landlord_user_id, membership_plan_id, status, starts_at, ends_at, auto_renew, created_at, updated_at
      `,
      [landlordUserId, payment.membership_plan_id, startsAt, endsAt]
    );

    const subscription = subscriptionResult.rows[0];

    const updatedPaymentResult = await client.query(
      `
      UPDATE payments
      SET status = 'captured',
          gateway_payment_id = COALESCE($2, gateway_payment_id),
          paid_at = NOW(),
          subscription_id = $3
      WHERE id = $1
      RETURNING id, payer_user_id, gateway_provider, gateway_order_id, gateway_payment_id, amount, currency, status, paid_at
      `,
      [payment.id, data.gatewayPaymentId || null, subscription.id]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'membership_checkout_confirmed', 'payments', $2, $3::jsonb)
      `,
      [
        landlordUserId,
        payment.id,
        JSON.stringify({
          provider: payment.gateway_provider,
          gatewayOrderId: payment.gateway_order_id,
          subscriptionId: subscription.id
        })
      ]
    );

    return {
      payment: {
        id: updatedPaymentResult.rows[0].id,
        provider: updatedPaymentResult.rows[0].gateway_provider,
        gatewayOrderId: updatedPaymentResult.rows[0].gateway_order_id,
        gatewayPaymentId: updatedPaymentResult.rows[0].gateway_payment_id,
        amount: updatedPaymentResult.rows[0].amount,
        currency: updatedPaymentResult.rows[0].currency,
        status: updatedPaymentResult.rows[0].status,
        paidAt: updatedPaymentResult.rows[0].paid_at
      },
      subscription: {
        id: subscription.id,
        landlordUserId: subscription.landlord_user_id,
        membershipPlanId: subscription.membership_plan_id,
        status: subscription.status,
        startsAt: subscription.starts_at,
        endsAt: subscription.ends_at,
        autoRenew: subscription.auto_renew,
        createdAt: subscription.created_at,
        updatedAt: subscription.updated_at
      }
    };
  });
}

async function handlePaymentWebhook(provider, body, headers = {}) {
  const eventId = String(body?.eventId || body?.id || body?.payload?.payment?.entity?.id || crypto.randomUUID());

  try {
    await query(
      `
      INSERT INTO payment_webhook_events (gateway_provider, gateway_event_id, event_type, payload, status, processed_at)
      VALUES ($1, $2, $3, $4::jsonb, 'processed', NOW())
      `,
      [provider, eventId, String(body?.event || body?.type || 'unknown'), JSON.stringify(body)]
    );
  } catch (error) {
    if (error.code !== '23505') {
      throw error;
    }
  }

  if (provider === 'razorpay' && body?.event === 'payment.captured') {
    const orderId = body?.payload?.payment?.entity?.order_id;
    const paymentId = body?.payload?.payment?.entity?.id;

    if (orderId) {
      const paymentResult = await query(
        `
        SELECT id, landlord_user_id
        FROM payments
        WHERE gateway_order_id = $1
        LIMIT 1
        `,
        [orderId]
      );

      const row = paymentResult.rows[0];
      if (row?.landlord_user_id) {
        await confirmMembershipCheckout(row.landlord_user_id, {
          gatewayOrderId: orderId,
          gatewayPaymentId: paymentId
        });
      }
    }
  }

  return { processed: true };
}

module.exports = {
  listMembershipPlans,
  getMyMembership,
  createMembershipCheckout,
  confirmMembershipCheckout,
  handlePaymentWebhook
};
