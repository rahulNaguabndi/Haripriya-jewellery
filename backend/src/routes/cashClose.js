import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getCashClose, closeDay, reopenDay } from '../controllers/cashCloseController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', getCashClose);
router.post('/', closeDay);
router.delete('/:id', requireRole('super_admin', 'admin'), reopenDay);

export default router;
