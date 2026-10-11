import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';

const ADMIN_ROLES = ['super_admin', 'admin'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/activity?loanId=&borrowerId=&actorId=&entityType=a,b&from=&to=&q=&page=&limit=
// One loan's or borrower's history is visible to all staff (shown on the
// detail pages); the full shop-wide log is admin-only.
export async function listActivity(req, res, next) {
  try {
    const scoped = !!(req.query.loanId || req.query.borrowerId);
    if (!scoped && !ADMIN_ROLES.includes(req.adminUser?.role)) {
      throw new ApiError(403, 'Only admins can view the full activity log');
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const from = (page - 1) * limit;

    let query = supabase
      .from('activity_log')
      .select('*, loans(loan_number), borrowers(name)', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (req.query.loanId) query = query.eq('loan_id', req.query.loanId);
    if (req.query.borrowerId) query = query.eq('borrower_id', req.query.borrowerId);
    if (req.query.actorId) query = query.eq('actor_id', req.query.actorId);
    // entityType may be a comma-separated list (e.g. all the settings types).
    if (req.query.entityType) query = query.in('entity_type', String(req.query.entityType).split(',').map((s) => s.trim()).filter(Boolean));
    if (req.query.from) {
      if (!ISO_DATE.test(req.query.from)) throw new ApiError(400, 'from must be YYYY-MM-DD');
      query = query.gte('created_at', `${req.query.from}T00:00:00+05:30`);
    }
    if (req.query.to) {
      if (!ISO_DATE.test(req.query.to)) throw new ApiError(400, 'to must be YYYY-MM-DD');
      query = query.lte('created_at', `${req.query.to}T23:59:59.999+05:30`);
    }
    if (req.query.q) query = query.ilike('summary', `%${String(req.query.q).replace(/[%,()]/g, ' ')}%`);

    const { data, error, count } = await query.range(from, from + limit - 1);
    if (error) throw new ApiError(400, error.message);
    res.json({ data, page, limit, total: count });
  } catch (err) {
    next(err);
  }
}

// GET /api/activity/actors - distinct staff for the filter dropdown.
export async function listActivityActors(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('admin_users')
      .select('supabase_user_id, email, full_name, role')
      .order('email');
    if (error) throw new ApiError(400, error.message);
    res.json({ data: data.map((u) => ({ id: u.supabase_user_id, email: u.email, name: u.full_name, role: u.role })) });
  } catch (err) {
    next(err);
  }
}
