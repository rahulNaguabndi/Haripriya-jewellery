import { ApiError } from '../middleware/errorHandler.js';

const PAGE = 1000; // PostgREST caps a single select at 1000 rows by default

// Pages through a select so bulk reads stay complete past 1000 rows.
// `buildQuery` must return a fresh, deterministically ordered query each call.
export async function fetchAll(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
    if (error) throw new ApiError(400, error.message);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}
