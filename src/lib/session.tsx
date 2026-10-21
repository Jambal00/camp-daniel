import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Person, Snapshot } from '../data/types';

// Who is using the app. With Firebase this is the signed-in person.
// In local sample-data mode, the "Viewing as" bar switches people.

const KEY = 'camp-daniel:me';

interface Session {
  snap: Snapshot;
  me: Person;
  isOwner: boolean;
  setMe: (id: string) => void;
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
  const id = meId ?? localId;
  const me = snap.people.find((p) => p.id === id) ?? snap.people[0];
  const owners = snap.people.filter((p) => p.tier === 'owner');
  const host = owners.find((o) => o.phone) ?? owners[0];
  const setMe = (next: string) => {
    setLocalId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ snap, me, isOwner: me?.tier === 'owner', setMe, host }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
