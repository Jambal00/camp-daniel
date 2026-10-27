import { PhotoGallery } from '../../components/Photos';
import { today } from '../../lib/dates';
import { go, href } from '../../lib/router';
import { useSession } from '../../lib/session';
import { ALBUM, AlbumThumb } from './Album';
import { BoardFeed } from './Board';

type Tab = 'album' | 'guests';

/** One place for photos: the owners' album and what guests have shared. */
export function PhotosHub({ tab }: { tab: Tab }) {
  const pick = (t: Tab) => go(t === 'album' ? '/photos' : '/photos?tab=guests');
  return (
    <main className="screen">
      <a className="back" href={href('/')}>‹ Calendar</a>
      <h1 className="title">Photos</h1>
      <div className="seg-tabs" role="tablist" aria-label="Whose photos">
        <button role="tab" aria-selected={tab === 'album'} onClick={() => pick('album')}>From Pete &amp; Trisha</button>
        <button role="tab" aria-selected={tab === 'guests'} onClick={() => pick('guests')}>From guests</button>
      </div>
      {tab === 'album' ? (
        <>
          <p className="muted" style={{ margin: 0 }}>The cabin, the lake and the crew. Tap a photo to see it bigger, then swipe through.</p>
          <PhotoGallery sectionId={ALBUM} empty={<div className="card" style={{ textAlign: 'center' }}><div className="strong">Photos coming soon</div><div className="small muted">Pete &amp; Trisha are picking their favorites.</div></div>} />
        </>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>Photos and tips from people who have stayed. Everyone on the guest list can see these.</p>
          <BoardFeed />
        </>
      )}
    </main>
  );
}

/** The one card guests use to get to Photos. */
export function PhotosLink() {
  const { snap, me } = useSession();
  const hasStayed = snap.bookings.some((b) => b.personId === me.id && b.status === 'approved' && b.start <= today());
  const sub = hasStayed ? 'Share your favorites from your stay' : 'Take a look around before you come up';
  return (
    <a className="card album-link" href={href('/photos')}>
      <AlbumThumb />
      <span className="meta" style={{ flex: 1 }}><span className="strong">Photos</span><span className="small muted">{sub}</span></span>
      <span aria-hidden="true">›</span>
    </a>
  );
}
