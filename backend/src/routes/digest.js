import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { requireCronKey } from '../middleware/cronKey.js';
import { runDailyDigest, previewDigest, sendDigestNow } from '../controllers/digestController.js';

const router = Router();

// Scheduled (GitHub Actions) - shared secret, no user session.
router.post('/run', requireCronKey, runDailyDigest);

router.get('/preview', verifyAuth, requireRole('super_admin', 'admin'), previewDigest);
router.post('/send', verifyAuth, requireRole('super_admin', 'admin'), sendDigestNow);

export default router;
