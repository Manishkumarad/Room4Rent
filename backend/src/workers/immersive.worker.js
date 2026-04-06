const { query, withTransaction } = require('../config/database');
const { moveJobToDeadLetter } = require('../services/worker-ops.service');

function buildSyntheticAssetUrl(listingId) {
  return `https://cdn.roomrental.local/immersive/${listingId}.glb`;
}

async function claimImmersiveJob() {
  const result = await query(
    `
    WITH candidate AS (
      SELECT id
      FROM immersive_generation_jobs
      WHERE status = 'pending'
        AND run_at <= NOW()
        AND attempts < max_attempts
      ORDER BY run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE immersive_generation_jobs j
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

async function completeImmersiveJob(jobId, resultPayload) {
  await query(
    `
    UPDATE immersive_generation_jobs
    SET status = 'completed',
        result = $2::jsonb,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, JSON.stringify(resultPayload)]
  );
}

async function failImmersiveJob(jobId, errorMessage, willRetry, retrySeconds = 30) {
  if (willRetry) {
    await query(
      `
      UPDATE immersive_generation_jobs
      SET status = 'pending',
          last_error = $2,
          run_at = NOW() + ($3::int || ' seconds')::interval,
          updated_at = NOW()
      WHERE id = $1
      `,
      [jobId, errorMessage.slice(0, 1000), retrySeconds]
    );
    return;
  }

  await query(
    `
    UPDATE immersive_generation_jobs
    SET status = 'failed',
        last_error = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [jobId, errorMessage.slice(0, 1000)]
  );

  await moveJobToDeadLetter('immersive_generation_jobs', jobId, { jobId }, errorMessage);
}

async function processImmersiveJob(job) {
  const syntheticAssetUrl = buildSyntheticAssetUrl(job.listing_id);
  const confidenceScore = 90 + Math.random() * 10;

  await withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO listing_immersive_assets (
        listing_id,
        source_provider,
        asset_url,
        confidence_score,
        processing_status
      )
      VALUES ($1, $2, $3, $4, 'ready')
      ON CONFLICT (listing_id)
      DO UPDATE SET
        source_provider = EXCLUDED.source_provider,
        asset_url = EXCLUDED.asset_url,
        confidence_score = EXCLUDED.confidence_score,
        processing_status = 'ready',
        updated_at = NOW()
      `,
      [job.listing_id, job.source_provider || 'internal-ai', syntheticAssetUrl, confidenceScore]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'immersive_generation_completed', 'listing_immersive_assets', NULL, $2::jsonb)
      `,
      [
        job.requested_by || null,
        JSON.stringify({ listingId: job.listing_id, jobId: job.id, sourceProvider: job.source_provider })
      ]
    );
  });

  await completeImmersiveJob(job.id, {
    listingId: job.listing_id,
    assetUrl: syntheticAssetUrl,
    confidenceScore
  });
}

async function processImmersiveGenerationJobs(batchSize = 5) {
  let processed = 0;

  for (let i = 0; i < batchSize; i += 1) {
    const job = await claimImmersiveJob();
    if (!job) {
      break;
    }

    try {
      await processImmersiveJob(job);
      processed += 1;
    } catch (error) {
      const willRetry = job.attempts < job.max_attempts;
      await failImmersiveJob(job.id, error.message || 'Immersive job failed', willRetry);
    }
  }

  return { processed };
}

module.exports = {
  processImmersiveGenerationJobs
};
