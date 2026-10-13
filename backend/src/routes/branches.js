import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getBranches, createBranch, updateBranch } from '../controllers/branchController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', getBranches);
router.post('/', requireRole('super_admin'), createBranch);
router.put('/:id', requireRole('super_admin'), updateBranch);

export default router;
