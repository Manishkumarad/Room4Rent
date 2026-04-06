import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4100/api';

export const createRoom = async (roomData) => {
  const response = await axios.post(`${API_BASE_URL}/rooms`, roomData);
  return response.data;
};

export const getRooms = async (filters) => {
  const response = await axios.get(`${API_BASE_URL}/rooms`, {
    params: filters,
  });
  return response.data;
};

export const getRoomById = async (roomId) => {
  const response = await axios.get(`${API_BASE_URL}/rooms/${roomId}`);
  return response.data;
};

export const updateRoom = async (roomId, roomData) => {
  const response = await axios.put(`${API_BASE_URL}/rooms/${roomId}`, roomData);
  return response.data;
};

export const deleteRoom = async (roomId) => {
  const response = await axios.delete(`${API_BASE_URL}/rooms/${roomId}`);
  return response.data;
};