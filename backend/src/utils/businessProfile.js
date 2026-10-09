import { supabase } from '../config/supabaseClient.js';

// Falls back to a minimal profile so the pledge form / notices still render
// before the business_profile table has been created or filled in.
const FALLBACK = { legal_name: 'Haripriya Jewels', trade_name: 'Haripriya Jewels' };

export async function getActiveBusinessProfile() {
  const { data, error } = await supabase.from('business_profile').select('*').eq('is_active', true).maybeSingle();
  if (error) {
    // Most likely the 2026-10-09 migration hasn't been applied yet.
    console.warn('[businessProfile] falling back to defaults:', error.message);
    return FALLBACK;
  }
  return data || FALLBACK;
}
