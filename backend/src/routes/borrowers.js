import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import {
  createBorrower,
  listBorrowers,
  searchBorrowers,
  getBorrower,
  updateBorrower,
  deleteBorrower,
} from '../controllers/borrowerController.js';

const router = Router();
router.use(verifyAuth);

router.get('/search', searchBorrowers);
router.get('/', listBorrowers);
router.post('/', createBorrower);
router.get('/:id', getBorrower);
router.put('/:id', updateBorrower);
router.delete('/:id', deleteBorrower);

export default router;
