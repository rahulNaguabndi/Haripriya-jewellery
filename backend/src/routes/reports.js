import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import {
  getSummary,
  getLoanCounts,
  getBorrowerCount,
  getOutstandingTotals,
  getRecentPayments,
  getBorrowerSummary,
  getOutstandingInterest,
  getPaymentsReport,
  getOverdueLoans,
  getClosedLoans,
  getStatusBreakdown,
  getPaymentsMonthly,
  getLoansMonthly,
  getDashboardInsights,
} from '../controllers/reportController.js';
import { getDemographics } from '../controllers/demographicsController.js';

const router = Router();
router.use(verifyAuth);

router.get('/summary', getSummary);
router.get('/dashboard/loan-counts', getLoanCounts);
router.get('/dashboard/borrower-count', getBorrowerCount);
router.get('/dashboard/outstanding-totals', getOutstandingTotals);
router.get('/dashboard/recent-payments', getRecentPayments);
router.get('/borrower-summary', getBorrowerSummary);
router.get('/outstanding-interest', getOutstandingInterest);
router.get('/payments', getPaymentsReport);
router.get('/overdue', getOverdueLoans);
router.get('/closed', getClosedLoans);
router.get('/status-breakdown', getStatusBreakdown);
router.get('/payments-monthly', getPaymentsMonthly);
router.get('/loans-monthly', getLoansMonthly);
router.get('/dashboard/insights', getDashboardInsights);
router.get('/demographics', getDemographics);

export default router;
