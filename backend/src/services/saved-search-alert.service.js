const { z } = require('zod');
const { query } = require('../config/database');
const { dispatchAlertBatch } = require('./alert-delivery.service');

const savedSearchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  filters: z.object({
    search: z.string().trim().max(120).optional(),
    city: z.string().trim().max(80).optional(),
    localityId: z.string().uuid().optional(),
    roomType: z.string().trim().max(30).optional(),
    furnishingType: z.string().trim().max(30).optional(),
    tenantGenderPreference: z.string().trim().max(20).optional(),
    minBudget: z.number().nonnegative().optional(),
    maxBudget: z.number().nonnegative().optional(),
    minSafetyScore: z.number().min(0).max(10).optional(),
    minTransportScore: z.number().min(0).max(10).optional()
  }).default({}),
  isActive: z.boolean().optional()
});

const savedSearchUpdateSchema = savedSearchSchema.partial();

const alertQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

async function assertStudent(studentUserId) {
  const result = await query('SELECT user_id FROM students WHERE user_id = $1 LIMIT 1', [studentUserId]);
  if (!result.rows[0]) {
    const error = new Error('Student profile is required for this operation.');
    error.statusCode = 403;
    throw error;
  }
}

async function createSavedSearch(studentUserId, payload) {
  await assertStudent(studentUserId);
  const data = savedSearchSchema.parse(payload);

  const result = await query(
    `
    INSERT INTO saved_searches (student_user_id, name, filters, is_active)
    VALUES ($1, $2, $3::jsonb, $4)
    RETURNING id, student_user_id, name, filters, is_active, last_alerted_at, created_at, updated_at
    `,
    [studentUserId, data.name, JSON.stringify(data.filters || {}), data.isActive ?? true]
  );

  return mapSavedSearch(result.rows[0]);
}

async function listSavedSearches(studentUserId) {
  await assertStudent(studentUserId);
  const result = await query(
    `
    SELECT id, student_user_id, name, filters, is_active, last_alerted_at, created_at, updated_at
    FROM saved_searches
    WHERE student_user_id = $1
    ORDER BY created_at DESC
    `,
    [studentUserId]
  );

  return { items: result.rows.map(mapSavedSearch) };
}

async function updateSavedSearch(studentUserId, savedSearchId, payload) {
  await assertStudent(studentUserId);
  const data = savedSearchUpdateSchema.parse(payload);

  const currentResult = await query(
    `
    SELECT id, student_user_id, name, filters, is_active, last_alerted_at, created_at, updated_at
    FROM saved_searches
    WHERE id = $1 AND student_user_id = $2
    LIMIT 1
    `,
    [savedSearchId, studentUserId]
  );

  const current = currentResult.rows[0];
  if (!current) {
    return null;
  }

  const nextName = data.name ?? current.name;
  const nextFilters = data.filters !== undefined ? data.filters : current.filters;
  const nextIsActive = data.isActive !== undefined ? data.isActive : current.is_active;

  const result = await query(
    `
    UPDATE saved_searches
    SET name = $3,
        filters = $4::jsonb,
        is_active = $5
    WHERE id = $1 AND student_user_id = $2
    RETURNING id, student_user_id, name, filters, is_active, last_alerted_at, created_at, updated_at
    `,
    [savedSearchId, studentUserId, nextName, JSON.stringify(nextFilters || {}), nextIsActive]
  );

  return mapSavedSearch(result.rows[0]);
}

async function deleteSavedSearch(studentUserId, savedSearchId) {
  await assertStudent(studentUserId);
  const result = await query(
    `
    DELETE FROM saved_searches
    WHERE id = $1 AND student_user_id = $2
    RETURNING id
    `,
    [savedSearchId, studentUserId]
  );

  return result.rowCount > 0;
}

async function generateAlertsForListing(listingId) {
  const listingResult = await query(
    `
    SELECT
      l.id,
      l.locality_id,
      l.title,
      l.description,
      l.monthly_rent,
      l.room_type,
      l.furnishing_type,
      l.tenant_gender_preference,
      l.status,
      loc.city,
      loc.safety_score,
      loc.transport_score
    FROM listings l
    JOIN localities loc ON loc.id = l.locality_id
    WHERE l.id = $1
    LIMIT 1
    `,
    [listingId]
  );

  const listing = listingResult.rows[0];
  if (!listing || listing.status !== 'active') {
    return 0;
  }

  const inserted = await query(
    `
    INSERT INTO student_alerts (student_user_id, saved_search_id, listing_id, alert_type)
    SELECT
      ss.student_user_id,
      ss.id,
      l.id,
      'new_listing'
    FROM saved_searches ss
    JOIN listings l ON l.id = $1
    JOIN localities loc ON loc.id = l.locality_id
    WHERE ss.is_active = TRUE
      AND (
        (ss.filters->>'search') IS NULL
        OR l.title ILIKE ('%' || (ss.filters->>'search') || '%')
        OR COALESCE(l.description, '') ILIKE ('%' || (ss.filters->>'search') || '%')
      )
      AND ((ss.filters->>'city') IS NULL OR loc.city ILIKE ('%' || (ss.filters->>'city') || '%'))
      AND ((ss.filters->>'localityId') IS NULL OR l.locality_id = (ss.filters->>'localityId')::uuid)
      AND ((ss.filters->>'roomType') IS NULL OR l.room_type ILIKE ('%' || (ss.filters->>'roomType') || '%'))
      AND ((ss.filters->>'furnishingType') IS NULL OR COALESCE(l.furnishing_type, '') ILIKE ('%' || (ss.filters->>'furnishingType') || '%'))
      AND ((ss.filters->>'tenantGenderPreference') IS NULL OR COALESCE(l.tenant_gender_preference, '') ILIKE ('%' || (ss.filters->>'tenantGenderPreference') || '%'))
      AND ((ss.filters->>'minBudget') IS NULL OR l.monthly_rent >= (ss.filters->>'minBudget')::numeric)
      AND ((ss.filters->>'maxBudget') IS NULL OR l.monthly_rent <= (ss.filters->>'maxBudget')::numeric)
      AND ((ss.filters->>'minSafetyScore') IS NULL OR COALESCE(loc.safety_score, 0) >= (ss.filters->>'minSafetyScore')::numeric)
      AND ((ss.filters->>'minTransportScore') IS NULL OR COALESCE(loc.transport_score, 0) >= (ss.filters->>'minTransportScore')::numeric)
    ON CONFLICT (saved_search_id, listing_id, alert_type) DO NOTHING
    RETURNING id, saved_search_id
    `,
    [listingId]
  );

  if (inserted.rowCount > 0) {
    const searchIds = [...new Set(inserted.rows.map((row) => row.saved_search_id).filter(Boolean))];
    if (searchIds.length > 0) {
      await query(
        `
        UPDATE saved_searches
        SET last_alerted_at = NOW()
        WHERE id = ANY($1::uuid[])
        `,
        [searchIds]
      );
    }

    const alertIds = inserted.rows.map((row) => row.id);
    try {
      await dispatchAlertBatch(alertIds);
    } catch (error) {
      console.error('Alert dispatch failed:', error);
    }
  }

  return inserted.rowCount;
}

async function listStudentAlerts(studentUserId, payload = {}) {
  await assertStudent(studentUserId);
  const filters = alertQuerySchema.parse(payload);
  const unreadOnly = filters.unreadOnly === 'true';

  const conditions = ['a.student_user_id = $1'];
  const params = [studentUserId];
  let index = 2;

  if (unreadOnly) {
    conditions.push('a.is_read = FALSE');
  }

  const offset = (filters.page - 1) * filters.limit;

  const rows = await query(
    `
    SELECT
      a.id,
      a.student_user_id,
      a.saved_search_id,
      a.listing_id,
      a.alert_type,
      a.is_read,
      a.delivered_at,
      a.created_at,
      ss.name AS saved_search_name,
      l.title,
      l.monthly_rent,
      l.room_type,
      l.furnishing_type,
      l.tenant_gender_preference,
      l.status,
      loc.city,
      loc.locality_name,
      li.image_url AS primary_image_url
    FROM student_alerts a
    LEFT JOIN saved_searches ss ON ss.id = a.saved_search_id
    JOIN listings l ON l.id = a.listing_id
    JOIN localities loc ON loc.id = l.locality_id
    LEFT JOIN LATERAL (
      SELECT image_url
      FROM listing_images
      WHERE listing_id = l.id
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
      LIMIT 1
    ) li ON TRUE
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.created_at DESC
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM student_alerts a
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      alertType: row.alert_type,
      isRead: row.is_read,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
      savedSearch: {
        id: row.saved_search_id,
        name: row.saved_search_name
      },
      listing: {
        id: row.listing_id,
        title: row.title,
        monthlyRent: row.monthly_rent,
        roomType: row.room_type,
        furnishingType: row.furnishing_type,
        tenantGenderPreference: row.tenant_gender_preference,
        status: row.status,
        city: row.city,
        localityName: row.locality_name,
        primaryImageUrl: row.primary_image_url
      }
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function markAlertRead(studentUserId, alertId) {
  await assertStudent(studentUserId);
  const result = await query(
    `
    UPDATE student_alerts
    SET is_read = TRUE
    WHERE id = $1 AND student_user_id = $2
    RETURNING id
    `,
    [alertId, studentUserId]
  );

  return result.rowCount > 0;
}

async function markAllAlertsRead(studentUserId) {
  await assertStudent(studentUserId);
  const result = await query(
    `
    UPDATE student_alerts
    SET is_read = TRUE
    WHERE student_user_id = $1 AND is_read = FALSE
    RETURNING id
    `,
    [studentUserId]
  );

  return result.rowCount;
}

function mapSavedSearch(row) {
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    name: row.name,
    filters: row.filters || {},
    isActive: row.is_active,
    lastAlertedAt: row.last_alerted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  createSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  generateAlertsForListing,
  listStudentAlerts,
  markAlertRead,
  markAllAlertsRead
};
