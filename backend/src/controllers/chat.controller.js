const {
  createOrGetConversation,
  listMyConversations,
  getConversationById,
  listConversationMessages,
  sendMessage,
  markConversationRead
} = require('../services/chat.service');

async function createConversation(req, res, next) {
  try {
    const result = await createOrGetConversation(req.auth.userId, req.body);
    return res.status(result.created ? 201 : 200).json({
      message: result.created ? 'Conversation created successfully.' : 'Conversation already exists.',
      conversation: result.conversation
    });
  } catch (error) {
    return next(error);
  }
}

async function listConversations(req, res, next) {
  try {
    const result = await listMyConversations(req.auth.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getConversation(req, res, next) {
  try {
    const conversation = await getConversationById(req.params.id, req.auth.userId);
    return res.status(200).json({ conversation });
  } catch (error) {
    return next(error);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const result = await listConversationMessages(req.params.id, req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function createMessage(req, res, next) {
  try {
    const message = await sendMessage(req.params.id, req.auth.userId, req.body);
    return res.status(201).json({ message: 'Message sent successfully.', item: message });
  } catch (error) {
    return next(error);
  }
}

async function readConversation(req, res, next) {
  try {
    const updatedCount = await markConversationRead(req.params.id, req.auth.userId);
    return res.status(200).json({ message: 'Conversation marked as read.', updatedCount });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createConversation,
  listConversations,
  getConversation,
  getConversationMessages,
  createMessage,
  readConversation
};
