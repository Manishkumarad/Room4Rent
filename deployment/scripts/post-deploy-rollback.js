async function triggerRollback() {
  const rollbackUrl = process.env.ROLLBACK_WEBHOOK_URL;
  if (!rollbackUrl) {
    throw new Error('ROLLBACK_WEBHOOK_URL is required');
  }

  const response = await fetch(rollbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: 'roomrental-deploy-automation',
      reason: process.env.ROLLBACK_REASON || 'Health gate failed',
      environment: process.env.DEPLOY_ENVIRONMENT || 'production',
      imageTag: process.env.DEPLOY_IMAGE_TAG || 'unknown'
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Rollback webhook failed: ${response.status} ${text}`);
  }

  return { ok: true, status: response.status, body: text };
}

async function main() {
  const result = await triggerRollback();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { triggerRollback };
