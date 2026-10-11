import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api.js';
import { compressImage, formatKB } from '../../utils/imageCompress.js';
import { useConfirm } from '../common/ConfirmDialog.jsx';
import Modal from '../common/Modal.jsx';
import { Skeleton } from '../common/Skeleton.jsx';

// Photos of the pledged ornaments. Taken on the phone's camera (or picked
// from files), compressed in the browser to ~100 KB, then uploaded. Item
// photos only - ID documents (Aadhaar etc.) are deliberately not stored.
export default function LoanPhotos({ loanId, onChange }) {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [viewing, setViewing] = useState(null);
  const inputRef = useRef(null);
  const confirm = useConfirm();

  async function load() {
    try {
      const res = await api.get(`/loans/${loanId}/photos`);
      setPhotos(res.data.data);
    } catch (err) {
      setPhotos([]);
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId]);

  async function handleFiles(fileList) {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setError('');
    try {
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `Compressing ${i + 1} of ${files.length}…` : 'Compressing…');
        const img = await compressImage(file);
        setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length} (${formatKB(img.size)})…` : `Uploading ${formatKB(img.size)}…`);
        await api.post(`/loans/${loanId}/photos`, {
          data: img.base64,
          contentType: img.contentType,
          width: img.width,
          height: img.height,
        });
      }
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleDelete(photo) {
    const ok = await confirm({ title: 'Remove photo?', message: 'This photo will be removed from this loan.', confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await api.delete(`/loans/${loanId}/photos/${photo.id}`);
      setViewing(null);
      await load();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const totalBytes = (photos || []).reduce((n, p) => n + (p.size_bytes || 0), 0);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Item photos</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {photos?.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} · ${formatKB(totalBytes)}` : 'Ornaments only — ID cards are not stored.'}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => inputRef.current?.click()}>
          {busy || '+ Add photo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {photos === null ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={96} height={96} />
          <Skeleton width={96} height={96} />
        </div>
      ) : photos.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{
            width: '100%',
            border: '1.5px dashed var(--border)',
            borderRadius: 'var(--radius)',
            background: 'transparent',
            padding: '22px 12px',
            color: 'var(--text-muted)',
            fontSize: 13.5,
            cursor: 'pointer',
          }}
        >
          Take or choose a photo of the pledged items
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 10 }}>
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewing(p)}
              aria-label="View photo"
              style={{ padding: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'zoom-in', aspectRatio: '1', background: 'var(--hover)' }}
            >
              {p.url ? <img src={p.url} alt="Pledged item" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <Modal title="Item photo" onClose={() => setViewing(null)} width={720}>
          <img src={viewing.url} alt="Pledged item" style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {viewing.width}×{viewing.height} · {formatKB(viewing.size_bytes)} · {new Date(viewing.created_at).toLocaleDateString('en-IN')}
            </span>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(viewing)}>Remove</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
