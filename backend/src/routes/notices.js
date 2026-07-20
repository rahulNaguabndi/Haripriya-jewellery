import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { listNoticesDue, createNotice } from '../controllers/noticeController.js';

const router = Router();
router.use(verifyAuth);

router.get('/due', listNoticesDue);
router.post('/', createNotice);

export default router;
