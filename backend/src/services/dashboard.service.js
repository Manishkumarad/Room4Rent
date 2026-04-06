const { z } = require('zod');
const { query } = require('../config/database');

const trendQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(14)
});

async function getAdminOverview() {
  const [usersResult, listingsResult, docsResult, subsResult, paymentsResult, inquiryResult] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'student')::int AS total_students,
        COUNT(*) FILTER (WHERE role = 'landlord')::int AS total_landlords,
        COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins
      FROM users
      `
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total_listings,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_listings,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::int AS pending_verification_listings,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_listings
      FROM listings
      `
    ),
    query(
      `
      SELECT
        COUNT(*) FILTER (WHERE verification_status = 'pending')::int AS pending_documents,
        COUNT(*) FILTER (WHERE verification_status = 'verified')::int AS verified_documents,
        COUNT(*) FILTER (WHERE verification_status = 'rejected')::int AS rejected_documents
      FROM landlord_documents
      `
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total_subscriptions,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_subscriptions,
        COUNT(*) FILTER (WHERE status = 'expired')::int AS expired_subscriptions,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_subscriptions
      FROM landlord_subscriptions
      `
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE status = 'captured')::int AS captured_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'captured'), 0)::numeric(12,2) AS captured_amount
      FROM payments
      `
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total_inquiries,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_inquiries
      FROM listing_inquiries
      `
    )
  ]);

  return {
    users: usersResult.rows[0],
    listings: listingsResult.rows[0],
    verification: docsResult.rows[0],
    subscriptions: subsResult.rows[0],
    payments: paymentsResult.rows[0],
    engagement: inquiryResult.rows[0]
  };
}

async function getAdminTrends(payload = {}) {
  const filters = trendQuerySchema.parse(payload);

  const [userTrend, listingTrend, paymentTrend] = await Promise.all([
    query(
      `
      SELECT
        DATE(created_at) AS day,
        COUNT(*)::int AS count
      FROM users
      WHERE created_at >= NOW() - ($1::int || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY day ASC
      `,
      [filters.days]
    ),
    query(
      `
      SELECT
        DATE(created_at) AS day,
        COUNT(*)::int AS count
      FROM listings
      WHERE created_at >= NOW() - ($1::int || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY day ASC
      `,
      [filters.days]
    ),
    query(
      `
      SELECT
        DATE(created_at) AS day,
        COUNT(*) FILTER (WHERE status = 'captured')::int AS captured_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'captured'), 0)::numeric(12,2) AS captured_amount
      FROM payments
      WHERE created_at >= NOW() - ($1::int || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY day ASC
      `,
      [filters.days]
    )
  ]);

  return {
    windowDays: filters.days,
    users: userTrend.rows,
    listings: listingTrend.rows,
    payments: paymentTrend.rows
  };
}

async function getLandlordDashboard(landlordUserId) {
  const [listingsResult, inquiriesResult, subscriptionResult, immersiveResult, chatResult] = await Promise.all([
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::int AS pending_verification,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
      FROM listings
      WHERE landlord_user_id = $1
      `,
      [landlordUserId]
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE li.status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE li.status = 'responded')::int AS responded,
        COUNT(*) FILTER (WHERE li.status = 'closed')::int AS closed
      FROM listing_inquiries li
      JOIN listings l ON l.id = li.listing_id
      WHERE l.landlord_user_id = $1
      `,
      [landlordUserId]
    ),
    query(
      `
      SELECT status, starts_at, ends_at
      FROM landlord_subscriptions
      WHERE landlord_user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [landlordUserId]
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE lia.processing_status = 'ready')::int AS ready,
        COUNT(*) FILTER (WHERE lia.processing_status = 'pending')::int AS pending
      FROM listing_immersive_assets lia
      JOIN listings l ON l.id = lia.listing_id
      WHERE l.landlord_user_id = $1
      `,
      [landlordUserId]
    ),
    query(
      `
      SELECT COUNT(*)::int AS unread
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      WHERE m.sender_user_id <> $1
        AND m.is_read = FALSE
      `,
      [landlordUserId]
    )
  ]);

  return {
    listings: listingsResult.rows[0],
    inquiries: inquiriesResult.rows[0],
    subscription: subscriptionResult.rows[0] || null,
    immersiveAssets: immersiveResult.rows[0],
    unreadChatMessages: chatResult.rows[0]?.unread || 0
  };
}

async function getStudentDashboard(studentUserId) {
  const [savedResult, inquiryResult, alertResult, roommateResult, chatResult] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS total
      FROM saved_listings
      WHERE student_user_id = $1
      `,
      [studentUserId]
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open,
        COUNT(*) FILTER (WHERE status = 'responded')::int AS responded,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed
      FROM listing_inquiries
      WHERE student_user_id = $1
      `,
      [studentUserId]
    ),
    query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread
      FROM student_alerts
      WHERE student_user_id = $1
      `,
      [studentUserId]
    ),
    query(
      `
      SELECT is_opted_in
      FROM roommate_profiles
      WHERE student_user_id = $1
      LIMIT 1
      `,
      [studentUserId]
    ),
    query(
      `
      SELECT COUNT(*)::int AS unread
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = $1
      WHERE m.sender_user_id <> $1
        AND m.is_read = FALSE
      `,
      [studentUserId]
    )
  ]);

  return {
    savedListings: savedResult.rows[0]?.total || 0,
    inquiries: inquiryResult.rows[0],
    alerts: alertResult.rows[0],
    roommate: roommateResult.rows[0] || { is_opted_in: false },
    unreadChatMessages: chatResult.rows[0]?.unread || 0
  };
}

module.exports = {
  getAdminOverview,
  getAdminTrends,
  getLandlordDashboard,
  getStudentDashboard
};
