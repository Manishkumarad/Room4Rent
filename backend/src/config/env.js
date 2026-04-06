const dotenv = require('dotenv');

dotenv.config({ override: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  appBaseUrl: process.env.APP_BASE_URL,
  emailVerificationWebhookUrl: process.env.EMAIL_VERIFICATION_WEBHOOK_URL,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 0),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM,
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  phoneOtpExpiresIn: process.env.PHONE_OTP_EXPIRES_IN || '10m',
  emailAlertWebhookUrl: process.env.EMAIL_ALERT_WEBHOOK_URL,
  whatsappProvider: process.env.WHATSAPP_PROVIDER,
  whatsappAlertWebhookUrl: process.env.WHATSAPP_ALERT_WEBHOOK_URL,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
  metaWhatsappAccessToken: process.env.META_WHATSAPP_ACCESS_TOKEN,
  metaWhatsappPhoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID,
  metaWhatsappApiVersion: process.env.META_WHATSAPP_API_VERSION,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  workerPollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 5000),
  immersiveJobBatchSize: Number(process.env.IMMERSIVE_JOB_BATCH_SIZE || 5),
  paymentReconciliationBatchSize: Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || 10),
  paymentReconciliationCaptureAfterMinutes: Number(process.env.PAYMENT_RECONCILIATION_CAPTURE_AFTER_MINUTES || 2),
  workerAlertWebhookUrl: process.env.WORKER_ALERT_WEBHOOK_URL,
  workerQueueLagAlertThresholdSeconds: Number(process.env.WORKER_QUEUE_LAG_ALERT_THRESHOLD_SECONDS || 120),
  workerFailedJobsAlertThreshold: Number(process.env.WORKER_FAILED_JOBS_ALERT_THRESHOLD || 3),
  workerAlertCooldownMinutes: Number(process.env.WORKER_ALERT_COOLDOWN_MINUTES || 10),
  workerHeartbeatStaleAfterSeconds: Number(process.env.WORKER_HEARTBEAT_STALE_AFTER_SECONDS || 45),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000'
};

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required in environment variables.');
}

if (!env.jwtAccessSecret) {
  throw new Error('JWT_ACCESS_SECRET is required in environment variables.');
}

if (!env.jwtRefreshSecret) {
  throw new Error('JWT_REFRESH_SECRET is required in environment variables.');
}

module.exports = env;
