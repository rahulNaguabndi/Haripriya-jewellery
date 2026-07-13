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

let refreshPromise = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;

    if (err.response?.status === 401 && config && !config._retry) {
      config._retry = true;

      if (!refreshPromise) {
        refreshPromise = supabase.auth.refreshSession().finally(() => {
          refreshPromise = null;
        });
      }

      const { data, error } = await refreshPromise;
      if (!error && data?.session) {
        config.headers.Authorization = `Bearer ${data.session.access_token}`;
        return api(config);
      }

      await supabase.auth.signOut();
    }

    const message = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);
