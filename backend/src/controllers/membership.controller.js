const {
  listMembershipPlans,
  getMyMembership,
  createMembershipCheckout,
  confirmMembershipCheckout,
  handlePaymentWebhook
} = require('../services/membership.service');

async function plans(req, res, next) {
  try {
    const result = await listMembershipPlans();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function myMembership(req, res, next) {
  try {
    const result = await getMyMembership(req.auth.userId);
    return res.status(200).json({ membership: result });
  } catch (error) {
    return next(error);
  }
}

async function createCheckout(req, res, next) {
  try {
    const result = await createMembershipCheckout(req.auth.userId, req.body);
    return res.status(201).json({ message: 'Checkout created successfully.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function confirmCheckout(req, res, next) {
  try {
    const result = await confirmMembershipCheckout(req.auth.userId, req.body);
    return res.status(200).json({ message: 'Checkout confirmed successfully.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function paymentWebhook(req, res, next) {
  try {
    const result = await handlePaymentWebhook(req.params.provider, req.body, req.headers);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  plans,
  myMembership,
  createCheckout,
  confirmCheckout,
  paymentWebhook
};
