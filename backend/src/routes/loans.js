import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
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
  transferLoanBranch,
} from '../controllers/loanController.js';
import { sendReleaseOtp, verifyReleaseOtp } from '../controllers/otpController.js';
import { listNoticesForLoan } from '../controllers/noticeController.js';
import { listLoanPhotos, uploadLoanPhoto, deleteLoanPhoto } from '../controllers/photoController.js';

const router = Router();
router.use(verifyAuth);

router.get('/', listLoans);
router.post('/', createLoan);
router.get('/huid-check', checkHuid);
router.get('/:id', getLoan);
router.put('/:id', updateLoan);
router.patch('/:id/status', updateLoanStatus);
router.post('/:id/rollover', rolloverLoan);
router.patch('/:id/branch', requireRole('super_admin', 'admin'), transferLoanBranch);
router.post('/:id/release-otp', sendReleaseOtp);
router.post('/:id/release-otp/verify', verifyReleaseOtp);
router.get('/:id/interest-summary', getLoanInterestSummary);
router.get('/:id/notices', listNoticesForLoan);
router.patch('/:id/items/:itemId/huid-verification', setHuidVerification);
router.get('/:id/photos', listLoanPhotos);
router.post('/:id/photos', uploadLoanPhoto);
router.delete('/:id/photos/:photoId', deleteLoanPhoto);

export default router;
