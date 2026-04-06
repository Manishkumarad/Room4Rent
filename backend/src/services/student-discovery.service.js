const { z } = require('zod');
const { query } = require('../config/database');
const { listListings } = require('./listing.service');

const discoverySchema = z.object({
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
  localityId: z.string().uuid().optional(),
  roomType: z.string().trim().optional(),
  furnishingType: z.string().trim().optional(),
  tenantGenderPreference: z.string().trim().max(20).optional(),
  minBudget: z.coerce.number().nonnegative().optional(),
  maxBudget: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12)
});

const localityInsightsSchema = z.object({
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  minSafetyScore: z.coerce.number().min(0).max(10).optional(),
  minTransportScore: z.coerce.number().min(0).max(10).optional(),
  maxAvgRent: z.coerce.number().nonnegative().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

async function getStudentBudgetDefaults(studentUserId) {
  const result = await query(
    `
    SELECT budget_min, budget_max
    FROM students
    WHERE user_id = $1
    LIMIT 1
    `,
    [studentUserId]
  );

  return {
    minBudget: result.rows[0]?.budget_min ? Number(result.rows[0].budget_min) : undefined,
    maxBudget: result.rows[0]?.budget_max ? Number(result.rows[0].budget_max) : undefined
  };
}

async function searchListingsForStudent(studentUserId, payload = {}) {
  const filters = discoverySchema.parse(payload);
  const defaults = await getStudentBudgetDefaults(studentUserId);

  const minRent = filters.minBudget ?? defaults.minBudget;
  const maxRent = filters.maxBudget ?? defaults.maxBudget;

  const listings = await listListings({
    search: filters.search,
    city: filters.city,
    localityId: filters.localityId,
    roomType: filters.roomType,
    furnishingType: filters.furnishingType,
    tenantGenderPreference: filters.tenantGenderPreference,
    minRent,
    maxRent,
    page: filters.page,
    limit: filters.limit,
    status: 'active'
  });

  const localityIds = [...new Set(listings.items.map((item) => item.localityId))];
  const insightRows = localityIds.length
    ? await query(
        `
        SELECT
          l.locality_id,
          COUNT(*)::int AS active_listing_count,
          AVG(l.monthly_rent)::numeric(10,2) AS avg_listing_rent,
          MIN(l.monthly_rent)::numeric(10,2) AS min_listing_rent,
          MAX(l.monthly_rent)::numeric(10,2) AS max_listing_rent
        FROM listings l
        WHERE l.status = 'active' AND l.locality_id = ANY($1::uuid[])
        GROUP BY l.locality_id
        `,
        [localityIds]
      )
    : { rows: [] };

  const insightMap = new Map(insightRows.rows.map((row) => [row.locality_id, row]));

  return {
    appliedFilters: {
      ...filters,
      minBudget: minRent,
      maxBudget: maxRent
    },
    items: listings.items.map((item) => {
      const row = insightMap.get(item.localityId);
      return {
        ...item,
        localityInsights: row
          ? {
              activeListingCount: row.active_listing_count,
              avgListingRent: row.avg_listing_rent,
              minListingRent: row.min_listing_rent,
              maxListingRent: row.max_listing_rent,
              safetyScore: item.locality.safetyScore,
              transportScore: item.locality.transportScore
            }
          : null
      };
    }),
    pagination: listings.pagination
  };
}

async function getLocalityInsights(payload = {}) {
  const filters = localityInsightsSchema.parse(payload);
  const conditions = ['1=1'];
  const params = [];
  let index = 1;

  if (filters.city) {
    conditions.push(`loc.city ILIKE $${index}`);
    params.push(`%${filters.city}%`);
    index += 1;
  }

  if (filters.state) {
    conditions.push(`loc.state ILIKE $${index}`);
    params.push(`%${filters.state}%`);
    index += 1;
  }

  if (filters.minSafetyScore !== undefined) {
    conditions.push(`loc.safety_score >= $${index}`);
    params.push(filters.minSafetyScore);
    index += 1;
  }

  if (filters.minTransportScore !== undefined) {
    conditions.push(`loc.transport_score >= $${index}`);
    params.push(filters.minTransportScore);
    index += 1;
  }

  if (filters.maxAvgRent !== undefined) {
    conditions.push(`COALESCE(loc.avg_rent, 0) <= $${index}`);
    params.push(filters.maxAvgRent);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;

  const rows = await query(
    `
    SELECT
      loc.id,
      loc.city,
      loc.state,
      loc.locality_name,
      loc.pincode,
      loc.safety_score,
      loc.transport_score,
      loc.avg_rent,
      COUNT(l.id)::int AS active_listing_count,
      AVG(l.monthly_rent)::numeric(10,2) AS avg_listing_rent,
      MIN(l.monthly_rent)::numeric(10,2) AS min_listing_rent,
      MAX(l.monthly_rent)::numeric(10,2) AS max_listing_rent
    FROM localities loc
    LEFT JOIN listings l ON l.locality_id = loc.id AND l.status = 'active'
    WHERE ${conditions.join(' AND ')}
    GROUP BY loc.id
    ORDER BY active_listing_count DESC, loc.safety_score DESC NULLS LAST
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM localities loc
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      city: row.city,
      state: row.state,
      localityName: row.locality_name,
      pincode: row.pincode,
      safetyScore: row.safety_score,
      transportScore: row.transport_score,
      avgRent: row.avg_rent,
      activeListingCount: row.active_listing_count,
      avgListingRent: row.avg_listing_rent,
      minListingRent: row.min_listing_rent,
      maxListingRent: row.max_listing_rent
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

module.exports = {
  searchListingsForStudent,
  getLocalityInsights
};
