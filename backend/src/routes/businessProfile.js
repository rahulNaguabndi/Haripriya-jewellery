import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getBusinessProfile, updateBusinessProfile } from '../controllers/businessProfileController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', getBusinessProfile);
router.put('/', requireRole('super_admin', 'admin'), updateBusinessProfile);

export default router;
