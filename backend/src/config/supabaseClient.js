import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabaseClient] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. ' +
      'Set them in backend/.env before making any API calls.'
  );
}

// Service-role client: used server-side only, bypasses RLS. Never expose
// this key to the frontend.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node.js 20 has no built-in WebSocket; supabase-js's realtime client
    // needs one injected explicitly (unused here, but required at init).
    realtime: { transport: ws },
  }
);
