import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { globalSearch } from '../controllers/searchController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', globalSearch);

export default router;
