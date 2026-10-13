import axios from 'axios';
import { supabase } from './supabaseClient.js';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4100/api',
});

// Branch the user is working in ('all' or a branch id), sent on every call
// as X-Branch-Id. Seeded from the last choice so the very first requests are
// already scoped; BranchContext keeps it in sync. The server pins staff to
// their own branch regardless of what is sent.
const BRANCH_KEY = 'branchId';
let currentBranch = (() => {
  try {
    return localStorage.getItem(BRANCH_KEY) || 'all';
  } catch {
    return 'all';
  }
})();

export function getApiBranch() {
  return currentBranch;
}

export function setApiBranch(id) {
  currentBranch = id || 'all';
  try {
    localStorage.setItem(BRANCH_KEY, currentBranch);
  } catch {
    // Private mode / blocked storage: the choice just won't survive a reload.
  }
}

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (currentBranch && currentBranch !== 'all') config.headers['X-Branch-Id'] = currentBranch;
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
