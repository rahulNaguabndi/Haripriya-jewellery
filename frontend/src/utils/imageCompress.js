// Shrinks a phone/camera photo to a small WebP before upload, so each item
// photo costs ~60-120 KB of Supabase Storage instead of 3-5 MB. Resizes to
// at most MAX_SIDE px on the long edge, then steps JPEG/WebP quality down
// until the file fits TARGET_BYTES.
const MAX_SIDE = 1280;
const TARGET_BYTES = 120 * 1024;
const QUALITIES = [0.78, 0.68, 0.58, 0.48, 0.4];

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read "${file.name}" as an image`));
    };
    img.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file) {
  const img = await loadImage(file);
  let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs would otherwise turn black as JPEG
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of QUALITIES) {
      // Older Safari can't encode WebP and silently returns PNG - fall back to JPEG.
      let blob = await toBlob(canvas, 'image/webp', quality);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= TARGET_BYTES) {
        return { base64: await blobToBase64(blob), contentType: blob.type, size: blob.size, width, height, originalSize: file.size };
      }
    }
    scale *= 0.75; // still too big at the lowest quality: shrink and retry
  }
  throw new Error(`"${file.name}" couldn't be compressed small enough - try a closer, simpler shot.`);
}

export function formatKB(bytes) {
  if (!bytes) return '—';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
