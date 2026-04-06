const env = require('../config/env');
const { query } = require('../config/database');
const { publishToStudent } = require('./alert-stream.service');

async function callWebhook(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 1000)
  };
}

async function callJsonApi(url, headers, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 1000)
  };
}

async function callFormApi(url, headers, formData) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: new URLSearchParams(formData)
  });

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body: body.slice(0, 1000)
  };
}

async function recordDelivery(alertId, channel, status, responseCode, providerMessage, metadata) {
  await query(
    `
    INSERT INTO alert_deliveries (alert_id, channel, status, response_code, provider_message, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      alertId,
      channel,
      status,
      responseCode || null,
      providerMessage || null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );
}

async function loadAlertDetails(alertId) {
  const result = await query(
    `
    SELECT
      a.id AS alert_id,
      a.student_user_id,
      a.alert_type,
      a.created_at,
      u.full_name AS student_name,
      u.email,
      u.phone,
      l.id AS listing_id,
      l.title,
      l.monthly_rent,
      l.room_type,
      l.furnishing_type,
      loc.city,
      loc.locality_name
    FROM student_alerts a
    JOIN users u ON u.id = a.student_user_id
    JOIN listings l ON l.id = a.listing_id
    JOIN localities loc ON loc.id = l.locality_id
    WHERE a.id = $1
    LIMIT 1
    `,
    [alertId]
  );

  return result.rows[0] || null;
}

function buildMessage(alert) {
  return `New room listing: ${alert.title} in ${alert.locality_name}, ${alert.city}. Rent INR ${alert.monthly_rent}.`;
}

function normalizePhone(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^\d+]/g, '').trim();
  if (!digits) {
    return null;
  }

  if (digits.startsWith('+')) {
    return digits;
  }

  if (digits.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return `+${digits}`;
}

function getWhatsAppProvider() {
  return (env.whatsappProvider || '').trim().toLowerCase();
}

async function sendEmail(alert) {
  if (!alert.email) {
    return { status: 'skipped', message: 'Student email not available.' };
  }

  if (!env.emailAlertWebhookUrl) {
    return { status: 'skipped', message: 'EMAIL_ALERT_WEBHOOK_URL is not configured.' };
  }

  const payload = {
    to: alert.email,
    subject: `New listing match: ${alert.title}`,
    html: `<p>Hello ${alert.student_name || 'Student'},</p><p>${buildMessage(alert)}</p>`
  };

  const res = await callWebhook(env.emailAlertWebhookUrl, payload);
  if (res.ok) {
    return { status: 'sent', responseCode: res.status, message: res.body };
  }

  return { status: 'failed', responseCode: res.status, message: res.body };
}

async function sendWhatsApp(alert) {
  if (!alert.phone) {
    return { status: 'skipped', message: 'Student phone not available.' };
  }

  const phone = normalizePhone(alert.phone);
  if (!phone) {
    return { status: 'skipped', message: 'Student phone is invalid.' };
  }

  const provider = getWhatsAppProvider();

  if (!provider || provider === 'webhook') {
    if (!env.whatsappAlertWebhookUrl) {
      return { status: 'skipped', message: 'WHATSAPP_ALERT_WEBHOOK_URL is not configured.' };
    }

    const payload = {
      to: phone,
      message: buildMessage(alert)
    };

    const res = await callWebhook(env.whatsappAlertWebhookUrl, payload);
    if (res.ok) {
      return { status: 'sent', responseCode: res.status, message: res.body };
    }

    return { status: 'failed', responseCode: res.status, message: res.body };
  }

  if (provider === 'twilio') {
    if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioWhatsappFrom) {
      return { status: 'skipped', message: 'Twilio WhatsApp config is incomplete.' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`;
    const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString('base64');
    const from = env.twilioWhatsappFrom.startsWith('whatsapp:') ? env.twilioWhatsappFrom : `whatsapp:${env.twilioWhatsappFrom}`;

    const res = await callFormApi(
      url,
      {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      {
        To: `whatsapp:${phone}`,
        From: from,
        Body: buildMessage(alert)
      }
    );

    if (res.ok) {
      return { status: 'sent', responseCode: res.status, message: res.body };
    }

    return { status: 'failed', responseCode: res.status, message: res.body };
  }

  if (provider === 'meta') {
    if (!env.metaWhatsappAccessToken || !env.metaWhatsappPhoneNumberId) {
      return { status: 'skipped', message: 'Meta WhatsApp config is incomplete.' };
    }

    const apiVersion = env.metaWhatsappApiVersion || 'v20.0';
    const url = `https://graph.facebook.com/${apiVersion}/${env.metaWhatsappPhoneNumberId}/messages`;
    const res = await callJsonApi(
      url,
      {
        Authorization: `Bearer ${env.metaWhatsappAccessToken}`,
        'Content-Type': 'application/json'
      },
      {
        messaging_product: 'whatsapp',
        to: phone.replace('+', ''),
        type: 'text',
        text: {
          body: buildMessage(alert)
        }
      }
    );

    if (res.ok) {
      return { status: 'sent', responseCode: res.status, message: res.body };
    }

    return { status: 'failed', responseCode: res.status, message: res.body };
  }

  return { status: 'skipped', message: `Unsupported WHATSAPP_PROVIDER: ${provider}` };
}

async function sendInApp(alert) {
  const deliveredCount = publishToStudent(alert.student_user_id, 'student_alert', {
    id: alert.alert_id,
    type: alert.alert_type,
    createdAt: alert.created_at,
    listing: {
      id: alert.listing_id,
      title: alert.title,
      monthlyRent: alert.monthly_rent,
      roomType: alert.room_type,
      furnishingType: alert.furnishing_type,
      city: alert.city,
      localityName: alert.locality_name
    }
  });

  if (deliveredCount > 0) {
    return { status: 'sent', message: `Delivered to ${deliveredCount} SSE client(s).` };
  }

  return { status: 'skipped', message: 'No active SSE connection for student.' };
}

async function dispatchAlert(alertId) {
  const alert = await loadAlertDetails(alertId);
  if (!alert) {
    return;
  }

  const results = [];

  try {
    const email = await sendEmail(alert);
    results.push({ channel: 'email', ...email });
  } catch (error) {
    results.push({ channel: 'email', status: 'failed', message: error.message || 'Email delivery error.' });
  }

  try {
    const whatsapp = await sendWhatsApp(alert);
    results.push({ channel: 'whatsapp', ...whatsapp });
  } catch (error) {
    results.push({ channel: 'whatsapp', status: 'failed', message: error.message || 'WhatsApp delivery error.' });
  }

  try {
    const inApp = await sendInApp(alert);
    results.push({ channel: 'in_app', ...inApp });
  } catch (error) {
    results.push({ channel: 'in_app', status: 'failed', message: error.message || 'In-app delivery error.' });
  }

  for (const item of results) {
    await recordDelivery(
      alert.alert_id,
      item.channel,
      item.status,
      item.responseCode,
      item.message,
      { listingId: alert.listing_id, provider: item.channel === 'whatsapp' ? getWhatsAppProvider() || 'webhook' : null }
    );
  }

  if (results.some((item) => item.status === 'sent')) {
    await query('UPDATE student_alerts SET delivered_at = NOW() WHERE id = $1', [alert.alert_id]);
  }
}

async function dispatchAlertBatch(alertIds = []) {
  for (const alertId of alertIds) {
    await dispatchAlert(alertId);
  }
}

module.exports = {
  dispatchAlert,
  dispatchAlertBatch
};
