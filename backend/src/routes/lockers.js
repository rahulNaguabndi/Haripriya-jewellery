import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { listLockers, createLocker, updateLocker, deleteLocker } from '../controllers/lockerController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listLockers);
router.post('/', requireRole('super_admin', 'admin'), createLocker);
router.put('/:id', requireRole('super_admin', 'admin'), updateLocker);
router.delete('/:id', requireRole('super_admin', 'admin'), deleteLocker);

export default router;
