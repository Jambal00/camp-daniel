import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { GUIDE } from './guide';
import { seedSnapshot } from './seed';
import type { DataStore } from './store';
import type { Booking, CabinSettings, GuideSection, MessageTemplate, Person, Snapshot } from './types';

/*
  Firestore layout (see firestore.rules for who can read what):

  people/{email}        name, shortName, email, phone, tier
  bookings/{id}         a stay or request; guests read only their own
  busy/{id}             {start, end} of every approved or blocked stay, so
                        guests see "Booked" without seeing who
  access/{id}           door code + Wi-Fi for one stay; readable by that guest
                        only from noon on arrival day to the end of departure day
  guide/{sectionId}     cabin guide sections
  templates/{id}        message templates
  settings/cabin        address, directions, Wi-Fi network, goal, season
  secrets/cabin         Wi-Fi password (owners only)
*/

const OTHER = '__other__';

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
    people: [], self: null, bookings: [], busy: [], access: {}, guide: [], templates: [], settings: null, wifiPassword: '',
  };
  private listeners = new Set<(s: Snapshot) => void>();
  private unsubs: Unsubscribe[] = [];
  private accessTimer?: number;
  isOwner = false;

  constructor(readonly email: string, private readonly displayName: string | null) {}

  /** Work out who this is, set up the cabin on an owner's first visit, and start listening. */
  async start(): Promise<StartResult> {
    // Owners are whoever the security rules allow to write owner-only data.
    // We find out by trying to read the owners-only secrets doc.
    try {
      await getDoc(doc(db, 'secrets', 'cabin'));
      this.isOwner = true;
    } catch {
      this.isOwner = false;
    }

    if (this.isOwner) {
      await this.ensureOwnerSetup();
    } else {
      let me;
      try {
        me = await getDoc(doc(db, 'people', this.email));
      } catch {
        return 'not-invited';
      }
      if (!me.exists()) return 'not-invited';
      const settings = await getDoc(doc(db, 'settings', 'cabin')).catch(() => null);
      if (!settings?.exists()) return 'not-set-up';
    }

    this.listen();
    await new Promise<void>((resolve) => {
      const check = () => (this.parts.settings ? resolve() : window.setTimeout(check, 50));
      check();
    });
    return 'ready';
  }

  stop() {
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
      return { people: p.people, bookings: p.bookings.map(withAccess), guide: p.guide, templates: p.templates, settings };
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
}
