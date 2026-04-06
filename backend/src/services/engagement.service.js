const { z } = require('zod');
const { query } = require('../config/database');

const inquiryCreateSchema = z.object({
  message: z.string().trim().min(1).max(2000).optional()
});

const inquiryStatusSchema = z.object({
  status: z.enum(['open', 'responded', 'closed'])
});

async function ensureStudent(userId) {
  const result = await query(
    `
    SELECT 1
    FROM students
    WHERE user_id = $1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    const error = new Error('Only students can perform this action.');
    error.statusCode = 403;
    throw error;
  }
}

async function ensureLandlord(userId) {
  const result = await query(
    `
    SELECT 1
    FROM landlords
    WHERE user_id = $1
    `,
    [userId]
  );

  if (!result.rows[0]) {
    const error = new Error('Only landlords can perform this action.');
    error.statusCode = 403;
    throw error;
  }
}

async function ensureActiveListing(listingId) {
  const result = await query(
    `
    SELECT id, landlord_user_id, status, title, monthly_rent
    FROM listings
    WHERE id = $1
    `,
    [listingId]
  );

  const listing = result.rows[0];
  if (!listing) {
    return null;
  }

  return listing;
}

async function saveListing(studentUserId, listingId) {
  await ensureStudent(studentUserId);

  const listing = await ensureActiveListing(listingId);
  if (!listing) {
    return null;
  }

  if (listing.status !== 'active') {
    const error = new Error('Only active listings can be saved.');
    error.statusCode = 400;
    throw error;
  }

  const result = await query(
    `
    INSERT INTO saved_listings (student_user_id, listing_id)
    VALUES ($1, $2)
    ON CONFLICT (student_user_id, listing_id) DO NOTHING
    RETURNING student_user_id, listing_id, created_at
    `,
    [studentUserId, listingId]
  );

  if (result.rows[0]) {
    return {
      saved: true,
      listingId: result.rows[0].listing_id,
      createdAt: result.rows[0].created_at
    };
  }

  const existing = await query(
    `
    SELECT student_user_id, listing_id, created_at
    FROM saved_listings
    WHERE student_user_id = $1 AND listing_id = $2
    `,
    [studentUserId, listingId]
  );

  return {
    saved: false,
    listingId: existing.rows[0].listing_id,
    createdAt: existing.rows[0].created_at
  };
}

async function unsaveListing(studentUserId, listingId) {
  await ensureStudent(studentUserId);

  const result = await query(
    `
    DELETE FROM saved_listings
    WHERE student_user_id = $1 AND listing_id = $2
    `,
    [studentUserId, listingId]
  );

  return result.rowCount > 0;
}

async function listSavedListings(studentUserId, payload = {}) {
  await ensureStudent(studentUserId);

  const page = Math.max(Number(payload.page) || 1, 1);
  const limit = Math.min(Math.max(Number(payload.limit) || 12, 1), 50);
  const offset = (page - 1) * limit;

  const rows = await query(
    `
    SELECT
      sl.created_at AS saved_at,
      l.id,
      l.title,
      l.description,
      l.monthly_rent,
      l.room_type,
      l.furnishing_type,
      l.tenant_gender_preference,
      l.status,
      l.is_verified,
      loc.city,
      loc.state,
      loc.locality_name,
      img.image_url AS primary_image_url
    FROM saved_listings sl
    JOIN listings l ON l.id = sl.listing_id
    JOIN localities loc ON loc.id = l.locality_id
    LEFT JOIN LATERAL (
      SELECT li.image_url
      FROM listing_images li
      WHERE li.listing_id = l.id
      ORDER BY li.is_primary DESC, li.sort_order ASC, li.created_at ASC
      LIMIT 1
    ) img ON TRUE
    WHERE sl.student_user_id = $1
    ORDER BY sl.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [studentUserId, limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM saved_listings
    WHERE student_user_id = $1
    `,
    [studentUserId]
  );

  return {
    items: rows.rows.map((row) => ({
      listingId: row.id,
      title: row.title,
      description: row.description,
      monthlyRent: row.monthly_rent,
      roomType: row.room_type,
      furnishingType: row.furnishing_type,
      tenantGenderPreference: row.tenant_gender_preference,
      status: row.status,
      isVerified: row.is_verified,
      locality: {
        city: row.city,
        state: row.state,
        localityName: row.locality_name
      },
      primaryImageUrl: row.primary_image_url,
      savedAt: row.saved_at
    })),
    pagination: {
      page,
      limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function createListingInquiry(studentUserId, listingId, payload) {
  await ensureStudent(studentUserId);
  const data = inquiryCreateSchema.parse(payload || {});

  const listing = await ensureActiveListing(listingId);
  if (!listing) {
    return null;
  }

  if (listing.status !== 'active') {
    const error = new Error('Only active listings can receive inquiries.');
    error.statusCode = 400;
    throw error;
  }

  const result = await query(
    `
    INSERT INTO listing_inquiries (listing_id, student_user_id, message, status)
    VALUES ($1, $2, $3, 'open')
    RETURNING id, listing_id, student_user_id, message, status, created_at, updated_at
    `,
    [listingId, studentUserId, data.message || null]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    listingId: row.listing_id,
    studentUserId: row.student_user_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listMyInquiries(studentUserId, payload = {}) {
  await ensureStudent(studentUserId);

  const page = Math.max(Number(payload.page) || 1, 1);
  const limit = Math.min(Math.max(Number(payload.limit) || 12, 1), 50);
  const offset = (page - 1) * limit;

  const rows = await query(
    `
    SELECT
      li.id,
      li.listing_id,
      li.student_user_id,
      li.message,
      li.status,
      li.created_at,
      li.updated_at,
      l.title AS listing_title,
      l.monthly_rent,
      u.id AS landlord_user_id,
      u.full_name AS landlord_name
    FROM listing_inquiries li
    JOIN listings l ON l.id = li.listing_id
    JOIN users u ON u.id = l.landlord_user_id
    WHERE li.student_user_id = $1
    ORDER BY li.created_at DESC
    LIMIT $2 OFFSET $3
    `,
    [studentUserId, limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM listing_inquiries
    WHERE student_user_id = $1
    `,
    [studentUserId]
  );

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      listing: {
        id: row.listing_id,
        title: row.listing_title,
        monthlyRent: row.monthly_rent
      },
      landlord: {
        userId: row.landlord_user_id,
        fullName: row.landlord_name
      },
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    pagination: {
      page,
      limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function listReceivedInquiries(landlordUserId, payload = {}) {
  await ensureLandlord(landlordUserId);

  const page = Math.max(Number(payload.page) || 1, 1);
  const limit = Math.min(Math.max(Number(payload.limit) || 12, 1), 50);
  const offset = (page - 1) * limit;

  const status = payload.status;
  const params = [landlordUserId];
  let statusClause = '';

  if (status) {
    params.push(status);
    statusClause = `AND li.status = $${params.length}`;
  }

  params.push(limit, offset);

  const rows = await query(
    `
    SELECT
      li.id,
      li.listing_id,
      li.student_user_id,
      li.message,
      li.status,
      li.created_at,
      li.updated_at,
      l.title AS listing_title,
      l.monthly_rent,
      su.full_name AS student_name,
      su.phone AS student_phone,
      su.email AS student_email
    FROM listing_inquiries li
    JOIN listings l ON l.id = li.listing_id
    JOIN users su ON su.id = li.student_user_id
    WHERE l.landlord_user_id = $1
      ${statusClause}
    ORDER BY li.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );

  const countParams = [landlordUserId];
  let countStatusClause = '';
  if (status) {
    countParams.push(status);
    countStatusClause = 'AND li.status = $2';
  }

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM listing_inquiries li
    JOIN listings l ON l.id = li.listing_id
    WHERE l.landlord_user_id = $1
      ${countStatusClause}
    `,
    countParams
  );

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      listing: {
        id: row.listing_id,
        title: row.listing_title,
        monthlyRent: row.monthly_rent
      },
      student: {
        userId: row.student_user_id,
        fullName: row.student_name,
        phone: row.student_phone,
        email: row.student_email
      },
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    pagination: {
      page,
      limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function updateInquiryStatus(landlordUserId, inquiryId, payload) {
  await ensureLandlord(landlordUserId);
  const data = inquiryStatusSchema.parse(payload);

  const result = await query(
    `
    UPDATE listing_inquiries li
    SET status = $1
    FROM listings l
    WHERE li.id = $2
      AND l.id = li.listing_id
      AND l.landlord_user_id = $3
    RETURNING li.id, li.listing_id, li.student_user_id, li.message, li.status, li.created_at, li.updated_at
    `,
    [data.status, inquiryId, landlordUserId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    listingId: row.listing_id,
    studentUserId: row.student_user_id,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  saveListing,
  unsaveListing,
  listSavedListings,
  createListingInquiry,
  listMyInquiries,
  listReceivedInquiries,
  updateInquiryStatus
};
