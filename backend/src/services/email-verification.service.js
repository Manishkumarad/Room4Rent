const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { query, withTransaction } = require('../config/database');
const env = require('../config/env');

const DEFAULT_EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getApiBaseUrl() {
  if (env.appBaseUrl) {
    return env.appBaseUrl.replace(/\/$/, '');
  }

  return `http://localhost:${env.port}`;
}

function buildVerificationUrl(rawToken) {
  const apiBase = getApiBaseUrl();
  return `${apiBase}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
}

async function callWebhook(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Verification email webhook failed with ${response.status}`);
  }
}

async function sendVerificationEmail({ email, fullName, verificationUrl }) {
  const safeName = fullName || 'there';
  const subject = 'Verify your Room4Rent account';
  const html = [
    `<p>Hi ${safeName},</p>`,
    '<p>Thanks for signing up to Room4Rent.</p>',
    `<p>Please verify your email by clicking this link:</p>`,
    `<p><a href="${verificationUrl}">Verify my email</a></p>`,
    '<p>This verification link expires in 24 hours.</p>'
  ].join('');

  const webhookUrl = env.emailVerificationWebhookUrl || env.emailAlertWebhookUrl;
  if (webhookUrl) {
    const payload = {
      to: email,
      subject,
      html
    };

    try {
      await callWebhook(webhookUrl, payload);
      return { sent: true, provider: 'webhook' };
    } catch (error) {
      // Fall through to SMTP fallback if configured.
    }
  }

  if (env.smtpHost && env.smtpPort && env.smtpFrom) {
    try {
      const transporterConfig = {
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure
      };

      if (env.smtpUser && env.smtpPass) {
        transporterConfig.auth = {
          user: env.smtpUser,
          pass: env.smtpPass
        };
      }

      const transporter = nodemailer.createTransport(transporterConfig);

      await transporter.sendMail({
        from: env.smtpFrom,
        to: email,
        subject,
        html
      });

      return { sent: true, provider: 'smtp' };
    } catch (error) {
      return {
        sent: false,
        reason: error.message || 'SMTP delivery failed.'
      };
    }
  }

  return {
    sent: false,
    reason: 'No delivery provider configured. Set EMAIL_VERIFICATION_WEBHOOK_URL or SMTP_* variables.'
  };
}

async function issueEmailVerification(user) {
  if (!user.email) {
    return null;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + DEFAULT_EMAIL_TOKEN_TTL_MS);

  await query(
    `
    INSERT INTO email_verification_tokens (user_id, email, token_hash, expires_at)
    VALUES ($1, $2, $3, $4)
    `,
    [user.id, user.email, tokenHash, expiresAt]
  );

  const verificationUrl = buildVerificationUrl(rawToken);
  const delivery = await sendVerificationEmail({
    email: user.email,
    fullName: user.full_name,
    verificationUrl
  });

  return {
    expiresAt,
    verificationUrl,
    delivery
  };
}

async function verifyEmailByToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { ok: false, message: 'Verification token is required.' };
  }

  const tokenHash = hashToken(rawToken);
  const result = await query(
    `
    SELECT id, user_id, email, expires_at, consumed_at
    FROM email_verification_tokens
    WHERE token_hash = $1
    LIMIT 1
    `,
    [tokenHash]
  );

  const tokenRow = result.rows[0];
  if (!tokenRow) {
    return { ok: false, message: 'Invalid verification token.' };
  }

  if (tokenRow.consumed_at) {
    return { ok: false, message: 'Verification link is already used.' };
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    return { ok: false, message: 'Verification link has expired.' };
  }

  await withTransaction(async (client) => {
    await client.query(
      `
      UPDATE email_verification_tokens
      SET consumed_at = NOW(), updated_at = NOW()
      WHERE id = $1
      `,
      [tokenRow.id]
    );

    await client.query(
      `
      UPDATE users
      SET is_email_verified = TRUE, updated_at = NOW()
      WHERE id = $1
      `,
      [tokenRow.user_id]
    );
  });

  return {
    ok: true,
    message: 'Email verified successfully. You can now log in.',
    email: tokenRow.email
  };
}

module.exports = {
  issueEmailVerification,
  verifyEmailByToken
};
