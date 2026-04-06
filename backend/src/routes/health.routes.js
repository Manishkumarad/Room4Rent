const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    await query('SELECT 1');
    return res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
