import { PhotoGallery } from '../../components/Photos';
import { href } from '../../lib/router';

/** The cabin, the lake and the family, for anyone who hasn't been up yet. */
export const ALBUM = 'album';

export function Album() {
  return (
    <main className="screen">
      <a className="back" href={href('/')}>‹ Calendar</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="title">Photo album</h1>
        <p className="muted" style={{ margin: 0 }}>The cabin, the lake and the crew. Tap a photo to see it bigger, then swipe through.</p>
      </header>
      <PhotoGallery sectionId={ALBUM} empty={<div className="card" style={{ textAlign: 'center' }}><div className="strong">Photos coming soon</div><div className="small muted">Pete &amp; Trisha are picking their favorites.</div></div>} />
    </main>
  );
}

/** Small card linking to the album. */
export function AlbumLink({ sub = 'See the cabin, the lake and the crew' }: { sub?: string }) {
  return (
    <a className="card album-link" href={href('/album')}>
      <span className="ico" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
      </span>
      <span className="meta" style={{ flex: 1 }}><span className="strong">Photo album</span><span className="small muted">{sub}</span></span>
      <span aria-hidden="true">›</span>
    </a>
  );
}
