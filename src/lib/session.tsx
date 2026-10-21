import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Person, Snapshot } from '../data/types';

// Who is using the app. Until real sign-in exists, the dev bar lets you
// switch people so you can try both the guest and owner sides.

const KEY = 'camp-daniel:me';

interface Session {
  snap: Snapshot;
  me: Person;
  isOwner: boolean;
  setMe: (id: string) => void;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ snap, children }: { snap: Snapshot; children: ReactNode }) {
  const [meId, setMeId] = useState<string>(() => {
    try {
      return localStorage.getItem(KEY) || 'rick';
    } catch {
      return 'rick';
    }
  });
  const me = snap.people.find((p) => p.id === meId) ?? snap.people[0];
  const setMe = (id: string) => {
    setMeId(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
  };
  return <Ctx.Provider value={{ snap, me, isOwner: me.tier === 'owner', setMe }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
