import { PhotoManager } from '../../components/Photos';
import { href } from '../../lib/router';
import { ALBUM } from '../guest/Album';

/** Owner › Guide › Photo album: add, rotate and delete the album photos guests browse. */
export function OwnerAlbum() {
  return (
    <main className="screen">
      <a className="back" href={href('/owner/guide')}>‹ Guide</a>
      <h1 className="title">Photo album</h1>
      <p className="muted" style={{ margin: 0 }}>Shots of the property and the family for guests to browse, especially first-timers. They show in the order you add them.</p>
      <PhotoManager sectionId={ALBUM} />
      <a className="btn outline" href={href('/album')}>See it the way guests do</a>
    </main>
  );
}
