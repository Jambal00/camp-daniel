import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Person, Snapshot } from '../data/types';

// Who is using the app. With Firebase this is the signed-in person.
// In local sample-data mode, the "Viewing as" bar switches people.

const KEY = 'camp-daniel:me';
const PREVIEW_KEY = 'camp-daniel:preview';

/** A pretend guest with no trips, for seeing the app the way a first-timer does. */
export const PREVIEW_GUEST = 'preview-guest';
const NEW_GUEST: Person = { id: PREVIEW_GUEST, name: 'A new guest', shortName: 'Guest', email: '', phone: '', tier: 'friends' };

interface Session {
  snap: Snapshot;
  me: Person;
  isOwner: boolean;
  setMe: (id: string) => void;
  /** Owner previewing the guest side: who they're seeing it as (null = not previewing). */
  previewing: Person | null;
  /** Start (person id, or PREVIEW_GUEST for a guest with no trips) or stop (null) the guest preview. */
  setPreview: (id: string | null) => void;
  /** The person's primary owner contact (the first owner with a phone). */
  host: Person | undefined;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ snap, meId, children }: { snap: Snapshot; meId: string | null; children: ReactNode }) {
  const [localId, setLocalId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || 'rick';
    } catch {
      return 'rick';
    }
  });
  const [previewId, setPreviewId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PREVIEW_KEY);
    } catch {
      return null;
    }
  });
  const id = meId ?? localId;
  const realMe = snap.people.find((p) => p.id === id) ?? snap.people[0];
  const previewing = realMe?.tier === 'owner' && previewId
    ? (previewId === PREVIEW_GUEST ? NEW_GUEST : snap.people.find((p) => p.id === previewId && p.tier !== 'owner') ?? NEW_GUEST)
    : null;
  const me = previewing ?? realMe;
  const setPreview = (next: string | null) => {
    setPreviewId(next);
    try {
      if (next) sessionStorage.setItem(PREVIEW_KEY, next);
      else sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* ignore */
    }
  };
  const owners = snap.people.filter((p) => p.tier === 'owner');
  const host = owners.find((o) => o.phone) ?? owners[0];
  const setMe = (next: string) => {
    setPreview(null);
    setLocalId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ snap, me, isOwner: me?.tier === 'owner', setMe, host, previewing, setPreview }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
