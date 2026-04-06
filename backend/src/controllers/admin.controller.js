const {
  listAuditLogs,
  listPaymentWebhookEvents
} = require('../services/admin-observability.service');
const {
  listQueueHealth,
  listWorkerHealth,
  listDeadLetterJobs
} = require('../services/worker-ops.service');

async function adminAuditLogs(req, res, next) {
  try {
    const result = await listAuditLogs(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminPaymentWebhookEvents(req, res, next) {
  try {
    const result = await listPaymentWebhookEvents(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminQueueHealth(req, res, next) {
  try {
    const result = await listQueueHealth();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminWorkerHealth(req, res, next) {
  try {
    const result = await listWorkerHealth();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminDeadLetterJobs(req, res, next) {
  try {
    const result = await listDeadLetterJobs(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  adminAuditLogs,
  adminPaymentWebhookEvents,
  adminQueueHealth,
  adminWorkerHealth,
  adminDeadLetterJobs
};
