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

/** Full-size photos already fetched this session, by id. */
const fullCache = new Map<string, Promise<string>>();

/** The full photo behind a thumbnail (fetched once); the photo itself when it isn't a thumbnail. */
export function fullPhoto(p: Pick<GuidePhoto, 'id' | 'data' | 'thumbOf'>): Promise<string> {
  if (!p.thumbOf) return Promise.resolve(p.data);
  let hit = fullCache.get(p.id);
  if (!hit) {
    hit = store.getFullPhoto(p.thumbOf, p.id);
    hit.catch(() => fullCache.delete(p.id));
    fullCache.set(p.id, hit);
  }
  return hit;
}

function useFullPhoto(p: GuidePhoto | undefined): string | null {
  const [src, setSrc] = useState<{ id: string; data: string } | null>(null);
  useEffect(() => {
    if (!p) return;
    let live = true;
    fullPhoto(p).then((data) => live && setSrc({ id: p.id, data }), () => undefined);
    return () => {
      live = false;
    };
  }, [p]);
  return p && src?.id === p.id ? src.data : null;
}

/** Full-screen view; swipe or use the arrows to move through the set. Tap the backdrop or Close to dismiss. */
export function Viewer({ photos, start, onClose }: { photos: GuidePhoto[]; start: number; onClose: () => void }) {
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
  const full = useFullPhoto(photo);
  // Fetch the neighbors too, so swiping is quick.
  useEffect(() => {
    if (n < 2) return;
    void fullPhoto(photos[(i + 1) % n]).catch(() => undefined);
    void fullPhoto(photos[(i - 1 + n) % n]).catch(() => undefined);
  }, [i, n, photos]);
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
      <img src={full ?? photo.data} alt={photo.caption} onClick={stop} className={full ? undefined : 'loading-full'} />
      {!full && <div className="viewer-loading" aria-live="polite">Loading full photo…</div>}
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
export function PhotoGallery({ sectionId, empty = null, showLoading = false }: { sectionId: string; empty?: ReactNode; showLoading?: boolean }) {
  const photos = usePhotos(sectionId);
  const [open, setOpen] = useState<number | null>(null);
  if (!photos) return showLoading ? <div className="muted" role="status" style={{ padding: '24px 0', textAlign: 'center' }}>Loading photos…</div> : null;
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
export function PhotoManager({ sectionId, addFirst = false }: { sectionId: string; addFirst?: boolean }) {
  const photos = usePhotos(sectionId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [turning, setTurning] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  /** Swap a photo with its neighbor, then renumber so the order is clean. */
  const move = async (k: number, dir: -1 | 1) => {
    if (!photos) return;
    const list = [...photos];
    const to = k + dir;
    if (to < 0 || to >= list.length) return;
    [list[k], list[to]] = [list[to], list[k]];
    setMoving(true);
    try {
      await Promise.all(list.map((p, n) => (p.order === n + 1 ? null : store.updatePhoto(p.id, { order: n + 1 }))));
    } catch {
      toast('Couldn’t move the photo. Try again.');
    } finally {
      setMoving(false);
    }
  };

  const turn = async (p: GuidePhoto) => {
    setTurning(p.id);
    try {
      if (p.thumbOf) {
        const [data, thumb] = await Promise.all([fullPhoto(p).then(rotatePhoto), rotatePhoto(p.data)]);
        fullCache.set(p.id, Promise.resolve(data));
        await store.updatePhoto(p.id, { data, thumb });
      } else {
        await store.updatePhoto(p.id, { data: await rotatePhoto(p.data) });
      }
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

  const photoList = photos && photos.length > 0 && (
        <div className="card tight">
          {photos.map((p, k) => (
            <div key={p.id} className="list-row photo-row">
              <img src={p.data} alt="" className="thumb" />
              <span className="photo-row-body">
                <span className="small">{p.caption || <span className="muted">No caption</span>}</span>
                {confirmId === p.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <span className="small strong">Delete this photo?</span>
                    <button className="btn outline small" onClick={() => setConfirmId(null)}>Keep</button>
                    <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={() => remove(p.id)}>Delete</button>
                  </span>
                ) : (
                  <span className="photo-actions">
                    <button className="icon-btn" onClick={() => move(k, -1)} disabled={k === 0 || moving} aria-label={`Move photo up${p.caption ? `: ${p.caption}` : ''}`}>↑</button>
                    <button className="icon-btn" onClick={() => move(k, 1)} disabled={k === photos.length - 1 || moving} aria-label={`Move photo down${p.caption ? `: ${p.caption}` : ''}`}>↓</button>
                    <button className="link-btn" onClick={() => turn(p)} disabled={turning === p.id} aria-label={`Rotate photo${p.caption ? `: ${p.caption}` : ''}`}>{turning === p.id ? '…' : 'Rotate'}</button>
                    <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setConfirmId(p.id)} aria-label={`Delete photo${p.caption ? `: ${p.caption}` : ''}`}>Delete</button>
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      );

  const addArea = pending ? (
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
      );

  return (
    <div className="field">
      <div className="section-label">
        <div className="label">Photos</div>
        <span className="small muted">{photos ? `${photos.length} photo${photos.length === 1 ? '' : 's'}` : 'Loading…'}</span>
      </div>

      {addFirst ? addArea : photoList}
      {addFirst ? photoList : addArea}
    </div>
  );
}
