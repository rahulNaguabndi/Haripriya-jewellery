import { supabase } from '../config/supabaseClient.js';

// Verifies the Supabase JWT sent by the frontend and attaches the
// authenticated user (plus their admin_users row, if any) to the request.
export async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw error || new Error('User not found');

    req.user = data.user;

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('*')
      .eq('supabase_user_id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();

    req.adminUser = adminUser || null;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Restricts a route to specific admin_users roles (e.g. 'super_admin').
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.adminUser || !roles.includes(req.adminUser.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
