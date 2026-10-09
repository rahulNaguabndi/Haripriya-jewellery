import { Router } from 'express';
import { verifyAuth, requireRole } from '../middleware/auth.js';
import { getLedger, exportLedgerXlsx } from '../controllers/accountsController.js';

const router = Router();
router.use(verifyAuth);
router.use(requireRole('super_admin', 'admin'));

router.get('/ledger', getLedger);
router.get('/ledger.xlsx', exportLedgerXlsx);

export default router;
