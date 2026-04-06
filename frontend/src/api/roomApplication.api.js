import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4100/api';

export const applyForRoom = async (applicationData) => {
  const response = await axios.post(`${API_BASE_URL}/room-applications`, applicationData);
  return response.data;
};

export const getApplicationsByRoom = async (roomId) => {
  const response = await axios.get(`${API_BASE_URL}/room-applications`, {
    params: { roomId },
  });
  return response.data;
};

export const updateApplicationStatus = async (applicationId, status) => {
  const response = await axios.patch(`${API_BASE_URL}/room-applications/${applicationId}`, {
    status,
  });
  return response.data;
};