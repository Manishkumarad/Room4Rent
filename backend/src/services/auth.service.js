const { z } = require('zod');
const { withTransaction, query } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { issueRefreshSession, rotateRefreshSession, revokeRefreshToken } = require('./session.service');
const { requestPhoneOtp, verifyPhoneOtp } = require('./otp.service');
const { issueEmailVerification, verifyEmailByToken } = require('./email-verification.service');
const env = require('../config/env');

const registerSchema = z.object({
  role: z.enum(['student', 'landlord', 'admin']),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(100),
  profile: z.object({
    universityName: z.string().trim().max(160).optional(),
    courseName: z.string().trim().max(160).optional(),
    yearOfStudy: z.number().int().min(1).max(8).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    preferredGender: z.string().trim().max(20).optional(),
    businessName: z.string().trim().max(160).optional()
  }).optional()
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3),
  password: z.string().min(8).max(100)
});

const resendVerificationSchema = z.object({
  identifier: z.string().trim().min(3).max(255)
});

function mapUserPublic(userRow) {
  return {
    id: userRow.id,
    role: userRow.role,
    fullName: userRow.full_name,
    phone: userRow.phone,
    email: userRow.email,
    isPhoneVerified: userRow.is_phone_verified,
    isEmailVerified: userRow.is_email_verified,
    createdAt: userRow.created_at
  };
}

async function registerUser(payload, context = {}) {
  const data = registerSchema.parse(payload);
  const passwordHash = await hashPassword(data.password);

  const user = await withTransaction(async (client) => {
    const userInsertResult = await client.query(
      `
      INSERT INTO users (role, full_name, phone, email, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, role, full_name, phone, email, is_phone_verified, is_email_verified, created_at
      `,
      [
        data.role,
        data.fullName,
        data.phone,
        data.email || null,
        passwordHash
      ]
    );

    const user = userInsertResult.rows[0];

    if (data.role === 'student') {
      await client.query(
        `
        INSERT INTO students (user_id, university_name, course_name, year_of_study, budget_min, budget_max, preferred_gender)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          user.id,
          data.profile?.universityName || null,
          data.profile?.courseName || null,
          data.profile?.yearOfStudy || null,
          data.profile?.budgetMin || null,
          data.profile?.budgetMax || null,
          data.profile?.preferredGender || null
        ]
      );
    }

    if (data.role === 'landlord') {
      await client.query(
        `
        INSERT INTO landlords (user_id, business_name, verification_status)
        VALUES ($1, $2, 'pending')
        `,
        [user.id, data.profile?.businessName || null]
      );
    }

    return user;
  });

  if (user.email && !user.is_email_verified) {
    const verification = await issueEmailVerification(user);
    const verificationEmailSent = Boolean(verification?.delivery?.sent);
    const verificationDeliveryReason = verification?.delivery?.reason;
    const message = verificationEmailSent
      ? 'Account created. Please verify your email before logging in.'
      : 'Account created, but verification email could not be sent. Please use the verification link or contact support.';

    return {
      user: mapUserPublic(user),
      requiresEmailVerification: true,
      verificationEmailSent,
      verificationDeliveryReason,
      message,
      verificationUrl: env.nodeEnv === 'production' ? undefined : verification?.verificationUrl
    };
  }

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role
  });

  const refreshToken = await issueRefreshSession(
    { id: user.id, role: user.role },
    context
  );

  return {
    user: mapUserPublic(user),
    token: accessToken,
    accessToken,
    refreshToken
  };
}

async function loginUser(payload, context = {}) {
  const data = loginSchema.parse(payload);

  const result = await query(
    `
    SELECT id, role, full_name, phone, email, password_hash, is_phone_verified, is_email_verified, created_at
    FROM users
    WHERE phone = $1 OR email = $1
    LIMIT 1
    `,
    [data.identifier]
  );

  const user = result.rows[0];

  if (!user || !user.password_hash) {
    return null;
  }

  const isValidPassword = await comparePassword(data.password, user.password_hash);

  if (!isValidPassword) {
    return null;
  }

  if (user.email && !user.is_email_verified) {
    return {
      blockedReason: 'email_not_verified',
      user: mapUserPublic(user)
    };
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role
  });

  const refreshToken = await issueRefreshSession(
    { id: user.id, role: user.role },
    context
  );

  return {
    user: mapUserPublic(user),
    token: accessToken,
    accessToken,
    refreshToken
  };
}

async function refreshSession(payload, context = {}) {
  const schema = z.object({
    refreshToken: z.string().trim().min(20)
  });

  const data = schema.parse(payload);
  return rotateRefreshSession(data.refreshToken, context);
}

async function logoutSession(payload) {
  const schema = z.object({
    refreshToken: z.string().trim().min(20)
  });

  const data = schema.parse(payload);
  const revoked = await revokeRefreshToken(data.refreshToken);
  return { revoked };
}

async function resendEmailVerification(payload) {
  const data = resendVerificationSchema.parse(payload);
  const identifier = data.identifier.trim();

  const result = await query(
    `
    SELECT id, role, full_name, phone, email, is_phone_verified, is_email_verified, created_at
    FROM users
    WHERE LOWER(COALESCE(email, '')) = LOWER($1) OR phone = $1
    LIMIT 1
    `,
    [identifier]
  );

  const user = result.rows[0];

  if (!user) {
    return {
      accepted: true,
      message: 'If an account exists, a verification email has been sent.'
    };
  }

  if (!user.email) {
    return {
      accepted: false,
      message: 'This account does not have an email address. Please contact support.'
    };
  }

  if (user.is_email_verified) {
    return {
      accepted: true,
      alreadyVerified: true,
      message: 'Your email is already verified. You can log in now.'
    };
  }

  const verification = await issueEmailVerification(user);
  const verificationEmailSent = Boolean(verification?.delivery?.sent);
  const verificationDeliveryReason = verification?.delivery?.reason;

  return {
    accepted: true,
    requiresEmailVerification: true,
    verificationEmailSent,
    verificationDeliveryReason,
    message: verificationEmailSent
      ? 'Verification email sent. Please check your inbox.'
      : 'Verification email could not be delivered. Please use the verification link below.',
    verificationUrl: env.nodeEnv === 'production' ? undefined : verification?.verificationUrl
  };
}

module.exports = {
  registerUser,
  loginUser,
  verifyEmailByToken,
  refreshSession,
  logoutSession,
  resendEmailVerification,
  requestPhoneOtp,
  verifyPhoneOtp
};
