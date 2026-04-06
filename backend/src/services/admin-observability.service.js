const { z } = require('zod');
const { query } = require('../config/database');

const auditQuerySchema = z.object({
  actorUserId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

const webhookQuerySchema = z.object({
  provider: z.string().trim().min(1).max(30).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  status: z.string().trim().min(1).max(30).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

async function listAuditLogs(payload = {}) {
  const filters = auditQuerySchema.parse(payload);
  const conditions = ['1=1'];
  const params = [];
  let index = 1;

  if (filters.actorUserId) {
    conditions.push(`al.actor_user_id = $${index}`);
    params.push(filters.actorUserId);
    index += 1;
  }

  if (filters.action) {
    conditions.push(`al.action ILIKE $${index}`);
    params.push(`%${filters.action}%`);
    index += 1;
  }

  if (filters.entityType) {
    conditions.push(`al.entity_type ILIKE $${index}`);
    params.push(`%${filters.entityType}%`);
    index += 1;
  }

  if (filters.entityId) {
    conditions.push(`al.entity_id = $${index}`);
    params.push(filters.entityId);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;

  const rowsResult = await query(
    `
    SELECT
      al.id,
      al.actor_user_id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.metadata,
      al.created_at,
      u.full_name AS actor_full_name,
      u.role AS actor_role
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.actor_user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY al.created_at DESC
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM audit_logs al
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rowsResult.rows.map((row) => ({
      id: row.id,
      actor: row.actor_user_id
        ? {
            userId: row.actor_user_id,
            fullName: row.actor_full_name,
            role: row.actor_role
          }
        : null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata,
      createdAt: row.created_at
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

async function listPaymentWebhookEvents(payload = {}) {
  const filters = webhookQuerySchema.parse(payload);
  const conditions = ['1=1'];
  const params = [];
  let index = 1;

  if (filters.provider) {
    conditions.push(`pwe.gateway_provider ILIKE $${index}`);
    params.push(`%${filters.provider}%`);
    index += 1;
  }

  if (filters.eventType) {
    conditions.push(`pwe.event_type ILIKE $${index}`);
    params.push(`%${filters.eventType}%`);
    index += 1;
  }

  if (filters.status) {
    conditions.push(`pwe.status ILIKE $${index}`);
    params.push(`%${filters.status}%`);
    index += 1;
  }

  const offset = (filters.page - 1) * filters.limit;

  const rowsResult = await query(
    `
    SELECT
      pwe.id,
      pwe.gateway_provider,
      pwe.gateway_event_id,
      pwe.event_type,
      pwe.status,
      pwe.received_at,
      pwe.processed_at,
      pwe.payload
    FROM payment_webhook_events pwe
    WHERE ${conditions.join(' AND ')}
    ORDER BY pwe.received_at DESC
    LIMIT $${index} OFFSET $${index + 1}
    `,
    [...params, filters.limit, offset]
  );

  const countResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM payment_webhook_events pwe
    WHERE ${conditions.join(' AND ')}
    `,
    params
  );

  return {
    items: rowsResult.rows.map((row) => ({
      id: row.id,
      provider: row.gateway_provider,
      gatewayEventId: row.gateway_event_id,
      eventType: row.event_type,
      status: row.status,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      payload: row.payload
    })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: countResult.rows[0]?.total || 0
    }
  };
}

module.exports = {
  listAuditLogs,
  listPaymentWebhookEvents
};
