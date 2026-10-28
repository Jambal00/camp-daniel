import { useEffect, useRef, useState } from 'react';
import { LinkedText } from '../../components/LinkedText';
import { Viewer } from '../../components/Photos';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GuestPost, PostLike, PostPhoto } from '../../data/types';
import { fmtRange, today } from '../../lib/dates';
import { rotatePhoto, shrinkPhoto } from '../../lib/image';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

const SEEN_KEY = 'camp-daniel:posts-seen';
const MAX_PHOTOS = 5;

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

function usePostPhotos(postId: string | null): PostPhoto[] {
  const [photos, setPhotos] = useState<PostPhoto[]>([]);
  useEffect(() => (postId ? store.watchPostPhotos(postId, setPhotos) : undefined), [postId]);
  return photos;
}

function useLikes(): Map<string, PostLike[]> {
  const [likes, setLikes] = useState<PostLike[]>([]);
  useEffect(() => store.watchLikes(setLikes), []);
  const byPost = new Map<string, PostLike[]>();
  for (const l of [...likes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    byPost.set(l.postId, [...(byPost.get(l.postId) ?? []), l]);
  }
  return byPost;
}

function firstName(name: string) {
  return name.replace(/\s*\(example\)/, '').split(/\s+/)[0] || name;
}

/** "You, Thad and 2 others" */
function likedBy(likes: PostLike[], meId: string) {
  const names = [...likes.filter((l) => l.personId === meId).map(() => 'You'), ...likes.filter((l) => l.personId !== meId).map((l) => firstName(l.name))];
  if (names.length <= 3) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} others`;
}

function LikeButton({ postId, likes }: { postId: string; likes: PostLike[] }) {
  const { me, previewing } = useSession();
  const mine = likes.some((l) => l.personId === me.id);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      return;
    }
    setBusy(true);
    try {
      await store.setLike(postId, { id: me.id, name: me.name.replace(/\s*\(example\)/, '') }, !mine);
    } catch {
      toast('Couldn’t save that. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="like-row">
      <button className={`like-btn${mine ? ' on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={mine} aria-label={mine ? 'Unlike' : 'Like'}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill={mine ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20.5s-7.5-4.6-9.2-9.1C1.6 8.2 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.6 3.7 4.4 6.9-1.7 4.5-9.2 9.1-9.2 9.1z" />
        </svg>
        {likes.length > 0 && <span className="num">{likes.length}</span>}
      </button>
      {likes.length > 0 && <span className="small muted like-names">{likedBy(likes, me.id)}</span>}
    </div>
  );
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
function Compose({ stay, onClearStay }: { stay: string; onClearStay: () => void }) {
  const { me, previewing } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos per post. Added the first ${room}.`);
    const added: string[] = [];
    try {
      for (const [i, f] of list.entries()) {
        setBusy(list.length > 1 ? `Preparing photo ${i + 1} of ${list.length}…` : 'Preparing photo…');
        added.push(await shrinkPhoto(f));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t use that photo.');
    } finally {
      setPhotos((cur) => [...cur, ...added].slice(0, MAX_PHOTOS));
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const turn = async (i: number) => {
    const next = await rotatePhoto(photos[i]);
    setPhotos((cur) => cur.map((x, k) => (k === i ? next : x)));
  };

  const post = async () => {
    if (!text.trim() && photos.length === 0) return;
    if (previewing) {
      toast('Guest preview: nothing was posted.');
      return;
    }
    setBusy('Posting…');
    try {
      await store.addPost({ authorId: me.id, authorName: me.name.replace(/\s*\(example\)/, ''), text: text.trim(), photo: '', stay }, photos);
      setText('');
      setPhotos([]);
      toast('Posted. Everyone on the guest list can see it.');
    } catch {
      toast('Couldn’t post. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card" aria-label="Share a photo or tip">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="title-sm">Share a photo or tip</div>
        {previewing && <span className="chip orange">Preview only</span>}
      </div>
      {stay && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="chip blue">From your {stay} stay</span>
          <button className="link-btn quiet" style={{ minHeight: 32 }} onClick={onClearStay} aria-label="Don't tie this to a stay">Not from a stay</button>
        </div>
      )}
      <textarea
        className="input"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Best sunset spot, a great fish fry, what the kids loved…"
        aria-label="Your tip or caption"
      />
      {photos.length > 0 && (
        <div className="compose-photos">
          {photos.map((ph, i) => (
            <div key={i} className="compose-photo">
              <img src={ph} alt={`Your photo ${i + 1}`} />
              <div className="compose-photo-btns">
                <button type="button" onClick={() => turn(i)} disabled={!!busy} aria-label={`Rotate photo ${i + 1}`}>↻</button>
                <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, k) => k !== i))} aria-label={`Remove photo ${i + 1}`}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      <div className="grid-2">
        <button className="btn outline" onClick={() => fileRef.current?.click()} disabled={!!busy || photos.length >= MAX_PHOTOS}>
          {photos.length === 0 ? '+ Photos' : photos.length >= MAX_PHOTOS ? `${MAX_PHOTOS} photos max` : '+ More photos'}
        </button>
        <button className="btn" onClick={post} disabled={!!busy || (!text.trim() && photos.length === 0)}>{busy === 'Posting…' ? busy : 'Post'}</button>
      </div>
      <div className="small muted">{busy && busy !== 'Posting…' ? busy : `Up to ${MAX_PHOTOS} photos per post${photos.length ? ` · ${photos.length} added` : ''}. You can pick several at once.`}</div>
    </section>
  );
}

function Post({ p, canDelete, likes }: { p: GuestPost; canDelete: boolean; likes: PostLike[] }) {
  const { previewing } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const extra = usePostPhotos(p.photoCount ? p.id : null);
  const all = [...(p.photo ? [p.photo] : []), ...extra.map((x) => x.data)];
  const remove = async () => {
    if (previewing) {
      toast('Guest preview: nothing was deleted.');
      setConfirm(false);
      return;
    }
    try {
      await store.deletePost(p.id);
      toast('Post deleted.');
    } catch {
      toast('Couldn’t delete it. Try again.');
    }
  };
  const hasPhotos = !!p.photo || !!p.photoCount;
  const save = async () => {
    const text = draft.trim();
    if (text === p.text) {
      setEditing(false);
      return;
    }
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await store.editPost(p.id, text);
      setEditing(false);
      toast('Post updated.');
    } catch {
      toast('Couldn’t save that. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <article className="card post">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="meta"><span className="strong">{p.authorName}</span>{p.stay && <span className="small muted">{p.stay} stay</span>}</span>
        <span className="small muted">{whenLabel(p.createdAt)}{p.editedAt ? ' · Edited' : ''}</span>
      </div>
      {all.length === 1 && (
        <button className="post-photo" onClick={() => setOpen(0)} aria-label="Enlarge photo">
          <img src={all[0]} alt={p.text || `Photo from ${p.authorName}`} loading="lazy" />
        </button>
      )}
      {all.length > 1 && (
        <div className={`post-grid n${Math.min(all.length, 5)}`}>
          {all.map((src, i) => (
            <button key={i} className="post-tile" onClick={() => setOpen(i)} aria-label={`Enlarge photo ${i + 1} of ${all.length}`}>
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {!!p.photoCount && extra.length < p.photoCount && all.length === 0 && <div className="small muted">Loading photos…</div>}
      {editing ? (
        <div className="post-edit">
          <textarea className="input" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} aria-label="Edit your tip or caption" autoFocus />
          <div className="grid-2">
            <button className="btn outline" onClick={() => { setDraft(p.text); setEditing(false); }} disabled={saving}>Cancel</button>
            <button className="btn" onClick={save} disabled={saving || (!draft.trim() && !hasPhotos)}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        p.text && <p className="post-text"><LinkedText text={p.text} /></p>
      )}
      {editing ? null : confirm ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="small strong">Delete this post?</span>
          <button className="btn outline small" onClick={() => setConfirm(false)}>Keep</button>
          <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={remove}>Delete</button>
        </div>
      ) : (
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <LikeButton postId={p.id} likes={likes} />
          {canDelete && (
            <span className="row" style={{ gap: 16, flexShrink: 0 }}>
              <button className="link-btn" style={{ minHeight: 40 }} onClick={() => { setDraft(p.text); setEditing(true); }}>Edit</button>
              <button className="link-btn" style={{ color: 'var(--red-ink)', minHeight: 40 }} onClick={() => setConfirm(true)}>Delete</button>
            </span>
          )}
        </div>
      )}
      {open !== null && all[open] && (
        <Viewer photos={all.map((data, i) => ({ id: `${p.id}-${i}`, sectionId: 'post', caption: i === 0 ? p.text : '', data, order: i + 1, createdAt: p.createdAt }))} start={open} onClose={() => setOpen(null)} />
      )}
    </article>
  );
}

/** The guest posts: compose box (for people who have stayed) and the feed. */
export function BoardFeed({ owner = false, stayId }: { owner?: boolean; stayId?: string | null }) {
  const { snap, me, isOwner } = useSession();
  const stayBooking = stayId ? snap.bookings.find((b) => b.id === stayId && b.personId === me.id) : undefined;
  const [stay, setStay] = useState(stayBooking ? fmtRange(stayBooking.start, stayBooking.end) : '');
  const posts = usePosts();
  const likes = useLikes();
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
      {hasStayed ? (
        <Compose stay={stay} onClearStay={() => setStay('')} />
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
        posts.map((p) => <Post key={p.id} p={p} canDelete={isOwner || p.authorId === me.id} likes={likes.get(p.id) ?? []} />)
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
