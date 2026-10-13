import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import {
  getCapacity,
  getHistory,
  getReshufflePlan,
  previewReshuffle,
  applyReshuffle,
  getReshuffleLog,
  updateStorageSettings,
} from '../controllers/storageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/capacity', getCapacity);
router.get('/history', getHistory);
router.get('/reshuffle/plan', getReshufflePlan);
router.get('/reshuffle/preview', previewReshuffle);
router.get('/reshuffle/log', getReshuffleLog);
// Same roles that may edit box ranges in Storage → Manage.
router.post('/reshuffle', requireRole('super_admin', 'admin'), applyReshuffle);
router.put('/settings', requireRole('super_admin', 'admin'), updateStorageSettings);

export default router;
