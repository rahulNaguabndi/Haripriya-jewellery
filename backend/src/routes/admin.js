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
  updateBrandTheme,
} from '../controllers/adminController.js';
import { getNoticeConfig, updateNoticeConfig } from '../controllers/noticeController.js';
import { getCoverageConfig, updateCoverageConfig } from '../controllers/coverageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/config/interest', getInterestConfig);
router.put('/config/interest', requireRole('super_admin', 'admin'), updateInterestConfig);
router.get('/config/all', getAllConfigs);

router.get('/config/notices', getNoticeConfig);
router.put('/config/notices', requireRole('super_admin', 'admin'), updateNoticeConfig);

router.get('/config/coverage', getCoverageConfig);
router.put('/config/coverage', requireRole('super_admin', 'admin'), updateCoverageConfig);

router.patch('/me/theme', updateMyTheme);
router.put('/branding', requireRole('super_admin', 'admin'), updateBrandTheme);

router.get('/users', listAdminUsers);
router.post('/users', requireRole('super_admin'), createAdminUser);
router.delete('/users/:id', requireRole('super_admin'), deactivateAdminUser);

export default router;
