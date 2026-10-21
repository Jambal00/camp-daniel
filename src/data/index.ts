import { useEffect, useState } from 'react';
import { LocalStore } from './localStore';
import type { DataStore } from './store';
import type { Snapshot } from './types';

// Swap this line when a real backend is ready, e.g. `new SupabaseStore(url, key)`.
export const store: DataStore = new LocalStore();

/** Live snapshot of all data; re-renders whenever anything changes. */
export function useSnapshot(): Snapshot | null {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    store.load().then((s) => alive && setSnap(s));
    const off = store.subscribe((s) => setSnap(s));
    return () => {
      alive = false;
      off();
    };
  }, []);
  return snap;
}

export * from './types';
