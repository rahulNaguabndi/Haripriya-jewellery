import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';

// The signed-in staff member's admin_users role ('super_admin' | 'admin' |
// 'staff' | null). Fetched once per session and shared, since the nav and
// several pages ask for it.
let cache = { userId: null, promise: null };

export function useMyRole() {
  const { user } = useAuth();
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    if (cache.userId !== user.id) {
      cache = { userId: user.id, promise: api.get('/auth/me').then((res) => res.data.adminProfile?.role || null).catch(() => null) };
    }
    let alive = true;
    cache.promise.then((r) => alive && setRole(r));
    return () => {
      alive = false;
    };
  }, [user]);

  return role;
}

export const isAdminRole = (role) => role === 'admin' || role === 'super_admin';
