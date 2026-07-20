import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { getTodayRate, getLatestRate } from '../utils/dailyRates.js';

const METAL_TYPES = ['Gold', 'Silver'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export async function getRates(req, res, next) {
  try {
    const today = {};
    const latest = {};
    for (const metalType of METAL_TYPES) {
      today[metalType] = await getTodayRate(metalType);
      latest[metalType] = await getLatestRate(metalType);
    }
    res.json({ today, latest });
  } catch (err) {
    next(err);
  }
}

// Sets today's rate for a metal type. If a rate is already locked in for
// today, only a super_admin can overwrite it (the frontend confirms with
// the user via a Yes/No dialog before calling this - the role check here
// is the real gate, not the confirmation itself).
export async function setRate(req, res, next) {
  try {
    requireFields(req.body, ['metalType', 'ratePerGram']);
    const { metalType, ratePerGram } = req.body;

    if (!METAL_TYPES.includes(metalType)) {
      throw new ApiError(400, `metalType must be one of: ${METAL_TYPES.join(', ')}`);
    }
    if (typeof ratePerGram !== 'number' || ratePerGram <= 0) {
      throw new ApiError(400, 'ratePerGram must be a positive number');
    }

    const existing = await getTodayRate(metalType);

    if (existing && (!req.adminUser || req.adminUser.role !== 'super_admin')) {
      throw new ApiError(403, "Today's rate is already locked in for this metal. Only a super admin can override it.");
    }

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('daily_rates')
        .update({ rate_per_gram: ratePerGram, set_by: req.user.id, set_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    } else {
      const { data, error } = await supabase
        .from('daily_rates')
        .insert({
          rate_date: todayIso(),
          metal_type: metalType,
          rate_per_gram: ratePerGram,
          set_by: req.user.id,
        })
        .select()
        .single();
      if (error) throw new ApiError(400, error.message);
      result = data;
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}
