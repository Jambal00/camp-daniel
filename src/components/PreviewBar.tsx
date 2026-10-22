import { go, useRoute } from '../lib/router';
import { PREVIEW_GUEST, useSession } from '../lib/session';

const LAST_KEY = 'camp-daniel:preview-last';

function lastGuest() {
  try {
    return localStorage.getItem(LAST_KEY) || PREVIEW_GUEST;
  } catch {
    return PREVIEW_GUEST;
  }
}

/** Owners only: one-tap switch between the owner side and the guest side, plus who you're seeing it as. */
export function ViewSwitch() {
  const { snap, previewing, setPreview, isOwner } = useSession();
  const { path } = useRoute();
  if (!isOwner && !previewing) return null;
  const guests = snap.people.filter((p) => p.tier !== 'owner');

  const toGuest = () => {
    if (previewing) return;
    setPreview(lastGuest());
    // Land on the matching guest page when there is one.
    go(path[1] === 'guide' ? (path[2] ? `/guide/${path[2]}` : '/guide') : '/');
  };
  const toOwner = () => {
    if (!previewing) return;
    setPreview(null);
    go(path[0] === 'guide' ? (path[1] ? `/owner/guide/${path[1]}` : '/owner/guide') : '/owner');
  };
  const pick = (id: string) => {
    setPreview(id);
    try {
      localStorage.setItem(LAST_KEY, id);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`viewswitch${previewing ? ' guest' : ''}`} role="region" aria-label="Switch views">
      <div className="seg" role="group" aria-label="View">
        <button type="button" aria-pressed={!previewing} onClick={toOwner}>Owner</button>
        <button type="button" aria-pressed={!!previewing} onClick={toGuest}>Guest</button>
      </div>
      {previewing && (
        <select aria-label="Seeing it as" value={previewing.id} onChange={(e) => pick(e.target.value)}>
          <option value={PREVIEW_GUEST}>As a new guest</option>
          {guests.map((p) => <option key={p.id} value={p.id}>As {p.name}</option>)}
        </select>
      )}
    </div>
  );
}
