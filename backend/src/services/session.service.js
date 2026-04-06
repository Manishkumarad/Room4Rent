const crypto = require('crypto');
const { query } = require('../config/database');
const env = require('../config/env');
const { signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createRefreshTokenPayload(user) {
  const jti = crypto.randomUUID();
  return {
    token: signRefreshToken({
      sub: user.id,
      role: user.role,
      jti
    }),
    jti,
    expiresAt: new Date(Date.now() + parseRefreshExpiryMs(env.refreshTokenExpiresIn))
  };
}

function parseRefreshExpiryMs(expiresIn) {
  if (typeof expiresIn === 'number') {
    return expiresIn * 1000;
  }

  const match = String(expiresIn).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 30 * 24 * 60 * 60 * 1000;
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return value * multipliers[unit];
}

async function persistRefreshSession({ userId, jti, token, expiresAt, userAgent, ipAddress }) {
  await query(
    `
    INSERT INTO refresh_sessions (user_id, token_jti, token_hash, user_agent, ip_address, expires_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [userId, jti, hashToken(token), userAgent || null, ipAddress || null, expiresAt]
  );
}

async function issueRefreshSession(user, context = {}) {
  const payload = createRefreshTokenPayload(user);
  await persistRefreshSession({
    userId: user.id,
    jti: payload.jti,
    token: payload.token,
    expiresAt: payload.expiresAt,
    userAgent: context.userAgent,
    ipAddress: context.ipAddress
  });

  return payload.token;
}

async function rotateRefreshSession(refreshToken, context = {}) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    return null;
  }

  const tokenHash = hashToken(refreshToken);

  const sessionResult = await query(
    `
    SELECT rs.id, rs.user_id, rs.token_jti, rs.expires_at, rs.revoked_at, u.role
    FROM refresh_sessions rs
    JOIN users u ON u.id = rs.user_id
    WHERE rs.token_jti = $1 AND rs.token_hash = $2
    LIMIT 1
    `,
    [decoded.jti, tokenHash]
  );

  const session = sessionResult.rows[0];
  if (!session || session.revoked_at) {
    return null;
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  await query('UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);

  const user = { id: session.user_id, role: session.role };
  const nextRefreshToken = await issueRefreshSession(user, context);
  const accessToken = require('../utils/jwt').signAccessToken({ sub: user.id, role: user.role });

  return {
    user,
    accessToken,
    refreshToken: nextRefreshToken
  };
}

async function revokeRefreshToken(refreshToken) {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    return false;
  }

  const tokenHash = hashToken(refreshToken);

  const result = await query(
    `
    UPDATE refresh_sessions
    SET revoked_at = NOW()
    WHERE token_jti = $1 AND token_hash = $2 AND revoked_at IS NULL
    RETURNING id
    `,
    [decoded.jti, tokenHash]
  );

  return result.rowCount > 0;
}

module.exports = {
  hashToken,
  issueRefreshSession,
  rotateRefreshSession,
  revokeRefreshToken
};
