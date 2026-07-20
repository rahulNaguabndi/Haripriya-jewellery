import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { getRates, setRate } from '../controllers/rateController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', getRates);
router.post('/', setRate);

export default router;
