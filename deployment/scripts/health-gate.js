const { setTimeout: delay } = require('node:timers/promises');

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Health check failed for ${url}: ${response.status} ${text}`);
    error.statusCode = response.status;
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function healthGate(options) {
  const {
    baseUrl,
    paths = ['/api/health', '/api/memberships/plans', '/api/dashboard/admin/overview'],
    retries = 12,
    intervalMs = 5000,
    timeoutMs = 15000,
    authToken = null
  } = options;

  if (!baseUrl) {
    throw new Error('baseUrl is required');
  }

  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const results = [];

  for (const path of paths) {
    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}${path}`, { headers, signal: controller.signal });
        const bodyText = await response.text();
        if (response.ok) {
          results.push({ path, ok: true, status: response.status, bodyText });
          clearTimeout(timeout);
          lastError = null;
          break;
        }
        lastError = new Error(`Attempt ${attempt}/${retries} failed for ${path}: ${response.status} ${bodyText}`);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < retries) {
        await delay(intervalMs);
      }
    }

    if (lastError) {
      const error = new Error(`Health gate failed for ${path}: ${lastError.message}`);
      error.path = path;
      throw error;
    }
  }

  return { ok: true, results };
}

async function main() {
  const baseUrl = process.env.HEALTH_GATE_BASE_URL;
  const authToken = process.env.HEALTH_GATE_AUTH_TOKEN || null;
  const paths = (process.env.HEALTH_GATE_PATHS || '/api/health,/api/memberships/plans,/api/dashboard/admin/overview')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const result = await healthGate({
    baseUrl,
    authToken,
    paths,
    retries: Number(process.env.HEALTH_GATE_RETRIES || 12),
    intervalMs: Number(process.env.HEALTH_GATE_INTERVAL_MS || 5000),
    timeoutMs: Number(process.env.HEALTH_GATE_TIMEOUT_MS || 15000)
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { healthGate };
