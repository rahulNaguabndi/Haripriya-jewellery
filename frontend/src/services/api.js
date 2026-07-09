import axios from 'axios';
import { supabase } from './supabaseClient.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4100/api',
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);
