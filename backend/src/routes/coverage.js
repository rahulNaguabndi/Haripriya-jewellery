import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { listCoverage } from '../controllers/coverageController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listCoverage);

export default router;
