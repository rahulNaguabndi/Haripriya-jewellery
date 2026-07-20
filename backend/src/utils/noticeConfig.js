import { supabase } from '../config/supabaseClient.js';

// Fetches the currently active overdue-notice configuration
// (threshold_months schedule + flat cost_amount).
export async function getActiveNoticeConfig() {
  const { data, error } = await supabase
    .from('notice_config')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
