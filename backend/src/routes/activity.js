import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { listActivity, listActivityActors } from '../controllers/activityController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listActivity);
router.get('/actors', requireRole('super_admin', 'admin'), listActivityActors);

export default router;
