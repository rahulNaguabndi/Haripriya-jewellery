import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabaseClient.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requireFields } from '../utils/validators.js';
import { logActivity } from '../utils/activityLog.js';

// Item photos live in a private Storage bucket; the browser compresses each
// picture to ~100 KB WebP before upload (see frontend utils/imageCompress.js)
// and the server re-checks size + format, so a phone's 4 MB camera JPEG can
// never land in storage as-is.
const BUCKET = 'loan-photos';
const MAX_BYTES = 400 * 1024;
const MAX_PHOTOS_PER_LOAN = 12;
const SIGNED_URL_SECONDS = 60 * 60;
const FORMATS = {
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};

let bucketReady = false;
// The migration creates the bucket; this is a fallback for a project where
// only the tables were applied.
async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: Object.keys(FORMATS),
    });
    if (error && !/already exists/i.test(error.message)) throw new ApiError(500, `Photo storage is not set up: ${error.message}`);
  }
  bucketReady = true;
}

async function withSignedUrls(rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS);
  if (error) throw new ApiError(400, error.message);
  const urlByPath = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) || null }));
}

// GET /api/loans/:id/photos
export async function listLoanPhotos(req, res, next) {
  try {
    const { data, error } = await supabase
      .from('loan_photos')
      .select('*')
      .eq('loan_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw new ApiError(400, error.message);
    res.json({ data: await withSignedUrls(data || []) });
  } catch (err) {
    next(err);
  }
}

// POST /api/loans/:id/photos { data: <base64>, contentType, width, height, caption? }
export async function uploadLoanPhoto(req, res, next) {
  try {
    requireFields(req.body, ['data', 'contentType']);
    const { data: base64, contentType, width, height, caption } = req.body;
    const format = FORMATS[contentType];
    if (!format) throw new ApiError(400, 'Photos must be WebP or JPEG');

    const buffer = Buffer.from(String(base64).replace(/^data:[^,]+,/, ''), 'base64');
    if (!buffer.length || !format.magic(buffer)) throw new ApiError(400, 'That file is not a valid image');
    if (buffer.length > MAX_BYTES) {
      throw new ApiError(400, `Photo is ${Math.round(buffer.length / 1024)} KB after compression - the limit is ${MAX_BYTES / 1024} KB`);
    }

    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('id, loan_number, borrower_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (loanError) throw new ApiError(400, loanError.message);
    if (!loan) throw new ApiError(404, 'Loan not found');

    const { count } = await supabase.from('loan_photos').select('id', { count: 'exact', head: true }).eq('loan_id', loan.id);
    if ((count || 0) >= MAX_PHOTOS_PER_LOAN) throw new ApiError(400, `A loan can have at most ${MAX_PHOTOS_PER_LOAN} photos`);

    await ensureBucket();
    const path = `${loan.id}/${randomUUID()}.${format.ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (uploadError) throw new ApiError(400, uploadError.message);

    const { data: row, error } = await supabase
      .from('loan_photos')
      .insert({
        loan_id: loan.id,
        storage_path: path,
        content_type: contentType,
        size_bytes: buffer.length,
        width: Number(width) || null,
        height: Number(height) || null,
        caption: caption ? String(caption).slice(0, 200) : null,
        uploaded_by: req.user.id,
      })
      .select()
      .single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw new ApiError(400, error.message);
    }

    await logActivity(req, {
      action: 'photo.add',
      entityType: 'loan_photo',
      entityId: row.id,
      loanId: loan.id,
      borrowerId: loan.borrower_id,
      summary: `Added a photo to ${loan.loan_number} (${Math.round(buffer.length / 1024)} KB)`,
    });

    const [withUrl] = await withSignedUrls([row]);
    res.status(201).json(withUrl);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/loans/:id/photos/:photoId
export async function deleteLoanPhoto(req, res, next) {
  try {
    const { data: row, error } = await supabase
      .from('loan_photos')
      .delete()
      .eq('id', req.params.photoId)
      .eq('loan_id', req.params.id)
      .select('*, loans(loan_number, borrower_id)')
      .maybeSingle();
    if (error) throw new ApiError(400, error.message);
    if (!row) throw new ApiError(404, 'Photo not found');

    // Re-pledges/rollovers share the file; only remove it once unreferenced.
    const { count } = await supabase
      .from('loan_photos')
      .select('id', { count: 'exact', head: true })
      .eq('storage_path', row.storage_path);
    if (!count) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
      if (removeError) console.warn('[photos] could not remove file:', removeError.message);
    }

    await logActivity(req, {
      action: 'photo.delete',
      entityType: 'loan_photo',
      entityId: row.id,
      loanId: row.loan_id,
      borrowerId: row.loans?.borrower_id || null,
      summary: `Removed a photo from ${row.loans?.loan_number || 'loan'}`,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
