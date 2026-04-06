const env = require('../config/env');
const { processImmersiveGenerationJobs } = require('./immersive.worker');
const { processPaymentReconciliationJobs } = require('./payment-reconciliation.worker');
const { upsertWorkerHeartbeat, listQueueHealth, evaluateQueueAlerts } = require('../services/worker-ops.service');

let isRunning = false;

async function runTick() {
  if (isRunning) {
    return;
  }

  isRunning = true;
  const tickStart = new Date();
  await upsertWorkerHeartbeat('main-worker', {
    lastTickStartedAt: tickStart.toISOString(),
    meta: {
      pollIntervalMs: env.workerPollIntervalMs,
      immersiveBatchSize: env.immersiveJobBatchSize,
      paymentBatchSize: env.paymentReconciliationBatchSize
    }
  });

  try {
    const [immersiveResult, paymentResult] = await Promise.all([
      processImmersiveGenerationJobs(env.immersiveJobBatchSize),
      processPaymentReconciliationJobs(env.paymentReconciliationBatchSize)
    ]);

    const queueStats = await listQueueHealth();
    await evaluateQueueAlerts(queueStats);

    if (immersiveResult.processed || paymentResult.processed) {
      console.log(
        `[worker] processed immersive=${immersiveResult.processed} payments=${paymentResult.processed}`
      );
    }

    await upsertWorkerHeartbeat('main-worker', {
      lastTickFinishedAt: new Date().toISOString(),
      meta: {
        immersiveProcessed: immersiveResult.processed,
        paymentProcessed: paymentResult.processed
      }
    });
  } catch (error) {
    console.error('[worker] tick failed', error);
    await upsertWorkerHeartbeat('main-worker', {
      lastTickFinishedAt: new Date().toISOString(),
      lastError: error.message || 'Worker tick failed'
    });
  } finally {
    isRunning = false;
  }
}

async function start() {
  const once = process.argv.includes('--once');

  if (once) {
    await runTick();
    process.exit(0);
    return;
  }

  console.log(`[worker] started pollInterval=${env.workerPollIntervalMs}ms`);
  await runTick();
  setInterval(runTick, env.workerPollIntervalMs);
}

start();
