import { supabase } from '../config/supabaseClient.js';
import { getApplicableTier } from './interestCalculator.js';

// Fetches the currently active interest tier configuration.
export async function getActiveInterestConfig() {
  const { data, error } = await supabase
    .from('interest_config')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Convenience: resolves the interest rate that should apply to a given
// principal right now, based on the active tier configuration. Falls back
// to fallbackRate if no config/tier is found.
export async function resolveInterestRate(principal, fallbackRate) {
  const config = await getActiveInterestConfig();
  const tier = config ? getApplicableTier(principal, config.tiers) : null;
  return tier?.interestRate ?? fallbackRate;
}
