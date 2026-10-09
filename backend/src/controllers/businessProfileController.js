import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { getActiveBusinessProfile } from '../utils/businessProfile.js';

const FIELDS = {
  legalName: 'legal_name',
  tradeName: 'trade_name',
  address: 'address',
  phone: 'phone',
  email: 'email',
  licenceNumber: 'licence_number',
  gstin: 'gstin',
  jurisdiction: 'jurisdiction',
};

export async function getBusinessProfile(req, res, next) {
  try {
    res.json(await getActiveBusinessProfile());
  } catch (err) {
    next(err);
  }
}

// PUT /api/business-profile - legal identity printed on the pledge form and
// quoted in WhatsApp/SMS notices.
export async function updateBusinessProfile(req, res, next) {
  try {
    requireFields(req.body, ['legalName']);
    const row = { updated_at: new Date().toISOString(), updated_by: req.user.id };
    for (const [key, column] of Object.entries(FIELDS)) {
      if (req.body[key] !== undefined) row[column] = req.body[key] === '' ? null : req.body[key];
    }

    const { data: current, error: currentError } = await supabase
      .from('business_profile')
      .select('id')
      .eq('is_active', true)
      .maybeSingle();
    if (currentError) throw new ApiError(400, currentError.message);

    const query = current
      ? supabase.from('business_profile').update(row).eq('id', current.id)
      : supabase.from('business_profile').insert({ ...row, is_active: true });
    const { data, error } = await query.select().single();
    if (error) throw new ApiError(400, error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
