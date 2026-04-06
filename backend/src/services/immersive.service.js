const { z } = require('zod');
const { query, withTransaction } = require('../config/database');

const requestGenerationSchema = z.object({
  sourceProvider: z.string().trim().min(2).max(60).optional()
});

const updateStatusSchema = z.object({
  processingStatus: z.enum(['pending', 'processing', 'ready', 'failed']),
  assetUrl: z.string().trim().url().optional(),
  confidenceScore: z.number().min(0).max(100).optional(),
  sourceProvider: z.string().trim().min(2).max(60).optional()
});

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getListing(listingId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
    SELECT id, landlord_user_id, status, title
    FROM listings
    WHERE id = $1
    `,
    [listingId]
  );

  return result.rows[0] || null;
}

async function getImmersiveByListingId(listingId) {
  const listing = await getListing(listingId);
  if (!listing) {
    return null;
  }

  const result = await query(
    `
    SELECT
      id,
      listing_id,
      source_provider,
      asset_url,
      confidence_score,
      processing_status,
      created_at,
      updated_at
    FROM listing_immersive_assets
    WHERE listing_id = $1
    `,
    [listingId]
  );

  const asset = result.rows[0] || null;

  return {
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status
    },
    immersiveAsset: asset
      ? {
          id: asset.id,
          listingId: asset.listing_id,
          sourceProvider: asset.source_provider,
          assetUrl: asset.asset_url,
          confidenceScore: asset.confidence_score,
          processingStatus: asset.processing_status,
          createdAt: asset.created_at,
          updatedAt: asset.updated_at
        }
      : null
  };
}

async function requestGeneration(landlordUserId, listingId, payload = {}) {
  const data = requestGenerationSchema.parse(payload);

  return withTransaction(async (client) => {
    const listing = await getListing(listingId, client);

    if (!listing) {
      return null;
    }

    if (listing.landlord_user_id !== landlordUserId) {
      throw createError('You do not own this listing.', 403);
    }

    const provider = data.sourceProvider || 'internal-ai';

    const result = await client.query(
      `
      INSERT INTO listing_immersive_assets (listing_id, source_provider, asset_url, confidence_score, processing_status)
      VALUES ($1, $2, NULL, NULL, 'pending')
      ON CONFLICT (listing_id)
      DO UPDATE SET
        source_provider = EXCLUDED.source_provider,
        processing_status = 'pending',
        updated_at = NOW()
      RETURNING id, listing_id, source_provider, asset_url, confidence_score, processing_status, created_at, updated_at
      `,
      [listingId, provider]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'immersive_generation_requested', 'listing_immersive_assets', $2, $3::jsonb)
      `,
      [landlordUserId, result.rows[0].id, JSON.stringify({ listingId, provider })]
    );

    await client.query(
      `
      INSERT INTO immersive_generation_jobs (
        listing_id,
        requested_by,
        source_provider,
        status,
        run_at,
        payload
      )
      VALUES ($1, $2, $3, 'pending', NOW(), $4::jsonb)
      `,
      [listingId, landlordUserId, provider, JSON.stringify({ listingId, provider })]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      listingId: row.listing_id,
      sourceProvider: row.source_provider,
      assetUrl: row.asset_url,
      confidenceScore: row.confidence_score,
      processingStatus: row.processing_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

async function updateProcessingStatus(adminUserId, listingId, payload) {
  const data = updateStatusSchema.parse(payload);

  if (data.processingStatus === 'ready' && !data.assetUrl) {
    throw createError('assetUrl is required when processingStatus is ready.', 400);
  }

  return withTransaction(async (client) => {
    const listing = await getListing(listingId, client);

    if (!listing) {
      return null;
    }

    const upsertResult = await client.query(
      `
      INSERT INTO listing_immersive_assets (listing_id, source_provider, asset_url, confidence_score, processing_status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (listing_id)
      DO UPDATE SET
        source_provider = COALESCE(EXCLUDED.source_provider, listing_immersive_assets.source_provider),
        asset_url = EXCLUDED.asset_url,
        confidence_score = EXCLUDED.confidence_score,
        processing_status = EXCLUDED.processing_status,
        updated_at = NOW()
      RETURNING id, listing_id, source_provider, asset_url, confidence_score, processing_status, created_at, updated_at
      `,
      [
        listingId,
        data.sourceProvider || 'internal-ai',
        data.assetUrl || null,
        data.confidenceScore ?? null,
        data.processingStatus
      ]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'immersive_status_updated', 'listing_immersive_assets', $2, $3::jsonb)
      `,
      [
        adminUserId,
        upsertResult.rows[0].id,
        JSON.stringify({
          listingId,
          processingStatus: data.processingStatus,
          sourceProvider: data.sourceProvider || null,
          hasAssetUrl: Boolean(data.assetUrl),
          confidenceScore: data.confidenceScore ?? null
        })
      ]
    );

    const row = upsertResult.rows[0];
    return {
      id: row.id,
      listingId: row.listing_id,
      sourceProvider: row.source_provider,
      assetUrl: row.asset_url,
      confidenceScore: row.confidence_score,
      processingStatus: row.processing_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}

module.exports = {
  getImmersiveByListingId,
  requestGeneration,
  updateProcessingStatus
};
