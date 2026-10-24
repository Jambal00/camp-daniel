import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { store } from '../data';
import type { GuidePhoto } from '../data/types';
import { rotatePhoto, shrinkPhoto } from '../lib/image';
import { toast } from './Toast';

/** Live list of a section's photos. */
export function usePhotos(sectionId: string): GuidePhoto[] | null {
  const [photos, setPhotos] = useState<GuidePhoto[] | null>(null);
  useEffect(() => store.watchPhotos(sectionId, setPhotos), [sectionId]);
  return photos;
}

/** Full-screen view; swipe or use the arrows to move through the set. Tap the backdrop or Close to dismiss. */
function Viewer({ photos, start, onClose }: { photos: GuidePhoto[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const touchX = useRef<number | null>(null);
  const n = photos.length;
  const step = (d: number) => setI((x) => (x + d + n) % n);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, n]);
  const photo = photos[Math.min(i, n - 1)];
  if (!photo) return null;
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || 'Photo'}
      onClick={onClose}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null || n < 2) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      }}
    >
      <img src={photo.data} alt={photo.caption} onClick={stop} />
      {photo.caption && <div className="viewer-cap">{photo.caption}</div>}
      <div className="viewer-nav" onClick={stop}>
        {n > 1 && <button className="viewer-arrow" onClick={() => step(-1)} aria-label="Previous photo">‹</button>}
        <button className="btn outline small viewer-close" onClick={onClose}>Close</button>
        {n > 1 && <button className="viewer-arrow" onClick={() => step(1)} aria-label="Next photo">›</button>}
      </div>
      {n > 1 && <div className="viewer-count num">{i + 1} of {n}</div>}
    </div>
  );
}

/** Guests: the section's photos, tap to enlarge. Renders nothing (or `empty`) when there are none. */
export function PhotoGallery({ sectionId, empty = null }: { sectionId: string; empty?: ReactNode }) {
  const photos = usePhotos(sectionId);
  const [open, setOpen] = useState<number | null>(null);
  if (!photos) return null;
  if (photos.length === 0) return <>{empty}</>;
  return (
    <section className="photos" aria-label="Photos">
      {photos.map((p, k) => (
        <button key={p.id} className="photo" onClick={() => setOpen(k)} aria-label={`Enlarge photo${p.caption ? `: ${p.caption}` : ''}`}>
          <img src={p.data} alt={p.caption} loading="lazy" />
          {p.caption && <span className="photo-cap">{p.caption}</span>}
        </button>
      ))}
      {open !== null && <Viewer photos={photos} start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Owners: add photos (camera or library, shrunk on the phone) and delete them. */
export function PhotoManager({ sectionId }: { sectionId: string }) {
  const photos = usePhotos(sectionId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [turning, setTurning] = useState<string | null>(null);

  const turn = async (p: GuidePhoto) => {
    setTurning(p.id);
    try {
      await store.updatePhoto(p.id, { data: await rotatePhoto(p.data) });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t turn the photo. Try again.');
    } finally {
      setTurning(null);
    }
  };

  const turnPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      setPending(await rotatePhoto(pending));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t turn the photo.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      setPending(await shrinkPhoto(file));
      setCaption('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t use that photo.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const order = Math.max(0, ...(photos ?? []).map((p) => p.order)) + 1;
      await store.addPhoto({ sectionId, caption: caption.trim(), data: pending, order });
      setPending(null);
      toast('Photo added. Guests see it right away.');
    } catch {
      toast('Couldn’t save the photo. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await store.deletePhoto(id);
      toast('Photo deleted.');
    } catch {
      toast('Couldn’t delete the photo. Try again.');
    }
    setConfirmId(null);
  };

  return (
    <div className="field">
      <div className="section-label">
        <div className="label">Photos</div>
        <span className="small muted">{photos ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Loading…'}</span>
      </div>

      {photos && photos.length > 0 && (
        <div className="card tight">
          {photos.map((p) => (
            <div key={p.id} className="list-row" style={{ alignItems: 'center' }}>
              <span className="row" style={{ minWidth: 0 }}>
                <img src={p.data} alt="" className="thumb" />
                <span className="small" style={{ minWidth: 0 }}>{p.caption || <span className="muted">No caption</span>}</span>
              </span>
              {confirmId === p.id ? (
                <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                  <button className="btn outline small" onClick={() => setConfirmId(null)}>Keep</button>
                  <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={() => remove(p.id)}>Delete</button>
                </span>
              ) : (
                <span className="row" style={{ gap: 14, flexShrink: 0 }}>
                  <button className="link-btn" onClick={() => turn(p)} disabled={turning === p.id} aria-label={`Rotate photo${p.caption ? `: ${p.caption}` : ''}`}>{turning === p.id ? '…' : 'Rotate'}</button>
                  <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setConfirmId(p.id)} aria-label={`Delete photo${p.caption ? `: ${p.caption}` : ''}`}>Delete</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pending ? (
        <div className="card">
          <img src={pending} alt="New photo preview" style={{ width: '100%', borderRadius: 10 }} />
          <button className="btn outline small" onClick={turnPending} disabled={busy}>↻ Rotate</button>
          <div className="field">
            <label htmlFor={`cap-${sectionId}`}>Caption (optional)</label>
            <input id={`cap-${sectionId}`} className="input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Well breaker, bottom right" />
          </div>
          <div className="grid-2">
            <button className="btn outline" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add photo'}</button>
          </div>
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button className="btn outline" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Preparing photo…' : '+ Add a photo'}</button>
        </>
      )}
    </div>
  );
}

/** Owners: load a photo pack (.json made from the printed Cabin Guide). Skips photos already there. */
export function PhotoPackImport() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (file: File | undefined) => {
    if (!file) return;
    try {
      const pack = JSON.parse(await file.text()) as { photos?: Omit<GuidePhoto, 'id' | 'createdAt'>[] };
      const list = (pack.photos ?? []).filter((p) => p && p.sectionId && typeof p.data === 'string' && p.data.startsWith('data:image/'));
      if (list.length === 0) throw new Error('empty');
      const sections = [...new Set(list.map((p) => p.sectionId))];
      const existing = new Map<string, Set<string>>();
      for (const id of sections) {
        existing.set(id, new Set(await new Promise<string[]>((resolve) => {
          const stop = store.watchPhotos(id, (ps) => { resolve(ps.map((p) => p.caption)); setTimeout(() => stop(), 0); });
        })));
      }
      let added = 0;
      for (const [i, p] of list.entries()) {
        if (existing.get(p.sectionId)?.has(p.caption)) continue;
        setBusy(`Adding photo ${i + 1} of ${list.length}…`);
        await store.addPhoto({ sectionId: p.sectionId, caption: p.caption ?? '', data: p.data, order: p.order ?? i });
        added++;
      }
      toast(added ? `Added ${added} photo${added === 1 ? '' : 's'} to the guide.` : 'Those photos are already in the guide.');
    } catch {
      toast('That file isn’t a Camp Daniel photo pack.');
    } finally {
      setBusy(null);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".json,application/json" hidden onChange={(e) => run(e.target.files?.[0])} />
      <button className="btn outline small" onClick={() => ref.current?.click()} disabled={!!busy}>{busy ?? 'Import a photo pack'}</button>
    </>
  );
}
