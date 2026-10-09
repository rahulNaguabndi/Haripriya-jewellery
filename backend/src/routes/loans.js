import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import {
  createLoan,
  listLoans,
  getLoan,
  updateLoan,
  updateLoanStatus,
  getLoanInterestSummary,
  rolloverLoan,
  checkHuid,
  setHuidVerification,
} from '../controllers/loanController.js';
import { listNoticesForLoan } from '../controllers/noticeController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listLoans);
router.post('/', createLoan);
router.get('/huid-check', checkHuid);
router.get('/:id', getLoan);
router.put('/:id', updateLoan);
router.patch('/:id/status', updateLoanStatus);
router.post('/:id/rollover', rolloverLoan);
router.get('/:id/interest-summary', getLoanInterestSummary);
router.get('/:id/notices', listNoticesForLoan);
router.patch('/:id/items/:itemId/huid-verification', setHuidVerification);

export default router;
