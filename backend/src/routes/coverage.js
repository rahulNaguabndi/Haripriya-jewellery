import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { listCoverage, getRateRisk } from '../controllers/coverageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listCoverage);
router.get('/rate-risk', getRateRisk);

export default router;
