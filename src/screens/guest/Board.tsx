import { useEffect, useRef, useState } from 'react';
import { LinkedText } from '../../components/LinkedText';
import { Viewer } from '../../components/Photos';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GuestPost } from '../../data/types';
import { today } from '../../lib/dates';
import { rotatePhoto, shrinkPhoto } from '../../lib/image';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

const SEEN_KEY = 'camp-daniel:posts-seen';

export function usePosts(since?: string): GuestPost[] | null {
  const [posts, setPosts] = useState<GuestPost[] | null>(null);
  useEffect(() => store.watchPosts(setPosts, since), [since]);
  return posts;
}

/** When this person last opened the board (owners use it to count new posts). */
export function postsSeenAt(): string {
  try {
    return localStorage.getItem(SEEN_KEY) || '1970-01-01';
  } catch {
    return '1970-01-01';
  }
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

/** Card linking to the board. */
export function BoardLink({ sub = 'Photos and tips from people who have stayed', badge = 0 }: { sub?: string; badge?: number }) {
  const { isOwner } = useSession();
  return (
    <a className="card album-link" href={href(isOwner ? '/owner/guests' : '/photos?tab=guests')}>
      <span className="ico" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></svg>
      </span>
      <span className="meta" style={{ flex: 1 }}><span className="strong">Guest photos &amp; tips</span><span className="small muted">{sub}</span></span>
      {badge > 0 && <span className="chip pick num">{badge} new</span>}
      <span aria-hidden="true">›</span>
    </a>
  );
}

/** Share a photo, a tip, or both. */
function Compose() {
  const { me } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy('Preparing photo…');
    try {
      setPhoto(await shrinkPhoto(file));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t use that photo.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const post = async () => {
    if (!text.trim() && !photo) return;
    setBusy('Posting…');
    try {
      await store.addPost({ authorId: me.id, authorName: me.name.replace(/\s*\(example\)/, ''), text: text.trim(), photo });
      setText('');
      setPhoto('');
      toast('Posted. Everyone on the guest list can see it.');
    } catch {
      toast('Couldn’t post. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card" aria-label="Share a photo or tip">
      <div className="title-sm">Share a photo or tip</div>
      <textarea
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Best sunset spot, a great fish fry, what the kids loved…"
        aria-label="Your tip or caption"
      />
      {photo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <img src={photo} alt="Your photo" style={{ width: '100%', borderRadius: 10 }} />
          <div className="row" style={{ gap: 14 }}>
            <button className="btn outline small" disabled={!!busy} onClick={async () => setPhoto(await rotatePhoto(photo))}>↻ Rotate</button>
            <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setPhoto('')}>Remove photo</button>
          </div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="grid-2">
        <button className="btn outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>{photo ? 'Change photo' : '+ Photo'}</button>
        <button className="btn" onClick={post} disabled={!!busy || (!text.trim() && !photo)}>{busy === 'Posting…' ? busy : 'Post'}</button>
      </div>
      {busy === 'Preparing photo…' && <div className="small muted">{busy}</div>}
    </section>
  );
}

function Post({ p, canDelete }: { p: GuestPost; canDelete: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState(false);
  const remove = async () => {
    try {
      await store.deletePost(p.id);
      toast('Post deleted.');
    } catch {
      toast('Couldn’t delete it. Try again.');
    }
  };
  return (
    <article className="card post">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="strong">{p.authorName}</span>
        <span className="small muted">{whenLabel(p.createdAt)}</span>
      </div>
      {p.photo && (
        <button className="post-photo" onClick={() => setOpen(true)} aria-label="Enlarge photo">
          <img src={p.photo} alt={p.text || `Photo from ${p.authorName}`} loading="lazy" />
        </button>
      )}
      {p.text && <p className="post-text"><LinkedText text={p.text} /></p>}
      {canDelete &&
        (confirm ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="small strong">Delete this post?</span>
            <button className="btn outline small" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={remove}>Delete</button>
          </div>
        ) : (
          <button className="link-btn" style={{ color: 'var(--red-ink)', alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setConfirm(true)}>Delete</button>
        ))}
      {open && p.photo && (
        <Viewer photos={[{ id: p.id, sectionId: 'post', caption: p.text, data: p.photo, order: 1, createdAt: p.createdAt }]} start={0} onClose={() => setOpen(false)} />
      )}
    </article>
  );
}

/** The guest posts: compose box (for people who have stayed) and the feed. */
export function BoardFeed({ owner = false }: { owner?: boolean }) {
  const { snap, me, isOwner, previewing } = useSession();
  const posts = usePosts();
  const hasStayed = isOwner || snap.bookings.some((b) => b.personId === me.id && b.status === 'approved' && b.start <= today());

  // Owners: opening their board marks everything as seen.
  useEffect(() => {
    if (!owner || !isOwner || !posts) return;
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, [owner, isOwner, posts]);

  return (
    <>
      {previewing ? (
        <div className="callout">Guest preview: posting is turned off. Switch to Owner to post.</div>
      ) : hasStayed ? (
        <Compose />
      ) : (
        <div className="callout">Once your first stay starts, you can share photos and tips here too.</div>
      )}

      {posts === null ? (
        <div className="muted">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="strong">Nothing shared yet</div>
          <div className="small muted">Photos and tips from past stays will show up here.</div>
        </div>
      ) : (
        posts.map((p) => <Post key={p.id} p={p} canDelete={!previewing && (isOwner || p.authorId === me.id)} />)
      )}
    </>
  );
}

/** Owners: the guest posts on their own page (from the Requests screen). */
export function Board() {
  return (
    <main className="screen">
      <a className="back" href={href('/owner')}>‹ Requests</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="title">Guest photos &amp; tips</h1>
        <p className="muted" style={{ margin: 0 }}>Shared by people who have stayed at Camp Daniel. Everyone on the guest list can see these.</p>
      </header>
      <BoardFeed owner />
    </main>
  );
}
