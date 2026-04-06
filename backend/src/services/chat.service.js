const { z } = require('zod');
const { query, withTransaction } = require('../config/database');

const createConversationSchema = z.object({
  participantUserId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  initialMessage: z.string().trim().min(1).max(4000).optional()
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  messageType: z.enum(['text', 'image', 'file']).default('text'),
  attachmentUrl: z.string().trim().url().optional()
});

const listMessagesSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime().optional()
});

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getUserRole(userId, client = null) {
  const runner = client || { query };
  const result = await runner.query(
    `
    SELECT id, role
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

function isAllowedPair(roleA, roleB) {
  return (roleA === 'student' && roleB === 'landlord') || (roleA === 'landlord' && roleB === 'student');
}

async function ensureParticipant(conversationId, userId, client = null) {
  const runner = client || { query };
  const participantResult = await runner.query(
    `
    SELECT 1
    FROM conversation_participants
    WHERE conversation_id = $1 AND user_id = $2
    `,
    [conversationId, userId]
  );

  if (!participantResult.rows[0]) {
    throw createError('You are not a participant of this conversation.', 403);
  }
}

async function createOrGetConversation(authUserId, payload) {
  const data = createConversationSchema.parse(payload);

  if (data.participantUserId === authUserId) {
    throw createError('You cannot start a conversation with yourself.', 400);
  }

  return withTransaction(async (client) => {
    const [authUser, participantUser] = await Promise.all([
      getUserRole(authUserId, client),
      getUserRole(data.participantUserId, client)
    ]);

    if (!authUser || !participantUser) {
      throw createError('User not found.', 404);
    }

    if (!isAllowedPair(authUser.role, participantUser.role)) {
      throw createError('Only student-landlord conversations are allowed.', 403);
    }

    if (data.listingId) {
      const listingResult = await client.query(
        `
        SELECT id, landlord_user_id
        FROM listings
        WHERE id = $1
        `,
        [data.listingId]
      );

      const listing = listingResult.rows[0];
      if (!listing) {
        throw createError('Listing not found.', 404);
      }

      const landlordInConversation = authUser.role === 'landlord' ? authUserId : data.participantUserId;
      if (listing.landlord_user_id !== landlordInConversation) {
        throw createError('Conversation landlord must be the owner of the selected listing.', 403);
      }
    }

    const existingResult = await client.query(
      `
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
      LEFT JOIN conversation_participants cp_other
        ON cp_other.conversation_id = c.id
       AND cp_other.user_id NOT IN ($1, $2)
      WHERE cp_other.user_id IS NULL
        AND (
          ($3::uuid IS NULL AND c.listing_id IS NULL)
          OR c.listing_id = $3::uuid
        )
      LIMIT 1
      `,
      [authUserId, data.participantUserId, data.listingId || null]
    );

    const existingConversationId = existingResult.rows[0]?.id;
    if (existingConversationId) {
      if (data.initialMessage) {
        await client.query(
          `
          INSERT INTO messages (conversation_id, sender_user_id, message_type, body, attachment_url)
          VALUES ($1, $2, 'text', $3, NULL)
          `,
          [existingConversationId, authUserId, data.initialMessage]
        );
      }

      const hydrated = await getConversationById(existingConversationId, authUserId, client);
      return { created: false, conversation: hydrated };
    }

    const conversationResult = await client.query(
      `
      INSERT INTO conversations (listing_id, created_by)
      VALUES ($1, $2)
      RETURNING id
      `,
      [data.listingId || null, authUserId]
    );

    const conversationId = conversationResult.rows[0].id;

    await client.query(
      `
      INSERT INTO conversation_participants (conversation_id, user_id)
      VALUES ($1, $2), ($1, $3)
      `,
      [conversationId, authUserId, data.participantUserId]
    );

    if (data.initialMessage) {
      await client.query(
        `
        INSERT INTO messages (conversation_id, sender_user_id, message_type, body, attachment_url)
        VALUES ($1, $2, 'text', $3, NULL)
        `,
        [conversationId, authUserId, data.initialMessage]
      );
    }

    const hydrated = await getConversationById(conversationId, authUserId, client);
    return { created: true, conversation: hydrated };
  });
}

async function listMyConversations(authUserId) {
  const result = await query(
    `
    SELECT
      c.id,
      c.listing_id,
      c.created_by,
      c.created_at,
      c.updated_at,
      listing.title AS listing_title,
      listing.monthly_rent,
      other.user_id AS participant_user_id,
      other_user.full_name AS participant_full_name,
      other_user.role AS participant_role,
      lm.id AS last_message_id,
      lm.body AS last_message_body,
      lm.message_type AS last_message_type,
      lm.sent_at AS last_message_sent_at,
      lm.sender_user_id AS last_message_sender_user_id,
      unread.unread_count
    FROM conversation_participants mine
    JOIN conversations c ON c.id = mine.conversation_id
    LEFT JOIN listings listing ON listing.id = c.listing_id
    JOIN LATERAL (
      SELECT cp.user_id
      FROM conversation_participants cp
      WHERE cp.conversation_id = c.id
        AND cp.user_id <> $1
      LIMIT 1
    ) other ON TRUE
    JOIN users other_user ON other_user.id = other.user_id
    LEFT JOIN LATERAL (
      SELECT m.id, m.body, m.message_type, m.sent_at, m.sender_user_id
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS unread_count
      FROM messages m
      WHERE m.conversation_id = c.id
        AND m.sender_user_id <> $1
        AND m.is_read = FALSE
    ) unread ON TRUE
    WHERE mine.user_id = $1
    ORDER BY COALESCE(lm.sent_at, c.created_at) DESC
    `,
    [authUserId]
  );

  return {
    items: result.rows.map((row) => ({
      id: row.id,
      listing: row.listing_id
        ? {
            id: row.listing_id,
            title: row.listing_title,
            monthlyRent: row.monthly_rent
          }
        : null,
      participant: {
        userId: row.participant_user_id,
        fullName: row.participant_full_name,
        role: row.participant_role
      },
      lastMessage: row.last_message_id
        ? {
            id: row.last_message_id,
            body: row.last_message_body,
            messageType: row.last_message_type,
            sentAt: row.last_message_sent_at,
            senderUserId: row.last_message_sender_user_id
          }
        : null,
      unreadCount: row.unread_count || 0,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  };
}

async function getConversationById(conversationId, authUserId, client = null) {
  const runner = client || { query };
  await ensureParticipant(conversationId, authUserId, client);

  const result = await runner.query(
    `
    SELECT
      c.id,
      c.listing_id,
      c.created_by,
      c.created_at,
      c.updated_at,
      listing.title AS listing_title,
      listing.monthly_rent,
      cp.user_id AS participant_user_id,
      u.full_name AS participant_full_name,
      u.role AS participant_role
    FROM conversations c
    LEFT JOIN listings listing ON listing.id = c.listing_id
    JOIN conversation_participants cp ON cp.conversation_id = c.id
    JOIN users u ON u.id = cp.user_id
    WHERE c.id = $1
    ORDER BY cp.joined_at ASC
    `,
    [conversationId]
  );

  const rows = result.rows;
  if (!rows.length) {
    throw createError('Conversation not found.', 404);
  }

  const base = rows[0];
  return {
    id: base.id,
    listing: base.listing_id
      ? {
          id: base.listing_id,
          title: base.listing_title,
          monthlyRent: base.monthly_rent
        }
      : null,
    participants: rows.map((row) => ({
      userId: row.participant_user_id,
      fullName: row.participant_full_name,
      role: row.participant_role
    })),
    createdBy: base.created_by,
    createdAt: base.created_at,
    updatedAt: base.updated_at
  };
}

async function listConversationMessages(conversationId, authUserId, payload = {}) {
  const filters = listMessagesSchema.parse(payload);
  await ensureParticipant(conversationId, authUserId);

  const params = [conversationId];
  let beforeClause = '';

  if (filters.before) {
    params.push(new Date(filters.before));
    beforeClause = `AND m.sent_at < $${params.length}`;
  }

  params.push(filters.limit);

  const result = await query(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.sender_user_id,
      u.full_name AS sender_full_name,
      u.role AS sender_role,
      m.message_type,
      m.body,
      m.attachment_url,
      m.is_read,
      m.sent_at
    FROM messages m
    JOIN users u ON u.id = m.sender_user_id
    WHERE m.conversation_id = $1
      ${beforeClause}
    ORDER BY m.sent_at DESC, m.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const chronological = result.rows.reverse();
  return {
    items: chronological.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      sender: {
        userId: row.sender_user_id,
        fullName: row.sender_full_name,
        role: row.sender_role
      },
      messageType: row.message_type,
      body: row.body,
      attachmentUrl: row.attachment_url,
      isRead: row.is_read,
      sentAt: row.sent_at
    })),
    pagination: {
      limit: filters.limit,
      hasMore: result.rows.length === filters.limit,
      nextBefore: chronological[0]?.sentAt || null
    }
  };
}

async function sendMessage(conversationId, senderUserId, payload) {
  const data = sendMessageSchema.parse(payload);

  const inserted = await withTransaction(async (client) => {
    await ensureParticipant(conversationId, senderUserId, client);

    const insertResult = await client.query(
      `
      INSERT INTO messages (conversation_id, sender_user_id, message_type, body, attachment_url)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, conversation_id, sender_user_id, message_type, body, attachment_url, is_read, sent_at
      `,
      [conversationId, senderUserId, data.messageType, data.body, data.attachmentUrl || null]
    );

    await client.query(
      `
      UPDATE conversations
      SET updated_at = NOW()
      WHERE id = $1
      `,
      [conversationId]
    );

    return insertResult.rows[0];
  });

  const senderResult = await query(
    `
    SELECT full_name, role
    FROM users
    WHERE id = $1
    `,
    [senderUserId]
  );

  return {
    id: inserted.id,
    conversationId: inserted.conversation_id,
    sender: {
      userId: senderUserId,
      fullName: senderResult.rows[0]?.full_name || null,
      role: senderResult.rows[0]?.role || null
    },
    messageType: inserted.message_type,
    body: inserted.body,
    attachmentUrl: inserted.attachment_url,
    isRead: inserted.is_read,
    sentAt: inserted.sent_at
  };
}

async function markConversationRead(conversationId, authUserId) {
  await ensureParticipant(conversationId, authUserId);

  const result = await query(
    `
    UPDATE messages
    SET is_read = TRUE
    WHERE conversation_id = $1
      AND sender_user_id <> $2
      AND is_read = FALSE
    `,
    [conversationId, authUserId]
  );

  return result.rowCount;
}

module.exports = {
  createOrGetConversation,
  listMyConversations,
  getConversationById,
  listConversationMessages,
  sendMessage,
  markConversationRead
};
