const { z } = require('zod');
const { query, withTransaction } = require('../config/database');
const { generateAlertsForListing } = require('./saved-search-alert.service');

const listingStatusValues = ['draft', 'pending_verification', 'active', 'inactive', 'rejected'];

const createListingSchema = z.object({
  localityId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(5000).optional(),
  addressLine1: z.string().trim().min(3).max(255),
  monthlyRent: z.number().nonnegative(),
  securityDeposit: z.number().nonnegative().default(0),
  roomType: z.string().trim().min(2).max(30),
  furnishingType: z.string().trim().max(30).optional(),
  tenantGenderPreference: z.string().trim().max(20).optional(),
  availableFrom: z.coerce.date().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  status: z.enum(listingStatusValues).optional()
});

const updateListingSchema = createListingSchema.partial().extend({
  status: z.enum(listingStatusValues).optional()
});

const listingQuerySchema = z.object({
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
  localityId: z.string().uuid().optional(),
  roomType: z.string().trim().optional(),
  furnishingType: z.string().trim().optional(),
  tenantGenderPreference: z.string().trim().max(20).optional(),
  minRent: z.coerce.number().nonnegative().optional(),
  maxRent: z.coerce.number().nonnegative().optional(),
  status: z.enum(listingStatusValues).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

const imageSchema = z.object({
  imageUrl: z.string().trim().url(),
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional()
});

const videoSchema = z.object({
  videoUrl: z.string().trim().url(),
  sortOrder: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional()
});

const amenitiesSchema = z.object({
  amenityCodes: z.array(z.string().trim().min(1)).min(1)
});

async function ensureLandlord(userId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
    SELECT u.id, u.role, l.user_id AS landlord_user_id
    FROM users u
    LEFT JOIN landlords l ON l.user_id = u.id
    WHERE u.id = $1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row || row.role !== 'landlord' || !row.landlord_user_id) {
    const error = new Error('Only landlords can manage listings.');
    error.statusCode = 403;
    throw error;
  }

  return row;
}

async function ensureListingOwner(listingId, landlordUserId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
    SELECT id, landlord_user_id
    FROM listings
    WHERE id = $1
    `,
    [listingId]
  );

  const listing = result.rows[0];
  if (!listing) {
    return null;
  }

  if (listing.landlord_user_id !== landlordUserId) {
    const error = new Error('You do not own this listing.');
    error.statusCode = 403;
    throw error;
  }

  return listing;
}

async function createListing(landlordUserId, payload) {
  await ensureLandlord(landlordUserId);
  const data = createListingSchema.parse(payload);

  const result = await query(
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
      furnishing_type,
      tenant_gender_preference,
      available_from,
      latitude,
      longitude,
      status,
      is_verified
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE)
    RETURNING *
    `,
    [
      landlordUserId,
      data.localityId,
      data.title,
      data.description || null,
      data.addressLine1,
      data.monthlyRent,
      data.securityDeposit,
      data.roomType,
      data.furnishingType || null,
      data.tenantGenderPreference || null,
      data.availableFrom || null,
      data.latitude || null,
      data.longitude || null,
      data.status || 'draft'
    ]
  );

  const listingId = result.rows[0].id;

  if ((data.status || 'draft') === 'active') {
    await generateAlertsForListing(listingId);
  }

  return getListingById(listingId, landlordUserId);
}

async function listListings(payload = {}) {
  const filters = listingQuerySchema.parse(payload);
  const conditions = [`l.status = COALESCE($1, l.status)`];
  const params = [filters.status || 'active'];
  let index = 2;

  if (filters.search) {
    conditions.push(`(l.title ILIKE $${index} OR l.description ILIKE $${index} OR loc.locality_name ILIKE $${index} OR loc.city ILIKE $${index})`);
    params.push(`%${filters.search}%`);
    index += 1;
  }

  if (filters.city) {
    conditions.push(`loc.city ILIKE $${index}`);
    params.push(`%${filters.city}%`);
    index += 1;
  }

  if (filters.localityId) {
    conditions.push(`l.locality_id = $${index}`);
    params.push(filters.localityId);
    index += 1;
  }

  if (filters.roomType) {
    conditions.push(`l.room_type ILIKE $${index}`);
    params.push(`%${filters.roomType}%`);
    index += 1;
  }

  if (filters.furnishingType) {
    conditions.push(`l.furnishing_type ILIKE $${index}`);
    params.push(`%${filters.furnishingType}%`);
    index += 1;
  }

  if (filters.tenantGenderPreference) {
    conditions.push(`(l.tenant_gender_preference ILIKE $${index} OR l.tenant_gender_preference IS NULL)`);
    params.push(`%${filters.tenantGenderPreference}%`);
    index += 1;
  }

  if (filters.minRent !== undefined) {
    conditions.push(`l.monthly_rent >= $${index}`);
    params.push(filters.minRent);
    index += 1;
  }

  if (filters.maxRent !== undefined) {
    conditions.push(`l.monthly_rent <= $${index}`);
    params.push(filters.maxRent);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;
  const listingsQuery = `
    SELECT
      l.id,
      l.landlord_user_id,
      l.locality_id,
      l.title,
      l.description,
      l.address_line1,
      l.monthly_rent,
      l.security_deposit,
      l.room_type,
      l.furnishing_type,
      l.tenant_gender_preference,
      l.available_from,
      l.latitude,
      l.longitude,
      l.status,
      l.is_verified,
      l.view_count,
      l.created_at,
      l.updated_at,
      loc.city,
      loc.state,
      loc.locality_name,
      loc.pincode,
      loc.safety_score,
      loc.transport_score,
      loc.avg_rent,
      u.full_name AS landlord_name,
      u.phone AS landlord_phone,
      u.email AS landlord_email,
      ldoc.business_name,
      img.image_url AS primary_image_url
    FROM listings l
    JOIN localities loc ON loc.id = l.locality_id
    JOIN landlords ldoc ON ldoc.user_id = l.landlord_user_id
    JOIN users u ON u.id = l.landlord_user_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM listing_images li
      WHERE li.listing_id = l.id
      ORDER BY li.is_primary DESC, li.sort_order ASC, li.created_at ASC
      LIMIT 1
    ) img ON TRUE
    WHERE ${conditions.join(' AND ')}
    ORDER BY l.is_verified DESC, l.created_at DESC
    LIMIT $${index} OFFSET $${index + 1}
  `;
  params.push(filters.limit, offset);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM listings l
    JOIN localities loc ON loc.id = l.locality_id
    WHERE ${conditions.join(' AND ')}
  `;

  const [listingsResult, countResult] = await Promise.all([
    query(listingsQuery, params),
    query(countQuery, params.slice(0, params.length - 2))
  ]);

  const ids = listingsResult.rows.map((row) => row.id);
  const amenitiesResult = ids.length
    ? await query(
        `
        SELECT la.listing_id, array_agg(a.code ORDER BY a.label) AS amenity_codes
        FROM listing_amenities la
        JOIN amenities a ON a.id = la.amenity_id
        WHERE la.listing_id = ANY($1::uuid[])
        GROUP BY la.listing_id
        `,
        [ids]
      )
    : { rows: [] };

  const amenitiesMap = new Map(
    amenitiesResult.rows.map((row) => [row.listing_id, row.amenity_codes || []])
  );

  const items = listingsResult.rows.map((row) => ({
    id: row.id,
    landlordUserId: row.landlord_user_id,
    localityId: row.locality_id,
    title: row.title,
    description: row.description,
    addressLine1: row.address_line1,
    monthlyRent: row.monthly_rent,
    securityDeposit: row.security_deposit,
    roomType: row.room_type,
    furnishingType: row.furnishing_type,
    tenantGenderPreference: row.tenant_gender_preference,
    availableFrom: row.available_from,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status,
    isVerified: row.is_verified,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locality: {
      city: row.city,
      state: row.state,
      localityName: row.locality_name,
      pincode: row.pincode,
      safetyScore: row.safety_score,
      transportScore: row.transport_score,
      avgRent: row.avg_rent
    },
    landlord: {
      id: row.landlord_user_id,
      fullName: row.landlord_name,
      businessName: row.business_name,
      phone: row.landlord_phone,
      email: row.landlord_email
    },
    primaryImageUrl: row.primary_image_url,
    amenityCodes: amenitiesMap.get(row.id) || []
  }));

  return {
    items,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function getListingById(listingId, requesterUserId = null) {
  const listingResult = await query(
    `
    SELECT
      l.id,
      l.landlord_user_id,
      l.locality_id,
      l.title,
      l.description,
      l.address_line1,
      l.monthly_rent,
      l.security_deposit,
      l.room_type,
      l.furnishing_type,
      l.tenant_gender_preference,
      l.available_from,
      l.latitude,
      l.longitude,
      l.status,
      l.is_verified,
      l.view_count,
      l.created_at,
      l.updated_at,
      loc.city,
      loc.state,
      loc.locality_name,
      loc.pincode,
      loc.safety_score,
      loc.transport_score,
      loc.avg_rent,
      u.full_name AS landlord_name,
      u.phone AS landlord_phone,
      u.email AS landlord_email,
      ld.business_name,
      ld.verification_status AS landlord_verification_status,
      ld.avg_rating,
      ld.total_listings
    FROM listings l
    JOIN localities loc ON loc.id = l.locality_id
    JOIN landlords ld ON ld.user_id = l.landlord_user_id
    JOIN users u ON u.id = l.landlord_user_id
    WHERE l.id = $1
    LIMIT 1
    `,
    [listingId]
  );

  const listing = listingResult.rows[0];
  if (!listing) {
    return null;
  }

  const imagesResult = await query(
    `
    SELECT id, image_url, sort_order, is_primary, created_at
    FROM listing_images
    WHERE listing_id = $1
    ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `,
    [listingId]
  );

  const videosResult = await query(
    `
    SELECT id, video_url, sort_order, is_primary, created_at
    FROM listing_videos
    WHERE listing_id = $1
    ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `,
    [listingId]
  );

  const amenitiesResult = await query(
    `
    SELECT a.code, a.label
    FROM listing_amenities la
    JOIN amenities a ON a.id = la.amenity_id
    WHERE la.listing_id = $1
    ORDER BY a.label ASC
    `,
    [listingId]
  );

  return {
    id: listing.id,
    landlordUserId: listing.landlord_user_id,
    localityId: listing.locality_id,
    title: listing.title,
    description: listing.description,
    addressLine1: listing.address_line1,
    monthlyRent: listing.monthly_rent,
    securityDeposit: listing.security_deposit,
    roomType: listing.room_type,
    furnishingType: listing.furnishing_type,
    tenantGenderPreference: listing.tenant_gender_preference,
    availableFrom: listing.available_from,
    latitude: listing.latitude,
    longitude: listing.longitude,
    status: listing.status,
    isVerified: listing.is_verified,
    viewCount: listing.view_count,
    createdAt: listing.created_at,
    updatedAt: listing.updated_at,
    locality: {
      city: listing.city,
      state: listing.state,
      localityName: listing.locality_name,
      pincode: listing.pincode,
      safetyScore: listing.safety_score,
      transportScore: listing.transport_score,
      avgRent: listing.avg_rent
    },
    landlord: {
      id: listing.landlord_user_id,
      fullName: listing.landlord_name,
      businessName: listing.business_name,
      phone: listing.landlord_phone,
      email: listing.landlord_email,
      verificationStatus: listing.landlord_verification_status,
      avgRating: listing.avg_rating,
      totalListings: listing.total_listings
    },
    images: imagesResult.rows,
    videos: videosResult.rows,
    amenities: amenitiesResult.rows
  };
}

async function updateListing(landlordUserId, listingId, payload) {
  await ensureLandlord(landlordUserId);
  const data = updateListingSchema.parse(payload);

  const existing = await ensureListingOwner(listingId, landlordUserId);
  if (!existing) {
    return null;
  }

  const previousStatusResult = await query('SELECT status FROM listings WHERE id = $1', [listingId]);
  const previousStatus = previousStatusResult.rows[0]?.status;

  const columns = [];
  const values = [];
  let index = 1;

  const assign = (column, value) => {
    columns.push(`${column} = $${index}`);
    values.push(value);
    index += 1;
  };

  if (data.localityId !== undefined) assign('locality_id', data.localityId);
  if (data.title !== undefined) assign('title', data.title);
  if (data.description !== undefined) assign('description', data.description ?? null);
  if (data.addressLine1 !== undefined) assign('address_line1', data.addressLine1);
  if (data.monthlyRent !== undefined) assign('monthly_rent', data.monthlyRent);
  if (data.securityDeposit !== undefined) assign('security_deposit', data.securityDeposit);
  if (data.roomType !== undefined) assign('room_type', data.roomType);
  if (data.furnishingType !== undefined) assign('furnishing_type', data.furnishingType ?? null);
  if (data.tenantGenderPreference !== undefined) assign('tenant_gender_preference', data.tenantGenderPreference ?? null);
  if (data.availableFrom !== undefined) assign('available_from', data.availableFrom ?? null);
  if (data.latitude !== undefined) assign('latitude', data.latitude ?? null);
  if (data.longitude !== undefined) assign('longitude', data.longitude ?? null);
  if (data.status !== undefined) assign('status', data.status);

  if (columns.length > 0) {
    values.push(listingId);
    await query(
      `
      UPDATE listings
      SET ${columns.join(', ')}
      WHERE id = $${index}
      `,
      values
    );
  }

  const nextStatusResult = await query('SELECT status FROM listings WHERE id = $1', [listingId]);
  const nextStatus = nextStatusResult.rows[0]?.status;

  if (nextStatus === 'active' && previousStatus !== 'active') {
    await generateAlertsForListing(listingId);
  }

  return getListingById(listingId, landlordUserId);
}

async function deactivateListing(landlordUserId, listingId) {
  await ensureLandlord(landlordUserId);
  const existing = await ensureListingOwner(listingId, landlordUserId);
  if (!existing) {
    return null;
  }

  await query('UPDATE listings SET status = $2 WHERE id = $1', [listingId, 'inactive']);
  return getListingById(listingId, landlordUserId);
}

async function addListingImage(landlordUserId, listingId, payload) {
  await ensureLandlord(landlordUserId);
  const data = imageSchema.parse(payload);

  const existing = await ensureListingOwner(listingId, landlordUserId);
  if (!existing) {
    return null;
  }

  await withTransaction(async (client) => {
    if (data.isPrimary) {
      await client.query('UPDATE listing_images SET is_primary = FALSE WHERE listing_id = $1', [listingId]);
    }

    await client.query(
      `
      INSERT INTO listing_images (listing_id, image_url, sort_order, is_primary)
      VALUES ($1, $2, $3, $4)
      `,
      [listingId, data.imageUrl, data.sortOrder || 0, data.isPrimary || false]
    );
  });

  return getListingById(listingId, landlordUserId);
}

async function addListingVideo(landlordUserId, listingId, payload) {
  await ensureLandlord(landlordUserId);
  const data = videoSchema.parse(payload);

  const existing = await ensureListingOwner(listingId, landlordUserId);
  if (!existing) {
    return null;
  }

  await withTransaction(async (client) => {
    if (data.isPrimary) {
      await client.query('UPDATE listing_videos SET is_primary = FALSE WHERE listing_id = $1', [listingId]);
    }

    await client.query(
      `
      INSERT INTO listing_videos (listing_id, video_url, sort_order, is_primary)
      VALUES ($1, $2, $3, $4)
      `,
      [listingId, data.videoUrl, data.sortOrder || 0, data.isPrimary || false]
    );
  });

  return getListingById(listingId, landlordUserId);
}

async function setListingAmenities(landlordUserId, listingId, payload) {
  await ensureLandlord(landlordUserId);
  const data = amenitiesSchema.parse(payload);

  const existing = await ensureListingOwner(listingId, landlordUserId);
  if (!existing) {
    return null;
  }

  await withTransaction(async (client) => {
    const amenitiesResult = await client.query(
      `
      SELECT id, code
      FROM amenities
      WHERE code = ANY($1::text[])
      `,
      [data.amenityCodes]
    );

    if (amenitiesResult.rows.length !== data.amenityCodes.length) {
      throw new Error('One or more amenity codes are invalid.');
    }

    await client.query('DELETE FROM listing_amenities WHERE listing_id = $1', [listingId]);

    for (const amenity of amenitiesResult.rows) {
      await client.query(
        `
        INSERT INTO listing_amenities (listing_id, amenity_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [listingId, amenity.id]
      );
    }
  });

  return getListingById(listingId, landlordUserId);
}

async function listMyListings(landlordUserId, payload = {}) {
  await ensureLandlord(landlordUserId);
  const result = await query(
    `
    SELECT id
    FROM listings
    WHERE landlord_user_id = $1
    ORDER BY created_at DESC
    `,
    [landlordUserId]
  );

  const listings = [];
  for (const row of result.rows) {
    const listing = await getListingById(row.id, landlordUserId);
    if (listing) {
      listings.push(listing);
    }
  }

  return { items: listings };
}

module.exports = {
  createListing,
  listListings,
  getListingById,
  updateListing,
  deactivateListing,
  addListingImage,
  addListingVideo,
  setListingAmenities,
  listMyListings
};
