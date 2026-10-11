import { supabase } from '../config/supabaseClient.js';

// Appends one row to activity_log. Never throws: an audit-write failure
// (e.g. the table not created yet) must not undo or block the action it
// describes, so it's only reported on the server console.
//
// logActivity(req, {
//   action: 'payment.create', entityType: 'payment', entityId,
//   loanId, borrowerId, summary: 'Recorded payment of Rs 5,000', details: {...}
// })
export async function logActivity(req, { action, entityType, entityId = null, loanId = null, borrowerId = null, summary, details = null }) {
  try {
    const { error } = await supabase.from('activity_log').insert({
      actor_id: req.user?.id || null,
      actor_email: req.user?.email || null,
      actor_name: req.adminUser?.full_name || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      loan_id: loanId,
      borrower_id: borrowerId,
      summary,
      details,
    });
    if (error) console.warn('[activity] could not write activity_log:', error.message);
  } catch (err) {
    console.warn('[activity] could not write activity_log:', err.message);
  }
}

export const inr = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Field-by-field before/after for an update, limited to `fields` and only
// those that actually changed. Values are compared as strings so 5000 and
// "5000" (numeric columns come back as numbers, bodies may hold strings)
// don't register as a change.
export function diffFields(before, after, fields) {
  const changes = {};
  for (const field of fields) {
    if (after[field] === undefined) continue;
    const a = before?.[field] ?? null;
    const b = after[field] ?? null;
    if (String(a) !== String(b)) changes[field] = { from: a, to: b };
  }
  return changes;
}
