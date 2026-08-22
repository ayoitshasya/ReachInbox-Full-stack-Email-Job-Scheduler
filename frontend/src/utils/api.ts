import axios from 'axios';
import { getToken, clearToken } from './auth';
import type { User, EmailJob, EmailSender, PaginatedResponse, ScheduleEmailPayload } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  getMe: () => api.get<User>('/api/auth/me').then((r) => r.data),
  logout: () => api.post('/api/auth/logout'),
  googleLoginUrl: () => `${BASE_URL}/api/auth/google`,
};

export const emailsApi = {
  getSenders: () => api.get<EmailSender[]>('/api/emails/senders').then((r) => r.data),

  scheduleEmails: (payload: ScheduleEmailPayload) =>
    api.post('/api/emails/schedule', payload).then((r) => r.data),

  getScheduled: (page = 1, limit = 20) =>
    api
      .get<PaginatedResponse<EmailJob>>('/api/emails/scheduled', { params: { page, limit } })
      .then((r) => r.data),

  getSent: (page = 1, limit = 20) =>
    api
      .get<PaginatedResponse<EmailJob>>('/api/emails/sent', { params: { page, limit } })
      .then((r) => r.data),
};
