import { useEffect, useState } from 'react';
import { LocalStore } from './localStore';
import type { DataStore } from './store';
import type { Snapshot } from './types';

// Which backend to use:
//   npm run dev        → Firebase (real sign-in, shared data)
//   npm run dev:demo  → sample data kept in this browser, with the "Viewing as" bar
export const MODE: 'local' | 'firebase' = import.meta.env.VITE_DATA === 'local' ? 'local' : 'firebase';

let current: DataStore | null = MODE === 'local' ? new LocalStore() : null;

function backend(): DataStore {
  if (!current) throw new Error('Not signed in yet');
  return current;
}

/** The active backend. Screens call store.createBooking(...) etc. without caring which one it is. */
export const store: DataStore = {
  get kind() {
    return MODE;
  },
  load: () => backend().load(),
  subscribe: (fn) => backend().subscribe(fn),
  createBooking: (i) => backend().createBooking(i),
  updateBooking: (id, p) => backend().updateBooking(id, p),
  addPerson: (i) => backend().addPerson(i),
  updatePerson: (id, p) => backend().updatePerson(id, p),
  deletePerson: (id) => backend().deletePerson(id),
  updateGuideSection: (id, p) => backend().updateGuideSection(id, p),
  addGuideSection: (i) => backend().addGuideSection(i),
  deleteGuideSection: (id) => backend().deleteGuideSection(id),
  updateTemplate: (id, p) => backend().updateTemplate(id, p),
  updateSettings: (p) => backend().updateSettings(p),
  watchPhotos: (id, cb) => backend().watchPhotos(id, cb),
  addPhoto: (i) => backend().addPhoto(i),
  updatePhoto: (id, p) => backend().updatePhoto(id, p),
  deletePhoto: (id) => backend().deletePhoto(id),
  watchPosts: (cb, since) => backend().watchPosts(cb, since),
  addPost: (i, ph) => backend().addPost(i, ph),
  watchPostPhotos: (id, cb) => backend().watchPostPhotos(id, cb),
  watchLikes: (cb) => backend().watchLikes(cb),
  setLike: (postId, person, liked) => backend().setLike(postId, person, liked),
  deletePost: (id) => backend().deletePost(id),
  watchQuestions: (cb, asker) => backend().watchQuestions(cb, asker),
  addQuestion: (i) => backend().addQuestion(i),
  answerQuestion: (id, a) => backend().answerQuestion(id, a),
  deleteQuestion: (id) => backend().deleteQuestion(id),
  watchReminders: (pid, cb) => backend().watchReminders(pid, cb),
  addReminder: (i) => backend().addReminder(i),
  deleteReminder: (id) => backend().deleteReminder(id),
  reset: () => backend().reset?.() ?? Promise.resolve(),
};

export type DataState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'not-invited'; email: string }
  | { status: 'not-set-up'; email: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; snap: Snapshot; meId: string | null };

/** Sign-in state plus a live snapshot of all data the signed-in person may see. */
export function useData(): DataState {
  const [state, setState] = useState<DataState>({ status: 'loading' });

  useEffect(() => {
    if (MODE === 'local') {
      const s = current!;
      s.load().then((snap) => setState({ status: 'ready', snap, meId: null }));
      return s.subscribe((snap) => setState({ status: 'ready', snap, meId: null }));
    }

    let stopStore: (() => void) | undefined;
    let stopAuth: (() => void) | undefined;
    let alive = true;

    (async () => {
      let mods;
      try {
        mods = await Promise.all([import('./firebase'), import('./firebaseStore')]);
      } catch {
        // Usually a stale copy of the app after an update: reloading fetches the new one.
        if (alive) setState({ status: 'error', message: 'Camp Daniel was just updated. Tap Reload to get the new version.' });
        return;
      }
      const [{ watchSignIn }, { FirebaseStore }] = mods;
      stopAuth = watchSignIn(async (email, name) => {
        stopStore?.();
        stopStore = undefined;
        current = null;
        if (!alive) return;
        if (!email) {
          setState({ status: 'signed-out' });
          return;
        }
        setState({ status: 'loading' });
        const fs = new FirebaseStore(email, name);
        try {
          const result = await fs.start();
          if (!alive) return;
          if (result !== 'ready') {
            fs.stop();
            setState({ status: result, email });
            return;
          }
          current = fs;
          const off = fs.subscribe((snap) => setState({ status: 'ready', snap, meId: email }));
          stopStore = () => {
            off();
            fs.stop();
          };
          setState({ status: 'ready', snap: await fs.load(), meId: email });
        } catch (e) {
          const code = (e as { code?: string })?.code;
          const message =
            code === 'permission-denied'
              ? 'Firebase said no (permission denied). The security rules may not be published yet.'
              : e instanceof Error
                ? e.message
                : String(e);
          if (alive) setState({ status: 'error', message });
        }
      });
    })();

    return () => {
      alive = false;
      stopAuth?.();
      stopStore?.();
    };
  }, []);

  return state;
}

export * from './types';
