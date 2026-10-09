import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getMessagingConfig, previewMessages, sendMessages, listMessageLog } from '../controllers/messageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/config', getMessagingConfig);
router.get('/log', listMessageLog);
router.post('/preview', previewMessages);
// Sending legal notices to borrowers is limited to admins.
router.post('/send', requireRole('super_admin', 'admin'), sendMessages);

export default router;
