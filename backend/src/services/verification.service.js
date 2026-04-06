const { z } = require('zod');
const { query, withTransaction } = require('../config/database');

const submitDocumentSchema = z.object({
  documentType: z.string().trim().min(2).max(50),
  fileUrl: z.string().trim().url()
});

const reviewDocumentSchema = z.object({
  verificationStatus: z.enum(['verified', 'rejected']),
  rejectionReason: z.string().trim().max(1000).optional()
});

const reviewListingSchema = z.object({
  status: z.enum(['active', 'rejected']),
  isVerified: z.boolean().optional(),
  reason: z.string().trim().max(1000).optional()
});

const queueQuerySchema = z.object({
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

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
    const error = new Error('Only landlords can perform this operation.');
    error.statusCode = 403;
    throw error;
  }
}

async function submitLandlordDocument(landlordUserId, payload) {
  await ensureLandlord(landlordUserId);
  const data = submitDocumentSchema.parse(payload);

  return withTransaction(async (client) => {
    const insertResult = await client.query(
      `
      INSERT INTO landlord_documents (landlord_user_id, document_type, file_url, verification_status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING id, landlord_user_id, document_type, file_url, verification_status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
      `,
      [landlordUserId, data.documentType, data.fileUrl]
    );

    await client.query(
      `
      UPDATE landlords
      SET verification_status = 'pending'
      WHERE user_id = $1
      `,
      [landlordUserId]
    );

    return mapDocument(insertResult.rows[0]);
  });
}

async function listMyLandlordDocuments(landlordUserId) {
  await ensureLandlord(landlordUserId);
  const result = await query(
    `
    SELECT id, landlord_user_id, document_type, file_url, verification_status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
    FROM landlord_documents
    WHERE landlord_user_id = $1
    ORDER BY created_at DESC
    `,
    [landlordUserId]
  );

  return { items: result.rows.map(mapDocument) };
}

async function listDocumentVerificationQueue(payload = {}) {
  const filters = queueQuerySchema.parse(payload);
  const params = [];
  const conditions = ['1=1'];
  let index = 1;

  if (filters.verificationStatus) {
    conditions.push(`ld.verification_status = $${index}`);
    params.push(filters.verificationStatus);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;

  const rows = await query(
    `
    SELECT
      ld.id,
      ld.landlord_user_id,
      ld.document_type,
      ld.file_url,
      ld.verification_status,
      ld.rejection_reason,
      ld.reviewed_by,
      ld.reviewed_at,
      ld.created_at,
      ld.updated_at,
      u.full_name,
      u.phone,
      u.email
    FROM landlord_documents ld
    JOIN users u ON u.id = ld.landlord_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ld.created_at DESC
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM landlord_documents ld
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.rows.map((row) => ({
      ...mapDocument(row),
      landlord: {
        userId: row.landlord_user_id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email
      }
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function reviewLandlordDocument(adminUserId, documentId, payload) {
  const data = reviewDocumentSchema.parse(payload);

  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
      SELECT id, landlord_user_id, verification_status
      FROM landlord_documents
      WHERE id = $1
      LIMIT 1
      `,
      [documentId]
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      return null;
    }

    const rejectionReason = data.verificationStatus === 'rejected' ? (data.rejectionReason || 'Document rejected by reviewer.') : null;

    const updateResult = await client.query(
      `
      UPDATE landlord_documents
      SET verification_status = $2,
          rejection_reason = $3,
          reviewed_by = $4,
          reviewed_at = NOW()
      WHERE id = $1
      RETURNING id, landlord_user_id, document_type, file_url, verification_status, rejection_reason, reviewed_by, reviewed_at, created_at, updated_at
      `,
      [documentId, data.verificationStatus, rejectionReason, adminUserId]
    );

    const landlordUserId = updateResult.rows[0].landlord_user_id;

    const summaryResult = await client.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE verification_status = 'rejected') AS rejected_count,
        COUNT(*) FILTER (WHERE verification_status = 'verified') AS verified_count,
        COUNT(*) AS total_count
      FROM landlord_documents
      WHERE landlord_user_id = $1
      `,
      [landlordUserId]
    );

    const summary = summaryResult.rows[0];
    let landlordStatus = 'pending';

    if (Number(summary.rejected_count) > 0) {
      landlordStatus = 'rejected';
    } else if (Number(summary.total_count) > 0 && Number(summary.pending_count) === 0 && Number(summary.verified_count) === Number(summary.total_count)) {
      landlordStatus = 'verified';
    }

    await client.query(
      `
      UPDATE landlords
      SET verification_status = $2
      WHERE user_id = $1
      `,
      [landlordUserId, landlordStatus]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'review_landlord_document', 'landlord_documents', $2, $3::jsonb)
      `,
      [adminUserId, documentId, JSON.stringify({ verificationStatus: data.verificationStatus, landlordStatus })]
    );

    return {
      document: mapDocument(updateResult.rows[0]),
      landlordStatus
    };
  });
}

async function submitListingForVerification(landlordUserId, listingId) {
  await ensureLandlord(landlordUserId);

  return withTransaction(async (client) => {
    const listingResult = await client.query(
      `
      SELECT id, landlord_user_id, status, is_verified
      FROM listings
      WHERE id = $1
      LIMIT 1
      `,
      [listingId]
    );

    const listing = listingResult.rows[0];
    if (!listing) {
      return null;
    }

    if (listing.landlord_user_id !== landlordUserId) {
      const error = new Error('You do not own this listing.');
      error.statusCode = 403;
      throw error;
    }

    const updated = await client.query(
      `
      UPDATE listings
      SET status = 'pending_verification',
          is_verified = FALSE
      WHERE id = $1
      RETURNING id, status, is_verified, updated_at
      `,
      [listingId]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'submit_listing_verification', 'listings', $2, $3::jsonb)
      `,
      [landlordUserId, listingId, JSON.stringify({ submittedStatus: 'pending_verification' })]
    );

    return {
      id: updated.rows[0].id,
      status: updated.rows[0].status,
      isVerified: updated.rows[0].is_verified,
      updatedAt: updated.rows[0].updated_at
    };
  });
}

async function listListingVerificationQueue(payload = {}) {
  const filters = z.object({
    status: z.enum(['pending_verification', 'active', 'rejected']).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20)
  }).parse(payload);

  const params = [];
  const conditions = ['1=1'];
  let index = 1;

  if (filters.status) {
    conditions.push(`l.status = $${index}`);
    params.push(filters.status);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;

  const rows = await query(
    `
    SELECT
      l.id,
      l.title,
      l.status,
      l.is_verified,
      l.updated_at,
      l.created_at,
      l.monthly_rent,
      l.landlord_user_id,
      u.full_name,
      u.phone,
      loc.city,
      loc.locality_name
    FROM listings l
    JOIN users u ON u.id = l.landlord_user_id
    JOIN localities loc ON loc.id = l.locality_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.updated_at DESC
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM listings l
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      isVerified: row.is_verified,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      monthlyRent: row.monthly_rent,
      locality: {
        city: row.city,
        localityName: row.locality_name
      },
      landlord: {
        userId: row.landlord_user_id,
        fullName: row.full_name,
        phone: row.phone
      }
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function reviewListingVerification(adminUserId, listingId, payload) {
  const data = reviewListingSchema.parse(payload);

  return withTransaction(async (client) => {
    const existingResult = await client.query(
      `
      SELECT id, status, is_verified
      FROM listings
      WHERE id = $1
      LIMIT 1
      `,
      [listingId]
    );

    if (!existingResult.rows[0]) {
      return null;
    }

    const isVerified = data.isVerified !== undefined ? data.isVerified : data.status === 'active';

    const updateResult = await client.query(
      `
      UPDATE listings
      SET status = $2,
          is_verified = $3
      WHERE id = $1
      RETURNING id, status, is_verified, updated_at
      `,
      [listingId, data.status, isVerified]
    );

    await client.query(
      `
      INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, 'review_listing_verification', 'listings', $2, $3::jsonb)
      `,
      [
        adminUserId,
        listingId,
        JSON.stringify({
          status: data.status,
          isVerified,
          reason: data.reason || null
        })
      ]
    );

    return {
      id: updateResult.rows[0].id,
      status: updateResult.rows[0].status,
      isVerified: updateResult.rows[0].is_verified,
      updatedAt: updateResult.rows[0].updated_at
    };
  });
}

function mapDocument(row) {
  return {
    id: row.id,
    landlordUserId: row.landlord_user_id,
    documentType: row.document_type,
    fileUrl: row.file_url,
    verificationStatus: row.verification_status,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  submitLandlordDocument,
  listMyLandlordDocuments,
  listDocumentVerificationQueue,
  reviewLandlordDocument,
  submitListingForVerification,
  listListingVerificationQueue,
  reviewListingVerification
};
