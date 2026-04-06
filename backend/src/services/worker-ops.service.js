const env = require('../config/env');
const { query } = require('../config/database');

async function upsertWorkerHeartbeat(workerName, patch = {}) {
  await query(
    `
    INSERT INTO worker_heartbeats (
      worker_name,
      last_tick_started_at,
      last_tick_finished_at,
      last_seen_at,
      last_error,
      meta
    )
    VALUES ($1, $2, $3, NOW(), $4, $5::jsonb)
    ON CONFLICT (worker_name)
    DO UPDATE SET
      last_tick_started_at = COALESCE(EXCLUDED.last_tick_started_at, worker_heartbeats.last_tick_started_at),
      last_tick_finished_at = COALESCE(EXCLUDED.last_tick_finished_at, worker_heartbeats.last_tick_finished_at),
      last_seen_at = NOW(),
      last_error = EXCLUDED.last_error,
      meta = COALESCE(EXCLUDED.meta, worker_heartbeats.meta),
      updated_at = NOW()
    `,
    [
      workerName,
      patch.lastTickStartedAt || null,
      patch.lastTickFinishedAt || null,
      patch.lastError || null,
      patch.meta ? JSON.stringify(patch.meta) : null
    ]
  );
}

async function moveJobToDeadLetter(queueName, jobId, payload, errorMessage) {
  await query(
    `
    INSERT INTO dead_letter_jobs (queue_name, job_id, payload, error_message)
    VALUES ($1, $2, $3::jsonb, $4)
    ON CONFLICT (queue_name, job_id)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      error_message = EXCLUDED.error_message,
      failed_at = NOW()
    `,
    [
      queueName,
      jobId,
      JSON.stringify(payload || {}),
      String(errorMessage || 'Job failed').slice(0, 2000)
    ]
  );
}

async function listQueueHealth() {
  const result = await query(
    `
    WITH immersive AS (
      SELECT
        'immersive_generation_jobs'::text AS queue_name,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(
          EXTRACT(
            EPOCH FROM (
              NOW() - (MIN(run_at) FILTER (WHERE status = 'pending' AND run_at <= NOW()))
            )
          ),
          0
        )::int AS lag_seconds
      FROM immersive_generation_jobs
    ),
    payments AS (
      SELECT
        'payment_reconciliation_jobs'::text AS queue_name,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(
          EXTRACT(
            EPOCH FROM (
              NOW() - (MIN(run_at) FILTER (WHERE status = 'pending' AND run_at <= NOW()))
            )
          ),
          0
        )::int AS lag_seconds
      FROM payment_reconciliation_jobs
    )
    SELECT * FROM immersive
    UNION ALL
    SELECT * FROM payments
    ORDER BY queue_name ASC
    `
  );

  return {
    thresholds: {
      lagSeconds: env.workerQueueLagAlertThresholdSeconds,
      failedJobs: env.workerFailedJobsAlertThreshold
    },
    items: result.rows
  };
}

async function listWorkerHealth() {
  const staleAfter = env.workerHeartbeatStaleAfterSeconds;
  const result = await query(
    `
    SELECT
      worker_name,
      last_tick_started_at,
      last_tick_finished_at,
      last_seen_at,
      last_error,
      meta,
      EXTRACT(EPOCH FROM (NOW() - last_seen_at))::int AS age_seconds
    FROM worker_heartbeats
    ORDER BY worker_name ASC
    `
  );

  return {
    staleAfterSeconds: staleAfter,
    items: result.rows.map((row) => ({
      workerName: row.worker_name,
      lastTickStartedAt: row.last_tick_started_at,
      lastTickFinishedAt: row.last_tick_finished_at,
      lastSeenAt: row.last_seen_at,
      ageSeconds: row.age_seconds,
      isStale: Number(row.age_seconds) > staleAfter,
      lastError: row.last_error,
      meta: row.meta
    }))
  };
}

async function listDeadLetterJobs(payload = {}) {
  const page = Math.max(Number(payload.page) || 1, 1);
  const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const queueName = payload.queueName ? String(payload.queueName) : null;
  const whereClause = queueName ? 'WHERE queue_name = $1' : '';
  const params = queueName ? [queueName, limit, offset] : [limit, offset];

  const rowsResult = await query(
    `
    SELECT id, queue_name, job_id, payload, error_message, failed_at, created_at
    FROM dead_letter_jobs
    ${whereClause}
    ORDER BY failed_at DESC
    LIMIT $${queueName ? 2 : 1} OFFSET $${queueName ? 3 : 2}
    `,
    params
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM dead_letter_jobs
    ${whereClause}
    `,
    queueName ? [queueName] : []
  );

  return {
    items: rowsResult.rows.map((row) => ({
      id: row.id,
      queueName: row.queue_name,
      jobId: row.job_id,
      payload: row.payload,
      errorMessage: row.error_message,
      failedAt: row.failed_at,
      createdAt: row.created_at
    })),
    pagination: {
      page,
      limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function tryTriggerAlert(alertKey, payload) {
  const existing = await query(
    `
    SELECT last_triggered_at
    FROM worker_alert_events
    WHERE alert_key = $1
    LIMIT 1
    `,
    [alertKey]
  );

  const now = new Date();
  const lastTriggeredAt = existing.rows[0]?.last_triggered_at ? new Date(existing.rows[0].last_triggered_at) : null;
  const cooldownMs = env.workerAlertCooldownMinutes * 60 * 1000;
  const shouldTrigger = !lastTriggeredAt || now.getTime() - lastTriggeredAt.getTime() >= cooldownMs;

  if (!existing.rows[0]) {
    await query(
      `
      INSERT INTO worker_alert_events (alert_key, last_triggered_at, trigger_count, last_payload)
      VALUES ($1, NOW(), 1, $2::jsonb)
      `,
      [alertKey, JSON.stringify(payload)]
    );

    return true;
  }

  await query(
    `
    UPDATE worker_alert_events
    SET trigger_count = trigger_count + 1,
        last_payload = $2::jsonb,
        last_triggered_at = CASE WHEN $3::boolean THEN NOW() ELSE last_triggered_at END,
        updated_at = NOW()
    WHERE alert_key = $1
    `,
    [alertKey, JSON.stringify(payload), shouldTrigger]
  );

  return shouldTrigger;
}

async function sendWorkerAlert(payload) {
  if (!env.workerAlertWebhookUrl) {
    return false;
  }

  try {
    const response = await fetch(env.workerAlertWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    return response.ok;
  } catch (error) {
    return false;
  }
}

async function evaluateQueueAlerts(queueStats) {
  for (const item of queueStats.items) {
    if (Number(item.lag_seconds) >= env.workerQueueLagAlertThresholdSeconds) {
      const alertKey = `lag:${item.queue_name}`;
      const shouldSend = await tryTriggerAlert(alertKey, item);
      if (shouldSend) {
        await sendWorkerAlert({
          severity: 'warning',
          type: 'queue_lag',
          queue: item.queue_name,
          lagSeconds: Number(item.lag_seconds),
          thresholdSeconds: env.workerQueueLagAlertThresholdSeconds,
          ts: new Date().toISOString()
        });
      }
    }

    if (Number(item.failed) >= env.workerFailedJobsAlertThreshold) {
      const alertKey = `failed:${item.queue_name}`;
      const shouldSend = await tryTriggerAlert(alertKey, item);
      if (shouldSend) {
        await sendWorkerAlert({
          severity: 'critical',
          type: 'queue_failed_jobs',
          queue: item.queue_name,
          failedJobs: Number(item.failed),
          threshold: env.workerFailedJobsAlertThreshold,
          ts: new Date().toISOString()
        });
      }
    }
  }
}

module.exports = {
  upsertWorkerHeartbeat,
  moveJobToDeadLetter,
  listQueueHealth,
  listWorkerHealth,
  listDeadLetterJobs,
  evaluateQueueAlerts
};
