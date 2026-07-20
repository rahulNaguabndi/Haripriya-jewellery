import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { listBoxes, createBox, updateBox, deleteBox, lookupPacket } from '../controllers/boxController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listBoxes);
router.get('/lookup', lookupPacket);
router.post('/', requireRole('super_admin', 'admin'), createBox);
router.put('/:id', requireRole('super_admin', 'admin'), updateBox);
router.delete('/:id', requireRole('super_admin', 'admin'), deleteBox);

export default router;
