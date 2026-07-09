import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import {
  createPayment,
  getPaymentsForLoan,
  listPayments,
  updatePayment,
  deletePayment,
} from '../controllers/paymentController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listPayments);
router.post('/', createPayment);
router.get('/:loanId', getPaymentsForLoan);
router.put('/:paymentId', updatePayment);
router.delete('/:paymentId', deletePayment);

export default router;
