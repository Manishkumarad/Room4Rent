const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  createConversation,
  listConversations,
  getConversation,
  getConversationMessages,
  createMessage,
  readConversation
} = require('../controllers/chat.controller');

const router = express.Router();

router.use(requireAuth, requireRole('student', 'landlord'));

router.post('/conversations', createConversation);
router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.get('/conversations/:id/messages', getConversationMessages);
router.post('/conversations/:id/messages', createMessage);
router.patch('/conversations/:id/read', readConversation);

module.exports = router;
