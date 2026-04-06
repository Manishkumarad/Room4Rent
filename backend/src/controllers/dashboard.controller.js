const {
  getAdminOverview,
  getAdminTrends,
  getLandlordDashboard,
  getStudentDashboard
} = require('../services/dashboard.service');

async function adminOverview(req, res, next) {
  try {
    const result = await getAdminOverview();
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminTrends(req, res, next) {
  try {
    const result = await getAdminTrends(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function landlordMyDashboard(req, res, next) {
  try {
    const result = await getLandlordDashboard(req.auth.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function studentMyDashboard(req, res, next) {
  try {
    const result = await getStudentDashboard(req.auth.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  adminOverview,
  adminTrends,
  landlordMyDashboard,
  studentMyDashboard
};
