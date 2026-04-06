import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4100/api';

export const sendMessage = async (messageData) => {
  const response = await axios.post(`${API_BASE_URL}/messages`, messageData);
  return response.data;
};

export const getMessages = async (conversationId) => {
  const response = await axios.get(`${API_BASE_URL}/messages`, {
    params: { conversationId },
  });
  return response.data;
};

export const markMessageAsRead = async (messageId) => {
  const response = await axios.patch(`${API_BASE_URL}/messages/${messageId}`, {
    is_read: true,
  });
  return response.data;
};