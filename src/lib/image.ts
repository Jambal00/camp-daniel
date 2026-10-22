/**
 * Shrinks a photo on the phone before upload: longest side 1600px, JPEG,
 * and small enough to store comfortably (well under the 1 MB record limit).
 * Browsers apply the photo's own rotation when drawing it, so sideways
 * phone photos come out upright.
 */
export async function shrinkPhoto(file: File | Blob, maxEdge = 1600, maxChars = 600_000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file isn’t a photo this phone can open.'));
      el.src = url;
    });
    let edge = maxEdge;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This phone couldn’t prepare the photo.');
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.8, 0.7, 0.6]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.length <= maxChars) return data;
      }
      edge = Math.round(edge * 0.75);
    }
    throw new Error('That photo is too large even after shrinking.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
