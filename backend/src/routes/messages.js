import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getMessagingConfig, previewMessages, sendMessages, sendConfirmation, listMessageLog } from '../controllers/messageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/config', getMessagingConfig);
router.get('/log', listMessageLog);
router.post('/preview', previewMessages);
// Sending legal notices to borrowers is limited to admins.
router.post('/send', requireRole('super_admin', 'admin'), sendMessages);
// Payment/closure confirmations to one borrower - any staff member.
router.post('/confirmation', sendConfirmation);

export default router;
