const env = require('../config/env');
const { query } = require('../config/database');
const { confirmMembershipCheckout } = require('../services/membership.service');
const { moveJobToDeadLetter } = require('../services/worker-ops.service');

async function claimReconciliationJob() {
  const result = await query(
    `
    WITH candidate AS (
      SELECT id
      FROM payment_reconciliation_jobs
      WHERE status = 'pending'
        AND run_at <= NOW()
        AND attempts < max_attempts
      ORDER BY run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE payment_reconciliation_jobs j
    SET status = 'processing',
        attempts = attempts + 1,
        updated_at = NOW()
    FROM candidate
    WHERE j.id = candidate.id
    RETURNING j.*
    `
  );

  return result.rows[0] || null;
}

async function markJobCompleted(jobId, resultPayload) {
  await query(
    `
    UPDATE payment_reconciliation_jobs
    SET status = 'completed',
        result = $2::jsonb,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, JSON.stringify(resultPayload)]
  );
}

async function rescheduleJob(jobId, errorMessage, retryMinutes = 2) {
  await query(
    `
    UPDATE payment_reconciliation_jobs
    SET status = 'pending',
        last_error = $2,
        run_at = NOW() + ($3::int || ' minutes')::interval,
        updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, errorMessage.slice(0, 1000), retryMinutes]
  );
}

async function markJobFailed(jobId, errorMessage) {
  await query(
    `
    UPDATE payment_reconciliation_jobs
    SET status = 'failed',
        last_error = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, errorMessage.slice(0, 1000)]
  );

  await moveJobToDeadLetter('payment_reconciliation_jobs', jobId, { jobId }, errorMessage);
}

async function processReconciliationJob(job) {
  const paymentResult = await query(
    `
    SELECT id, status, created_at
    FROM payments
    WHERE id = $1
    LIMIT 1
    `,
    [job.payment_id]
  );

  const payment = paymentResult.rows[0];
  if (!payment) {
    await markJobFailed(job.id, 'Payment not found for reconciliation job.');
    return;
  }

  if (payment.status === 'captured') {
    await markJobCompleted(job.id, { skipped: true, reason: 'payment_already_captured' });
    return;
  }

  const ageResult = await query(
    `
    SELECT EXTRACT(EPOCH FROM (NOW() - $1::timestamptz)) / 60 AS age_minutes
    `,
    [payment.created_at]
  );
  const ageMinutes = Number(ageResult.rows[0]?.age_minutes || 0);

  if (job.gateway_provider === 'mock' && ageMinutes >= env.paymentReconciliationCaptureAfterMinutes) {
    const gatewayPaymentId = `recon_mockpay_${job.id.slice(0, 8)}`;
    await confirmMembershipCheckout(job.landlord_user_id, {
      gatewayOrderId: job.gateway_order_id,
      gatewayPaymentId
    });

    await markJobCompleted(job.id, {
      autoCaptured: true,
      gatewayPaymentId,
      reconciledAt: new Date().toISOString()
    });

    return;
  }

  if (job.gateway_provider !== 'mock') {
    await rescheduleJob(job.id, 'External provider reconciliation pending webhook callback.', 5);
    return;
  }

  await rescheduleJob(job.id, 'Payment too recent for auto-capture window.', 1);
}

async function processPaymentReconciliationJobs(batchSize = 10) {
  let processed = 0;

  for (let i = 0; i < batchSize; i += 1) {
    const job = await claimReconciliationJob();
    if (!job) {
      break;
    }

    try {
      await processReconciliationJob(job);
      processed += 1;
    } catch (error) {
      const willRetry = job.attempts < job.max_attempts;
      if (willRetry) {
        await rescheduleJob(job.id, error.message || 'Payment reconciliation failed', 2);
      } else {
        await markJobFailed(job.id, error.message || 'Payment reconciliation failed');
      }
    }
  }

  return { processed };
}

module.exports = {
  processPaymentReconciliationJobs
};
