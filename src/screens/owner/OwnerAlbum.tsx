import { useRef, useState } from 'react';
import { PhotoManager, usePhotos } from '../../components/Photos';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import { shrinkPhoto } from '../../lib/image';
import { href } from '../../lib/router';
import { ALBUM, ALBUM_COVER, AlbumThumb } from '../guest/Album';

/** The thumbnail guests see on the album card. One photo; picking a new one replaces it. */
function CoverPicker() {
  const covers = usePhotos(ALBUM_COVER);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await shrinkPhoto(file, 800);
      await store.addPhoto({ sectionId: ALBUM_COVER, caption: 'Album cover', data, order: 1 });
      for (const old of covers ?? []) await store.deletePhoto(old.id);
      toast('Cover photo updated.');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Couldn’t use that photo.');
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  };

  const remove = async () => {
    for (const old of covers ?? []) await store.deletePhoto(old.id);
    toast('Cover photo removed.');
  };

  return (
    <div className="field">
      <div className="label">Cover photo</div>
      <div className="card album-link">
        <AlbumThumb />
        <span className="meta" style={{ flex: 1 }}>
          <span className="strong">Photo album</span>
          <span className="small muted">{covers?.length ? 'This is the thumbnail guests see.' : 'No cover yet, so guests see a camera icon.'}</span>
        </span>
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="row" style={{ gap: 14 }}>
        <button className="btn outline small" onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Saving…' : covers?.length ? 'Change cover' : 'Choose a cover'}</button>
        {!!covers?.length && <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={remove}>Remove</button>}
      </div>
    </div>
  );
}

/** Owner › Guide › Photo album: the cover, plus the album photos guests browse. */
export function OwnerAlbum() {
  return (
    <main className="screen">
      <a className="back" href={href('/owner/guide')}>‹ Guide</a>
      <h1 className="title">Photo album</h1>
      <p className="muted" style={{ margin: 0 }}>Shots of the property and the family for guests to browse, especially first-timers. New photos go to the end; use the ↑ ↓ arrows to change the order.</p>
      <CoverPicker />
      <PhotoManager sectionId={ALBUM} addFirst />
    </main>
  );
}
