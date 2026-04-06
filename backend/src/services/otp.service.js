const crypto = require('crypto');
const { z } = require('zod');
const { query, withTransaction } = require('../config/database');
const env = require('../config/env');

const requestOtpSchema = z.object({
  phone: z.string().trim().min(8).max(20)
});

const verifyOtpSchema = z.object({
  phone: z.string().trim().min(8).max(20),
  otp: z.string().trim().length(6)
});

function generateOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function parseDurationMs(expiresIn) {
  const match = String(expiresIn).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 10 * 60 * 1000;
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

async function requestPhoneOtp(payload) {
  const data = requestOtpSchema.parse(payload);

  const userResult = await query(
    `
    SELECT id, phone, is_phone_verified
    FROM users
    WHERE phone = $1
    LIMIT 1
    `,
    [data.phone]
  );

  const user = userResult.rows[0];
  if (!user) {
    return { message: 'If the phone exists, an OTP has been generated.' };
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + parseDurationMs(env.phoneOtpExpiresIn));

  await withTransaction(async (client) => {
    await client.query('DELETE FROM phone_verification_otps WHERE user_id = $1 AND consumed_at IS NULL', [user.id]);
    await client.query(
      `
      INSERT INTO phone_verification_otps (user_id, phone, otp_hash, expires_at)
      VALUES ($1, $2, $3, $4)
      `,
      [user.id, user.phone, otpHash, expiresAt]
    );
  });

  return {
    message: 'OTP generated successfully.',
    ...(process.env.NODE_ENV === 'production' ? {} : { devOtp: otp })
  };
}

async function verifyPhoneOtp(payload) {
  const data = verifyOtpSchema.parse(payload);

  const userResult = await query(
    `
    SELECT id, phone, is_phone_verified
    FROM users
    WHERE phone = $1
    LIMIT 1
    `,
    [data.phone]
  );

  const user = userResult.rows[0];
  if (!user) {
    return null;
  }

  const otpResult = await query(
    `
    SELECT id, otp_hash, expires_at, attempts_left, consumed_at
    FROM phone_verification_otps
    WHERE user_id = $1 AND phone = $2 AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [user.id, user.phone]
  );

  const otpRow = otpResult.rows[0];
  if (!otpRow) {
    return { ok: false, message: 'OTP not found or expired.' };
  }

  if (new Date(otpRow.expires_at).getTime() <= Date.now()) {
    return { ok: false, message: 'OTP expired.' };
  }

  if (otpRow.attempts_left <= 0) {
    return { ok: false, message: 'OTP attempts exhausted.' };
  }

  const matches = hashOtp(data.otp) === otpRow.otp_hash;
  if (!matches) {
    await query(
      `
      UPDATE phone_verification_otps
      SET attempts_left = attempts_left - 1
      WHERE id = $1
      `,
      [otpRow.id]
    );
    return { ok: false, message: 'Invalid OTP.' };
  }

  await withTransaction(async (client) => {
    await client.query('UPDATE users SET is_phone_verified = TRUE WHERE id = $1', [user.id]);
    await client.query('UPDATE phone_verification_otps SET consumed_at = NOW() WHERE id = $1', [otpRow.id]);
  });

  return { ok: true, message: 'Phone verified successfully.' };
}

module.exports = {
  requestPhoneOtp,
  verifyPhoneOtp
};
