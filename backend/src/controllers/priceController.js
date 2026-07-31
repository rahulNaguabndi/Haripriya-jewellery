import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';

const METALS = ['gold', 'silver'];
const UNITS = ['gram'];

// POST /api/prices/snapshots  (machine-to-machine, guarded by requireIngestKey)
// Body: { snapshots: [{ source, metal, purity, priceInr, unit? }, ...] }
// All rows in one request share a single recorded_at so a scrape run groups
// cleanly. Writes go through the service-role Supabase client, same as every
// other backend write.
export async function ingestSnapshots(req, res, next) {
  try {
    const snapshots = req.body?.snapshots;
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      throw new ApiError(400, 'snapshots must be a non-empty array');
    }

    const recordedAt = new Date().toISOString();
    const rows = snapshots.map((s, i) => {
      const price = Number(s.priceInr);
      if (!s.source || !s.metal || !s.purity) {
        throw new ApiError(400, `snapshot[${i}] missing source/metal/purity`);
      }
      if (!METALS.includes(String(s.metal).toLowerCase())) {
        throw new ApiError(400, `snapshot[${i}].metal must be one of: ${METALS.join(', ')}`);
      }
      if (!Number.isFinite(price) || price <= 0) {
        throw new ApiError(400, `snapshot[${i}].priceInr must be a positive number`);
      }
      const unit = s.unit || 'gram';
      if (!UNITS.includes(unit)) {
        throw new ApiError(400, `snapshot[${i}].unit must be one of: ${UNITS.join(', ')}`);
      }
      return {
        source: String(s.source),
        metal: String(s.metal).toLowerCase(),
        purity: String(s.purity).toLowerCase(),
        price_inr: price,
        unit,
        recorded_at: recordedAt,
      };
    });

    const { error } = await supabase.from('price_snapshots').insert(rows);
    if (error) throw new ApiError(500, error.message);

    res.status(201).json({ inserted: rows.length, recordedAt });
  } catch (err) {
    next(err);
  }
}

// GET /api/prices/snapshots  (authed) — recent history, newest first.
// Query: ?metal=gold&purity=24k&source=bullions&limit=200
export async function getSnapshots(req, res, next) {
  try {
    const { metal, purity, source } = req.query;
    const limit = Math.min(Number(req.query.limit) || 500, 2000);

    let query = supabase
      .from('price_snapshots')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (metal) query = query.eq('metal', String(metal).toLowerCase());
    if (purity) query = query.eq('purity', String(purity).toLowerCase());
    if (source) query = query.eq('source', source);

    const { data, error } = await query;
    if (error) throw new ApiError(500, error.message);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
