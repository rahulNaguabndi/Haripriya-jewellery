import { Router } from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { requireIngestKey } from '../middleware/ingestKey.js';
import { ingestSnapshots, getSnapshots } from '../controllers/priceController.js';

const router = Router();

// Machine-to-machine ingest (price-scraper GitHub Action): no user session,
// guarded by the shared ingest key instead of verifyAuth.
router.post('/snapshots', requireIngestKey, ingestSnapshots);

// App reads: normal authenticated access.
router.get('/snapshots', verifyAuth, getSnapshots);

export default router;
