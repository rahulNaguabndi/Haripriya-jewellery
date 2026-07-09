import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import {
  createLoan,
  listLoans,
  getLoan,
  updateLoan,
  updateLoanStatus,
  getLoanInterestSummary,
} from '../controllers/loanController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listLoans);
router.post('/', createLoan);
router.get('/:id', getLoan);
router.put('/:id', updateLoan);
router.patch('/:id/status', updateLoanStatus);
router.get('/:id/interest-summary', getLoanInterestSummary);

export default router;
