import axios from 'axios';

// Автоопределение порта backend
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

// Helpers
export const formatSum = (n) => `${Number(n || 0).toLocaleString('ru-RU')} сум`;
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '—';
export const daysDiff = (d) => {
  const diff = Math.floor((new Date() - new Date(d)) / 86400000);
  return diff;
};
