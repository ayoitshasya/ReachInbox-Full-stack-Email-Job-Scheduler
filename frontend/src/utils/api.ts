// Central API client for the frontend: one shared Axios instance with
// automatic JWT attachment and 401 handling, plus grouped helper functions
// per backend route group (auth, emails). All components should call
// through authApi/emailsApi rather than using axios directly.
// Closely related to: utils/auth.ts (token storage), backend/src/routes/auth.ts,
// backend/src/routes/emails.ts (the endpoints these functions call).
import axios from 'axios';
import { getToken, clearToken } from './auth';
import type { User, EmailJob, EmailSender, PaginatedResponse, ScheduleEmailPayload } from '../types';

// Backend origin — configurable via env for deployed builds (see
// frontend/.env.example), falling back to the local dev server.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({ baseURL: BASE_URL });

// Attaches the stored JWT (if any) to every outgoing request, so individual
// API calls never need to handle auth headers themselves.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Globally handles expired/invalid tokens: any 401 response clears the
// stored token and forces a redirect to login, so the app doesn't get stuck
// in a broken authenticated-looking state.
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

// Auth-related API calls, mirroring backend/src/routes/auth.ts.
export const authApi = {
  getMe: () => api.get<User>('/api/auth/me').then((r) => r.data),
  logout: () => api.post('/api/auth/logout'),
  // Not an API call itself — just builds the URL the "Sign in with Google"
  // link points to, which starts the OAuth redirect flow.
  googleLoginUrl: () => `${BASE_URL}/api/auth/google`,
};

// Email-scheduling API calls, mirroring backend/src/routes/emails.ts.
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
