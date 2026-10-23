import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { fromISO } from '../lib/dates';
import { db } from './firebase';
import { GUIDE, LOCAL_FAVORITES, LOCAL_FAVORITES_V1 } from './guide';
import { seedSnapshot } from './seed';
import type { DataStore } from './store';
import type { Booking, CabinSettings, GuidePhoto, GuideSection, MessageTemplate, Person, Snapshot, Visit } from './types';

/*
  Firestore layout (see firestore.rules for who can read what):

  people/{email}        name, shortName, email, phone, tier
  visits/{email}        firstSeen, lastSeen (written by each person on sign-in; owners read)
  bookings/{id}         a stay or request; guests read only their own
  busy/{id}             {start, end} of every approved or blocked stay, so
                        guests see "Booked" without seeing who
  access/{id}           door code + Wi-Fi for one stay; readable by that guest
                        only from noon on arrival day to the end of departure day
  guide/{sectionId}     cabin guide sections
  templates/{id}        message templates
  photos/{id}           guide photos {sectionId, caption, data, order}
  settings/cabin        address, directions, Wi-Fi network, goal, season
  secrets/cabin         Wi-Fi password (owners only)
*/

const OTHER = '__other__';

function isDenied(e: unknown) {
  return (e as { code?: string })?.code === 'permission-denied';
}

/** Fail with a readable message instead of waiting forever. */
function withTimeout<T>(p: Promise<T>, step: string, ms = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`Firebase didn't answer while ${step}. Check your connection and tap Reload.`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        const code = (e as { code?: string })?.code;
        reject(code && code !== 'permission-denied' ? Object.assign(new Error(`Firebase error while ${step}: ${code}`), { code }) : e);
      },
    );
  });
}

type Parts = {
  people: Person[];
  self: Person | null;
  bookings: Booking[];
  busy: { id: string; start: string; end: string }[];
  access: Record<string, { doorCode: string; wifiNetwork: string; wifiPassword: string }>;
  guide: GuideSection[];
  templates: MessageTemplate[];
  settings: CabinSettings | null;
  wifiPassword: string;
  visits: Record<string, Visit>;
};

export type StartResult = 'ready' | 'not-invited' | 'not-set-up';

function noonOn(iso: string) {
  const d = fromISO(iso);
  d.setHours(12, 0, 0, 0);
  return Timestamp.fromDate(d);
}
function endOf(iso: string) {
  const d = fromISO(iso);
  d.setHours(23, 59, 59, 0);
  return Timestamp.fromDate(d);
}

export class FirebaseStore implements DataStore {
  readonly kind = 'firebase' as const;
  private parts: Parts = {
    people: [], self: null, bookings: [], busy: [], access: {}, guide: [], templates: [], settings: null, wifiPassword: '', visits: {},
  };
  private listeners = new Set<(s: Snapshot) => void>();
  private unsubs: Unsubscribe[] = [];
  private accessTimer?: number;
  isOwner = false;

  constructor(readonly email: string, private readonly displayName: string | null) {}

  /** Work out who this is, set up the cabin on an owner's first visit, and start listening. */
  async start(): Promise<StartResult> {
    // Owners are whoever the security rules let read the owners-only secrets doc.
    try {
      await withTimeout(getDoc(doc(db, 'secrets', 'cabin')), 'checking whether you are an owner');
      this.isOwner = true;
    } catch (e) {
      if (!isDenied(e)) throw e;
      this.isOwner = false;
    }

    if (this.isOwner) {
      await withTimeout(this.ensureOwnerSetup(), 'setting up the cabin');
    } else {
      try {
        const me = await withTimeout(getDoc(doc(db, 'people', this.email)), 'checking the guest list');
        if (!me.exists()) return 'not-invited';
      } catch (e) {
        if (isDenied(e)) return 'not-invited';
        throw e;
      }
      const settings = await withTimeout(getDoc(doc(db, 'settings', 'cabin')), 'loading cabin settings');
      if (!settings.exists()) return 'not-set-up';
    }

    this.listen();
    void this.recordVisit();
    // Phones keep the app open in the background; count coming back to it as a visit too (at most hourly).
    this.onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastStamp > 60 * 60 * 1000) void this.recordVisit();
    };
    document.addEventListener('visibilitychange', this.onVisible);
    await withTimeout(
      new Promise<void>((resolve) => {
        const check = () => (this.parts.settings ? resolve() : window.setTimeout(check, 50));
        check();
      }),
      'loading the calendar',
    );
    return 'ready';
  }

  /** Note that this person opened the app, so owners can see who has signed in. Never blocks loading. */
  private lastStamp = 0;
  private onVisible?: () => void;

  private async recordVisit() {
    this.lastStamp = Date.now();
    const ref = doc(db, 'visits', this.email);
    const now = new Date().toISOString();
    try {
      const cur = await getDoc(ref);
      await setDoc(ref, { firstSeen: (cur.data()?.firstSeen as string | undefined) ?? now, lastSeen: now });
    } catch (e) {
      console.warn('Camp Daniel visit', e);
    }
  }

  stop() {
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    window.clearInterval(this.accessTimer);
  }

  private async ensureOwnerSetup() {
    const settingsRef = doc(db, 'settings', 'cabin');
    const existing = await getDoc(settingsRef);
    const batch = writeBatch(db);
    if (!existing.exists()) {
      const seed = seedSnapshot();
      const { wifiPassword: _pw, ...publicSettings } = seed.settings;
      void _pw;
      batch.set(settingsRef, publicSettings);
      batch.set(doc(db, 'secrets', 'cabin'), { wifiPassword: '' });
      GUIDE.forEach((g) => batch.set(doc(db, 'guide', g.id), g));
      seed.templates.forEach((t) => batch.set(doc(db, 'templates', t.id), t));
    } else {
      // One-time upgrade: add map links to Local favorites, but only if the
      // section still has the original text (never overwrite an owner's edits).
      const localRef = doc(db, 'guide', 'local');
      const local = await getDoc(localRef);
      const body = local.exists() ? (local.data() as GuideSection).body : undefined;
      if (body && JSON.stringify(body) === JSON.stringify(LOCAL_FAVORITES_V1)) {
        batch.set(localRef, { body: LOCAL_FAVORITES }, { merge: true });
      }
    }
    const meRef = doc(db, 'people', this.email);
    const me = await getDoc(meRef);
    if (!me.exists()) {
      const first = (this.displayName || this.email.split('@')[0]).split(/\s+/)[0];
      const name = first.charAt(0).toUpperCase() + first.slice(1);
      batch.set(meRef, { name, shortName: name, email: this.email, phone: '', tier: 'owner' });
    }
    await batch.commit();
  }

  private listen() {
    const warn = (err: unknown) => console.warn('Camp Daniel listener', err);
    const onList = <T>(q: Query<DocumentData>, set: (v: T[]) => void, after?: () => void) => {
      this.unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            set(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T));
            after?.();
            this.emit();
          },
          warn,
        ),
      );
    };

    // Everyone
    this.unsubs.push(
      onSnapshot(
        doc(db, 'settings', 'cabin'),
        (d) => {
          this.parts.settings = d.exists() ? (d.data() as CabinSettings) : null;
          this.emit();
        },
        warn,
      ),
    );
    onList<GuideSection>(collection(db, 'guide'), (v) => (this.parts.guide = v));
    onList<MessageTemplate>(collection(db, 'templates'), (v) => (this.parts.templates = v));

    if (this.isOwner) {
      onList<Person>(collection(db, 'people'), (v) => (this.parts.people = v));
      onList<Booking>(collection(db, 'bookings'), (v) => (this.parts.bookings = v));
      onList<Visit & { id: string }>(collection(db, 'visits'), (v) => {
        this.parts.visits = Object.fromEntries(v.map(({ id, firstSeen, lastSeen }) => [id, { firstSeen, lastSeen }]));
      });
      onList<{ id: string; doorCode: string; wifiNetwork: string; wifiPassword: string }>(collection(db, 'access'), (v) => {
        this.parts.access = Object.fromEntries(v.map((a) => [a.id, a]));
      });
      this.unsubs.push(
        onSnapshot(
          doc(db, 'secrets', 'cabin'),
          (d) => {
            this.parts.wifiPassword = (d.data()?.wifiPassword as string | undefined) ?? '';
            this.emit();
          },
          warn,
        ),
      );
    } else {
      onList<Person>(query(collection(db, 'people'), where('tier', '==', 'owner')), (v) => (this.parts.people = v));
      this.unsubs.push(
        onSnapshot(
          doc(db, 'people', this.email),
          (d) => {
            this.parts.self = d.exists() ? ({ ...(d.data() as Person), id: d.id }) : null;
            this.emit();
          },
          warn,
        ),
      );
      onList<Booking>(
        query(collection(db, 'bookings'), where('personId', '==', this.email)),
        (v) => (this.parts.bookings = v),
        () => void this.refreshAccess(),
      );
      onList<{ id: string; start: string; end: string }>(collection(db, 'busy'), (v) => (this.parts.busy = v));
      // Door codes unlock at noon on arrival day; check again every few minutes.
      this.accessTimer = window.setInterval(() => void this.refreshAccess(), 5 * 60 * 1000);
    }
  }

  /** Guests: try to read the door code / Wi-Fi for stays that are in their window. */
  private async refreshAccess() {
    const now = new Date();
    for (const b of this.parts.bookings) {
      if (b.status !== 'approved' || this.parts.access[b.id]) continue;
      const from = noonOn(b.start).toDate();
      const until = endOf(b.end).toDate();
      if (now < from || now > until) continue;
      try {
        const a = await getDoc(doc(db, 'access', b.id));
        if (a.exists()) {
          this.parts.access[b.id] = a.data() as { doorCode: string; wifiNetwork: string; wifiPassword: string };
          this.emit();
        }
      } catch {
        /* not yet readable */
      }
    }
  }

  private snapshot(): Snapshot {
    const p = this.parts;
    const settings: CabinSettings = { ...(p.settings ?? seedSnapshot().settings), wifiPassword: p.wifiPassword };
    const withAccess = (b: Booking): Booking => ({ ...b, doorCode: p.access[b.id]?.doorCode ?? '' });
    if (this.isOwner) {
      return { people: p.people, visits: p.visits, bookings: p.bookings.map(withAccess), guide: p.guide, templates: p.templates, settings };
    }
    // Guests: their own stays, plus other stays as anonymous "booked" ranges.
    const mine = new Set(p.bookings.map((b) => b.id));
    const others: Booking[] = p.busy
      .filter((x) => !mine.has(x.id))
      .map((x) => ({ id: x.id, personId: OTHER, start: x.start, end: x.end, partySize: 0, names: '', note: '', status: 'approved', welcomeNote: '', doorCode: '', createdAt: '' }));
    const current = p.bookings.find((b) => p.access[b.id]);
    const a = current ? p.access[current.id] : undefined;
    const people = [...p.people, ...(p.self && !p.people.some((x) => x.id === p.self!.id) ? [p.self] : [])];
    return {
      people,
      bookings: [...p.bookings.map(withAccess), ...others],
      guide: p.guide,
      templates: p.templates,
      settings: { ...settings, wifiNetwork: a?.wifiNetwork || settings.wifiNetwork, wifiPassword: a?.wifiPassword ?? '' },
    };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((fn) => fn(s));
  }

  async load() {
    return this.snapshot();
  }

  subscribe(fn: (s: Snapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  // ---------- bookings ----------

  /** Keep busy/ and access/ in step with a booking (owners only). */
  private async syncSideDocs(b: Booking) {
    const holds = b.status === 'approved' || b.status === 'blocked';
    if (holds) await setDoc(doc(db, 'busy', b.id), { start: b.start, end: b.end });
    else await deleteDoc(doc(db, 'busy', b.id)).catch(() => undefined);

    if (b.status === 'approved') {
      const s = this.parts.settings;
      await setDoc(doc(db, 'access', b.id), {
        email: b.personId,
        doorCode: b.doorCode ?? '',
        wifiNetwork: s?.wifiNetwork ?? '',
        wifiPassword: this.parts.wifiPassword,
        from: noonOn(b.start),
        until: endOf(b.end),
      });
    } else {
      await deleteDoc(doc(db, 'access', b.id)).catch(() => undefined);
    }
  }

  async createBooking(input: Omit<Booking, 'id' | 'createdAt'>) {
    const ref = doc(collection(db, 'bookings'));
    const b: Booking = { ...input, id: ref.id, createdAt: new Date().toISOString() };
    const { id: _id, doorCode, ...stored } = b;
    void _id;
    await setDoc(ref, { ...stored, doorCode: '' });
    if (this.isOwner) await this.syncSideDocs({ ...b, doorCode });
    return b;
  }

  async updateBooking(id: string, patch: Partial<Booking>) {
    if (!this.isOwner) {
      // Guests can only leave a departure note.
      await updateDoc(doc(db, 'bookings', id), { departureNote: patch.departureNote ?? '' });
      const cur = this.parts.bookings.find((b) => b.id === id)!;
      return { ...cur, ...patch };
    }
    const cur = this.parts.bookings.find((b) => b.id === id);
    if (!cur) throw new Error(`No booking ${id}`);
    const next: Booking = { ...cur, doorCode: this.parts.access[id]?.doorCode ?? '', ...patch };
    const { id: _id, doorCode: _code, ...stored } = next;
    void _id;
    void _code;
    await setDoc(doc(db, 'bookings', id), { ...stored, doorCode: '' });
    await this.syncSideDocs(next);
    return next;
  }

  // ---------- people ----------

  async addPerson(input: Omit<Person, 'id'>) {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error('An email address is needed so they can sign in.');
    const p: Person = { ...input, email, id: email };
    const { id: _id, ...stored } = p;
    void _id;
    await setDoc(doc(db, 'people', email), stored);
    return p;
  }

  async updatePerson(id: string, patch: Partial<Person>) {
    const { id: _id, email: _email, ...rest } = patch;
    void _id;
    void _email;
    await updateDoc(doc(db, 'people', id), rest);
    const cur = this.parts.people.find((p) => p.id === id);
    return { ...(cur as Person), ...rest };
  }

  // ---------- guide, templates, settings ----------

  async updateGuideSection(id: string, patch: Partial<GuideSection>) {
    await setDoc(doc(db, 'guide', id), patch, { merge: true });
    return { ...(this.parts.guide.find((g) => g.id === id) as GuideSection), ...patch };
  }

  async addGuideSection(input: Omit<GuideSection, 'id'>) {
    const ref = doc(collection(db, 'guide'));
    await setDoc(ref, input);
    return { ...input, id: ref.id };
  }

  async deleteGuideSection(id: string) {
    const photos = await getDocs(query(collection(db, 'photos'), where('sectionId', '==', id)));
    const batch = writeBatch(db);
    photos.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'guide', id));
    await batch.commit();
  }

  async updateTemplate(id: MessageTemplate['id'], patch: Partial<MessageTemplate>) {
    await setDoc(doc(db, 'templates', id), patch, { merge: true });
    return { ...(this.parts.templates.find((t) => t.id === id) as MessageTemplate), ...patch };
  }

  async updateSettings(patch: Partial<CabinSettings>) {
    const { wifiPassword, ...rest } = patch;
    if (Object.keys(rest).length) await setDoc(doc(db, 'settings', 'cabin'), rest, { merge: true });
    if (wifiPassword !== undefined) {
      await setDoc(doc(db, 'secrets', 'cabin'), { wifiPassword }, { merge: true });
      this.parts.wifiPassword = wifiPassword;
    }
    if (wifiPassword !== undefined || rest.wifiNetwork !== undefined) {
      if (rest.wifiNetwork !== undefined && this.parts.settings) this.parts.settings = { ...this.parts.settings, wifiNetwork: rest.wifiNetwork };
      // Refresh Wi-Fi on every upcoming approved stay.
      const today = new Date().toISOString().slice(0, 10);
      for (const b of this.parts.bookings) {
        if (b.status === 'approved' && b.end >= today) await this.syncSideDocs({ ...b, doorCode: this.parts.access[b.id]?.doorCode ?? '' });
      }
    }
    return { ...this.snapshot().settings, ...patch };
  }

  // ---------- photos ----------

  watchPhotos(sectionId: string, onChange: (photos: GuidePhoto[]) => void) {
    return onSnapshot(
      query(collection(db, 'photos'), where('sectionId', '==', sectionId)),
      (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as GuidePhoto), id: d.id })).sort((a, b) => a.order - b.order)),
      (err) => console.warn('Camp Daniel photos', err),
    );
  }

  async addPhoto(input: Omit<GuidePhoto, 'id' | 'createdAt'>) {
    const ref = doc(collection(db, 'photos'));
    const p: GuidePhoto = { ...input, id: ref.id, createdAt: new Date().toISOString() };
    const { id: _id, ...stored } = p;
    void _id;
    await setDoc(ref, stored);
    return p;
  }

  async updatePhoto(id: string, patch: Partial<Pick<GuidePhoto, 'data' | 'caption'>>) {
    await updateDoc(doc(db, 'photos', id), patch);
  }

  async deletePhoto(id: string) {
    await deleteDoc(doc(db, 'photos', id));
  }

}
