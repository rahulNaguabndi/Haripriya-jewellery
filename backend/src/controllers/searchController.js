import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { pinnedBranchId } from '../utils/branches.js';

const LIMIT = 8;
const HUID = /^[A-Z0-9]{6}$/;

// PostgREST `or()` filters are comma/paren-delimited, so strip those (and
// LIKE wildcards) from user input before splicing it in.
const clean = (q) => q.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();

function summariseLoan(loan) {
  const items = loan.loan_items || [];
  return {
    id: loan.id,
    loanNumber: loan.loan_number,
    packetNumber: loan.packet_number,
    status: loan.status,
    loanDate: loan.loan_date,
    loanAmount: loan.loan_amount,
    closureDate: loan.closure_date,
    borrowerId: loan.borrower_id,
    borrowerName: loan.borrowers?.name || null,
    borrowerPhone: loan.borrowers?.phone || null,
    branchName: loan.branches?.name || null,
    items: items.map((i) => ({
      itemType: i.item_type,
      metalType: i.metal_type,
      purity: i.purity,
      netWeight: i.net_weight ?? i.gross_weight,
      description: i.description,
      huid: i.huid,
    })),
  };
}

const LOAN_SELECT = 'id, loan_number, packet_number, status, loan_date, loan_amount, closure_date, borrower_id, branch_id, branches(name, code), borrowers(name, phone), loan_items(item_type, metal_type, purity, gross_weight, net_weight, description, huid)';

// GET /api/search?q=
// One box for everything staff look things up by: borrower name / phone /
// village, loan number, packet number, HUID, item description. Returns
// borrowers plus matching loans (open and closed - a closed loan is where
// "Re-pledge" starts for a returning customer).
export async function globalSearch(req, res, next) {
  try {
    const raw = String(req.query.q || '').trim();
    if (raw.length < 2) throw new ApiError(400, 'Type at least 2 characters to search');
    const q = clean(raw);
    if (!q) return res.json({ query: raw, borrowers: [], loans: [] });

    const upper = q.replace(/\s+/g, '').toUpperCase();
    const digits = q.replace(/\D/g, '');
    const isNumeric = /^\d+$/.test(q.replace(/\s+/g, ''));

    const borrowersQuery = supabase
      .from('borrowers')
      .select('id, name, phone, village, city, district, care_of')
      .eq('is_deleted', false)
      .or(['name', 'phone', 'village', 'city', 'care_of'].map((f) => `${f}.ilike.%${q}%`).join(','))
      .order('name')
      .limit(LIMIT);

    const loanFilters = [`loan_number.ilike.%${q}%`];
    if (isNumeric && digits.length <= 12) loanFilters.push(`packet_number.eq.${digits}`);
    const loansByNumberQuery = supabase
      .from('loans')
      .select(LOAN_SELECT)
      .or(loanFilters.join(','))
      .order('loan_date', { ascending: false })
      .limit(LIMIT);

    // Items: HUID exact match, or description text.
    const itemFilters = [`description.ilike.%${q}%`];
    if (HUID.test(upper)) itemFilters.push(`huid.eq.${upper}`);
    const itemsQuery = supabase.from('loan_items').select('loan_id').or(itemFilters.join(',')).limit(40);

    const [borrowersRes, loansRes, itemsRes] = await Promise.all([borrowersQuery, loansByNumberQuery, itemsQuery]);
    for (const r of [borrowersRes, loansRes, itemsRes]) if (r.error) throw new ApiError(400, r.error.message);

    const borrowers = borrowersRes.data || [];
    const loanIds = new Set((loansRes.data || []).map((l) => l.id));
    const extraLoanIds = [...new Set((itemsRes.data || []).map((i) => i.loan_id))].filter((id) => !loanIds.has(id));

    // Loans of the matched borrowers too - searching a name should show that
    // person's pledges (including closed ones to re-pledge) in one place.
    const borrowerIds = borrowers.map((b) => b.id);
    const [extraLoansRes, borrowerLoansRes] = await Promise.all([
      extraLoanIds.length
        ? supabase.from('loans').select(LOAN_SELECT).in('id', extraLoanIds.slice(0, LIMIT * 2))
        : Promise.resolve({ data: [] }),
      borrowerIds.length
        ? supabase.from('loans').select(LOAN_SELECT).in('borrower_id', borrowerIds).order('loan_date', { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
    ]);
    if (extraLoansRes.error) throw new ApiError(400, extraLoansRes.error.message);
    if (borrowerLoansRes.error) throw new ApiError(400, borrowerLoansRes.error.message);

    // Customers are shared across branches, but staff tied to one branch
    // only get that branch's loans back.
    const pinned = pinnedBranchId(req.adminUser);
    const seen = new Set();
    const loans = [];
    for (const loan of [...(loansRes.data || []), ...(extraLoansRes.data || []), ...(borrowerLoansRes.data || [])]) {
      if (seen.has(loan.id) || (pinned && loan.branch_id !== pinned)) continue;
      seen.add(loan.id);
      loans.push(summariseLoan(loan));
    }

    res.json({ query: raw, borrowers, loans: loans.slice(0, 30) });
  } catch (err) {
    next(err);
  }
}
