import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { verifyAuth } from '../middleware/auth.js';
import { supabase } from '../config/supabaseClient.js';

const router = Router();

// Used only for the optional server-side login/logout below. Normally the
// frontend talks to Supabase directly with the anon key and just sends the
// resulting access token as a Bearer header on every API call.
const anonClient = process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      realtime: { transport: ws },
    })
  : null;

router.post('/login', async (req, res, next) => {
  if (!anonClient) {
    return res.status(501).json({ error: 'Server-side login not configured; sign in from the frontend instead.' });
  }
  try {
    const { email, password } = req.body;
    const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    res.json({ session: data.session, user: data.user });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', verifyAuth, async (req, res, next) => {
  try {
    await supabase.auth.admin.signOut(req.headers.authorization.split('Bearer ')[1]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/me', verifyAuth, async (req, res) => {
  res.json({ user: req.user, adminProfile: req.adminUser });
});

export default router;
