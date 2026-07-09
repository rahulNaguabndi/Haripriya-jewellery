import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import {
  getInterestConfig,
  updateInterestConfig,
  getAllConfigs,
  listAdminUsers,
  createAdminUser,
  deactivateAdminUser,
  updateMyTheme,
} from '../controllers/adminController.js';

const router = Router();
router.use(verifyAuth);

router.get('/config/interest', getInterestConfig);
router.put('/config/interest', requireRole('super_admin', 'admin'), updateInterestConfig);
router.get('/config/all', getAllConfigs);

router.patch('/me/theme', updateMyTheme);

router.get('/users', listAdminUsers);
router.post('/users', requireRole('super_admin'), createAdminUser);
router.delete('/users/:id', requireRole('super_admin'), deactivateAdminUser);

export default router;
