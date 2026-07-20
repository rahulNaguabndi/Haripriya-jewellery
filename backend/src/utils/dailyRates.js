import { supabase } from '../config/supabaseClient.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

export async function getTodayRate(metalType) {
  const { data, error } = await supabase
    .from('daily_rates')
    .select('*')
    .eq('rate_date', todayIso())
    .eq('metal_type', metalType)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Most recent rate on record for a metal type, regardless of date - used
// as a fallback for coverage calculations before today's rate is entered,
// and for auto-filling a new loan's metal_rate snapshot.
export async function getLatestRate(metalType) {
  const { data, error } = await supabase
    .from('daily_rates')
    .select('*')
    .eq('metal_type', metalType)
    .order('rate_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
