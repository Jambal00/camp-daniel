import { useEffect, useRef, useState } from 'react';
import { store } from '../data';
import type { GuidePhoto } from '../data/types';
import { shrinkPhoto } from '../lib/image';
import { toast } from './Toast';

/** Live list of a section's photos. */
export function usePhotos(sectionId: string): GuidePhoto[] | null {
  const [photos, setPhotos] = useState<GuidePhoto[] | null>(null);
  useEffect(() => store.watchPhotos(sectionId, setPhotos), [sectionId]);
  return photos;
}

/** Full-screen view of one photo; tap anywhere or Close to dismiss. */
function Viewer({ photo, onClose }: { photo: GuidePhoto; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={photo.caption || 'Photo'} onClick={onClose}>
      <img src={photo.data} alt={photo.caption} />
      {photo.caption && <div className="viewer-cap">{photo.caption}</div>}
      <button className="btn outline small viewer-close" onClick={onClose}>Close</button>
    </div>
  );
}

/** Guests: the section's photos, tap to enlarge. Renders nothing when there are none. */
export function PhotoGallery({ sectionId }: { sectionId: string }) {
  const photos = usePhotos(sectionId);
  const [open, setOpen] = useState<GuidePhoto | null>(null);
  if (!photos || photos.length === 0) return null;
  return (
    <section className="photos" aria-label="Photos">
      {photos.map((p) => (
        <button key={p.id} className="photo" onClick={() => setOpen(p)} aria-label={`Enlarge photo${p.caption ? `: ${p.caption}` : ''}`}>
          <img src={p.data} alt={p.caption} loading="lazy" />
          {p.caption && <span className="photo-cap">{p.caption}</span>}
        </button>
      ))}
      {open && <Viewer photo={open} onClose={() => setOpen(null)} />}
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
                <button className="link-btn" style={{ color: 'var(--red-ink)', flexShrink: 0 }} onClick={() => setConfirmId(p.id)} aria-label={`Delete photo${p.caption ? `: ${p.caption}` : ''}`}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {pending ? (
        <div className="card">
          <img src={pending} alt="New photo preview" style={{ width: '100%', borderRadius: 10 }} />
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
