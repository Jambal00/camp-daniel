import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
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
import { shrinkPhoto } from '../lib/image';
import { db } from './firebase';
import { GUIDE, LOCAL_FAVORITES, LOCAL_FAVORITES_V1 } from './guide';
import { seedSnapshot } from './seed';
import type { DataStore } from './store';
import type { Booking, CabinSettings, GroupTrip, GroupVote, GroupVoteAnswer, GuestPost, GuestQuestion, PostLike, PostPhoto, Reminder, GuidePhoto, GuideSection, MessageTemplate, Person, Snapshot, Visit } from './types';

/** photoThumbs/{id}: the small copy galleries show. */
interface ThumbDoc {
  kind?: 'guide' | 'post';
  sectionId?: string;
  postId?: string;
  authorId?: string;
  caption?: string;
  order?: number;
  thumb?: string;
}

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
  reminders/{id}        'Remind me later': a server function emails a calendar invite (and a cancel on delete)
  questions/{id}        a guest's question + the owners' answer (asker and owners read)
  postPhotos/{id}       one photo in a guest post {postId, authorId, data, order}
  photoThumbs/{id}      ~480px gallery copy of photos/{id} or postPhotos/{id}, made by the server
  likes/{postId__email} one person's like on a guest post {postId, personId, name, createdAt}
  posts/{id}            guest photos & tips (author writes their own; everyone invited reads)
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
  /** Guests: group-trip stays they're on as crew. */
  crewBookings: Booking[];
  groupTrips: GroupTrip[];
  groupVotes: GroupVote[];
  /** Kids: trips they host, votes on them, and the friends they've added. */
  hostTrips: GroupTrip[];
  hostVotes: GroupVote[];
  added: Person[];
  busy: { id: string; start: string; end: string; tentative?: boolean }[];
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
    people: [], self: null, bookings: [], crewBookings: [], groupTrips: [], groupVotes: [], hostTrips: [], hostVotes: [], added: [], busy: [], access: {}, guide: [], templates: [], settings: null, wifiPassword: '', visits: {},
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
      onList<GroupTrip>(collection(db, 'groupTrips'), (v) => (this.parts.groupTrips = v));
      onList<GroupVote>(collection(db, 'groupVotes'), (v) => (this.parts.groupVotes = v));
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
      onList<Booking>(
        query(collection(db, 'bookings'), where('crew', 'array-contains', this.email)),
        (v) => (this.parts.crewBookings = v),
        () => void this.refreshAccess(),
      );
      onList<GroupTrip>(query(collection(db, 'groupTrips'), where('inviteeIds', 'array-contains', this.email)), (v) => (this.parts.groupTrips = v));
      onList<GroupVote>(query(collection(db, 'groupVotes'), where('inviteeIds', 'array-contains', this.email)), (v) => (this.parts.groupVotes = v));
      // The kids can run their own group trips (if the rules allow it; harmless otherwise).
      onList<GroupTrip>(query(collection(db, 'groupTrips'), where('hostId', '==', this.email)), (v) => (this.parts.hostTrips = v));
      onList<GroupVote>(query(collection(db, 'groupVotes'), where('hostId', '==', this.email)), (v) => (this.parts.hostVotes = v));
      onList<Person>(query(collection(db, 'people'), where('addedBy', '==', this.email)), (v) => (this.parts.added = v));
      onList<{ id: string; start: string; end: string; tentative?: boolean }>(collection(db, 'busy'), (v) => (this.parts.busy = v));
      // Door codes unlock at noon on arrival day; check again every few minutes.
      this.accessTimer = window.setInterval(() => void this.refreshAccess(), 5 * 60 * 1000);
    }
  }

  /** Guests: try to read the door code / Wi-Fi for stays that are in their window. */
  private async refreshAccess() {
    const now = new Date();
    for (const b of [...this.parts.bookings, ...this.parts.crewBookings]) {
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
      return { people: p.people, visits: p.visits, bookings: p.bookings.map(withAccess), groupTrips: p.groupTrips, groupVotes: p.groupVotes, guide: p.guide, templates: p.templates, settings };
    }
    // Guests: their own stays, plus other stays as anonymous "booked" ranges.
    const own = [...p.bookings, ...p.crewBookings.filter((c) => !p.bookings.some((b) => b.id === c.id))];
    const mine = new Set(own.map((b) => b.id));
    const others: Booking[] = p.busy
      .filter((x) => !mine.has(x.id))
      .map((x) => ({ id: x.id, personId: OTHER, start: x.start, end: x.end, partySize: 0, names: '', note: '', status: x.tentative ? 'tentative' : 'approved', welcomeNote: '', doorCode: '', createdAt: '' }));
    const current = own.find((b) => p.access[b.id]);
    const a = current ? p.access[current.id] : undefined;
    const people = [...p.people, ...(p.self && !p.people.some((x) => x.id === p.self!.id) ? [p.self] : []), ...p.added.filter((a) => !p.people.some((x) => x.id === a.id))];
    const byId = <T extends { id: string }>(a: T[], b: T[]) => [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
    return {
      people,
      bookings: [...own.map(withAccess), ...others],
      groupTrips: byId(p.groupTrips, p.hostTrips),
      groupVotes: byId(p.groupVotes, p.hostVotes),
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
    else if (b.status === 'tentative') await setDoc(doc(db, 'busy', b.id), { start: b.start, end: b.end, tentative: true });
    else await deleteDoc(doc(db, 'busy', b.id)).catch(() => undefined);

    if (b.status === 'approved') {
      const s = this.parts.settings;
      await setDoc(doc(db, 'access', b.id), {
        email: b.personId,
        crew: b.crew ?? [],
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

  // ---------- group trips (owners create, lock and call off; invitees vote) ----------

  async createGroupTrip(input: Parameters<DataStore['createGroupTrip']>[0]) {
    const ref = doc(collection(db, 'groupTrips'));
    const now = new Date().toISOString();
    // Kids' plans wait for an owner's OK: no date holds yet.
    const holds: Booking[] = [];
    for (const o of this.isOwner ? input.options : []) {
      holds.push(
        await this.createBooking({
          personId: input.hostId, start: o.start, end: o.end, partySize: input.inviteeIds.length + 1, names: `Held for ${input.title}`, note: '',
          status: 'tentative', welcomeNote: '', doorCode: '', decidedAt: now, bookedByOwner: true, groupTripId: ref.id,
        }),
      );
    }
    const members = Object.fromEntries(
      [input.hostId, ...input.inviteeIds].map((pid) => {
        const p = this.parts.people.find((x) => x.id === pid);
        return [pid, { name: p?.shortName ?? 'Someone', phone: p?.phone ?? '' }];
      }),
    );
    const trip: GroupTrip = {
      ...input, id: ref.id, members, createdAt: now,
      options: input.options.map((o, i) => (holds[i] ? { ...o, holdId: holds[i].id } : { ...o })),
      status: this.isOwner ? 'voting' : 'proposed',
    };
    const { id: _id, ...stored } = trip;
    void _id;
    await setDoc(ref, stored);
    return trip;
  }

  async updateGroupTrip(id: string, patch: Parameters<DataStore['updateGroupTrip']>[1]) {
    await updateDoc(doc(db, 'groupTrips', id), patch as DocumentData);
  }

  private async dropHold(bookingId: string) {
    await deleteDoc(doc(db, 'busy', bookingId)).catch(() => undefined);
    await deleteDoc(doc(db, 'bookings', bookingId)).catch(() => undefined);
  }

  async approveGroupTrip(id: string) {
    const trip = this.parts.groupTrips.find((t) => t.id === id);
    if (!trip || trip.status !== 'proposed') throw new Error('That plan isn’t waiting for an OK anymore.');
    const now = new Date().toISOString();
    const options = [];
    for (const o of trip.options) {
      const h = await this.createBooking({
        personId: trip.hostId, start: o.start, end: o.end, partySize: trip.inviteeIds.length + 1, names: `Held for ${trip.title}`, note: '',
        status: 'tentative', welcomeNote: '', doorCode: '', decidedAt: now, bookedByOwner: true, groupTripId: trip.id,
      });
      options.push({ ...o, holdId: h.id });
    }
    await updateDoc(doc(db, 'groupTrips', id), { options, status: 'voting' });
  }

  async declineGroupTrip(id: string) {
    await updateDoc(doc(db, 'groupTrips', id), { status: 'declined' });
  }

  async lockGroupTrip(id: string, index: number, crew: string[]) {
    if (!this.isOwner) {
      // A kid host: the server books it (guests can't write stays or door-code records).
      await updateDoc(doc(db, 'groupTrips', id), { lockRequest: { index, crew } });
      return this.parts.bookings[0] as Booking;
    }
    const trip = this.parts.groupTrips.find((t) => t.id === id);
    if (!trip) throw new Error('That group trip isn’t here anymore.');
    const keep = trip.options[index];
    if (!keep.holdId) throw new Error('That date hold is gone.');
    const stay = await this.updateBooking(keep.holdId, {
      status: 'approved', names: trip.title, partySize: crew.length + 1, crew, welcomeNote: trip.note, decidedAt: new Date().toISOString(),
    });
    for (const o of trip.options) if (o.holdId && o.holdId !== keep.holdId) await this.dropHold(o.holdId);
    await updateDoc(doc(db, 'groupTrips', id), { status: 'locked', lockedIndex: index, bookingId: keep.holdId });
    return stay;
  }

  async cancelGroupTrip(id: string) {
    if (!this.isOwner) {
      await updateDoc(doc(db, 'groupTrips', id), { status: 'cancelled' });
      return;
    }
    const trip = this.parts.groupTrips.find((t) => t.id === id);
    for (const o of trip?.options ?? []) if (o.holdId) await this.dropHold(o.holdId);
    await updateDoc(doc(db, 'groupTrips', id), { status: 'cancelled' });
  }

  async voteGroupTrip(tripId: string, personId: string, answers: GroupVoteAnswer[], comment: string) {
    const trip = this.parts.groupTrips.find((t) => t.id === tripId);
    if (!trip) throw new Error('That invite isn’t here anymore.');
    await setDoc(doc(db, 'groupVotes', `${tripId}__${personId}`), {
      tripId, personId, inviteeIds: trip.inviteeIds, hostId: trip.hostId, answers, comment, updatedAt: new Date().toISOString(),
    });
  }

  async updateBooking(id: string, patch: Partial<Booking>) {
    if (!this.isOwner) {
      // Guests: departure note; change a pending request; update who's coming; or cancel.
      // The security rules decide which of these each booking allows.
      const allowed = ['departureNote', 'start', 'end', 'partySize', 'names', 'note', 'status', 'cancelledAt'] as const;
      const p: Record<string, unknown> = {};
      for (const k of allowed) if (k in patch) p[k] = patch[k];
      await updateDoc(doc(db, 'bookings', id), p as DocumentData);
      const cur = this.parts.bookings.find((b) => b.id === id)!;
      if (patch.status === 'cancelled' && cur.status === 'approved') {
        // Free the dates for everyone and drop the door code record.
        await deleteDoc(doc(db, 'busy', id)).catch((e) => console.warn('Camp Daniel busy', e));
        await deleteDoc(doc(db, 'access', id)).catch((e) => console.warn('Camp Daniel access', e));
      }
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
    try {
      await setDoc(doc(db, 'people', email), stored);
    } catch (e) {
      // The kids can only add new people; someone already on the list can still be invited.
      if (!this.isOwner) return p;
      throw e;
    }
    return p;
  }

  async deletePerson(id: string) {
    await deleteDoc(doc(db, 'people', id));
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

  /** Galleries list the small copies in photoThumbs; the full photo loads on tap (getFullPhoto). */
  watchPhotos(sectionId: string, onChange: (photos: GuidePhoto[]) => void) {
    return onSnapshot(
      query(collection(db, 'photoThumbs'), where('sectionId', '==', sectionId)),
      (snap) =>
        onChange(
          snap.docs
            .map((d) => ({ d: d.data() as ThumbDoc, id: d.id }))
            .filter(({ d }) => !!d.thumb)
            .map(({ d, id }) => ({ id, sectionId: d.sectionId ?? sectionId, caption: d.caption ?? '', data: d.thumb!, order: d.order ?? 0, createdAt: '', thumbOf: 'photos' as const }))
            .sort((a, b) => a.order - b.order),
        ),
      (err) => console.warn('Camp Daniel photos', err),
    );
  }

  async getFullPhoto(col: 'photos' | 'postPhotos', id: string) {
    const snap = await getDoc(doc(db, col, id));
    const data = (snap.data() as { data?: string } | undefined)?.data;
    if (!data) throw new Error('Photo not found');
    return data;
  }

  async addPhoto(input: Omit<GuidePhoto, 'id' | 'createdAt'>) {
    const ref = doc(collection(db, 'photos'));
    const p: GuidePhoto = { ...input, id: ref.id, createdAt: new Date().toISOString() };
    const { id: _id, ...stored } = p;
    void _id;
    await setDoc(ref, stored);
    // The server makes the gallery copy too; doing it here as well means the owner sees it at once.
    try {
      const thumb = await shrinkPhoto(await (await fetch(input.data)).blob(), 480, 120_000);
      await setDoc(doc(db, 'photoThumbs', ref.id), { kind: 'guide', sectionId: input.sectionId, caption: input.caption, order: input.order, thumb }, { merge: true });
    } catch (e) {
      console.warn('Camp Daniel thumbnail (the server will make it)', e);
    }
    return p;
  }

  async updatePhoto(id: string, { thumb, ...patch }: Partial<Pick<GuidePhoto, 'data' | 'caption' | 'order'>> & { thumb?: string }) {
    await updateDoc(doc(db, 'photos', id), patch);
    // Keep the gallery copy in step right away (the server also does this).
    const t: Record<string, unknown> = {};
    if (patch.caption !== undefined) t.caption = patch.caption;
    if (patch.order !== undefined) t.order = patch.order;
    if (thumb) t.thumb = thumb;
    if (Object.keys(t).length) await setDoc(doc(db, 'photoThumbs', id), t, { merge: true }).catch((e) => console.warn('Camp Daniel thumbnail', e));
  }

  async deletePhoto(id: string) {
    await deleteDoc(doc(db, 'photos', id));
    await deleteDoc(doc(db, 'photoThumbs', id)).catch(() => undefined);
  }

  watchPosts(onChange: (posts: GuestPost[]) => void, since?: string) {
    const q = since
      ? query(collection(db, 'posts'), where('createdAt', '>', since), orderBy('createdAt', 'desc'), limit(60))
      : query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(60));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as GuestPost), id: d.id }))),
      (err) => console.warn('Camp Daniel posts', err),
    );
  }

  async addPost(input: Omit<GuestPost, 'id' | 'createdAt' | 'photoCount'>, photos: string[] = []) {
    const ref = doc(collection(db, 'posts'));
    const stored = { ...input, photoCount: photos.length, createdAt: new Date().toISOString() };
    await setDoc(ref, stored);
    // Each photo is its own record (a post record can't hold several full-size photos).
    for (const [i, data] of photos.entries()) {
      await setDoc(doc(collection(db, 'postPhotos')), { postId: ref.id, authorId: input.authorId, data, order: i + 1 });
    }
    return { ...stored, id: ref.id };
  }

  async editPost(id: string, text: string) {
    await updateDoc(doc(db, 'posts', id), { text, editedAt: new Date().toISOString() });
  }

  async deletePost(id: string) {
    const photos = await getDocs(query(collection(db, 'postPhotos'), where('postId', '==', id)));
    for (const d of photos.docs) await deleteDoc(d.ref);
    await deleteDoc(doc(db, 'posts', id));
  }

  watchLikes(onChange: (likes: PostLike[]) => void) {
    return onSnapshot(
      collection(db, 'likes'),
      (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as PostLike), id: d.id }))),
      (err) => console.warn('Camp Daniel likes', err),
    );
  }

  async setLike(postId: string, person: { id: string; name: string }, liked: boolean) {
    const ref = doc(db, 'likes', `${postId}__${person.id}`);
    if (liked) await setDoc(ref, { postId, personId: person.id, name: person.name, createdAt: new Date().toISOString() });
    else await deleteDoc(ref);
  }

  watchPostPhotos(postId: string, onChange: (photos: PostPhoto[]) => void) {
    return onSnapshot(
      query(collection(db, 'photoThumbs'), where('postId', '==', postId)),
      (snap) =>
        onChange(
          snap.docs
            .map((d) => ({ d: d.data() as ThumbDoc, id: d.id }))
            .filter(({ d }) => !!d.thumb)
            .map(({ d, id }) => ({ id, postId, authorId: d.authorId ?? '', data: d.thumb!, order: d.order ?? 0, thumbOf: 'postPhotos' as const }))
            .sort((a, b) => a.order - b.order),
        ),
      (err) => console.warn('Camp Daniel post photos', err),
    );
  }

  watchQuestions(onChange: (qs: GuestQuestion[]) => void, askerId?: string) {
    const q = askerId
      ? query(collection(db, 'questions'), where('askerId', '==', askerId))
      : query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as GuestQuestion), id: d.id })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      (err) => console.warn('Camp Daniel questions', err),
    );
  }

  async addQuestion(input: Pick<GuestQuestion, 'askerId' | 'askerName' | 'text'>) {
    const ref = doc(collection(db, 'questions'));
    const stored = { ...input, answer: '', answeredAt: '', createdAt: new Date().toISOString() };
    await setDoc(ref, stored);
    return { ...stored, id: ref.id };
  }

  async answerQuestion(id: string, answer: string) {
    await updateDoc(doc(db, 'questions', id), { answer, answeredAt: answer ? new Date().toISOString() : '' });
  }

  async deleteQuestion(id: string) {
    await deleteDoc(doc(db, 'questions', id));
  }

  watchReminders(personId: string, onChange: (rs: Reminder[]) => void) {
    return onSnapshot(
      query(collection(db, 'reminders'), where('personId', '==', personId)),
      (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as Reminder), id: d.id })).sort((a, b) => a.remindOn.localeCompare(b.remindOn))),
      (err) => console.warn('Camp Daniel reminders', err),
    );
  }

  async addReminder(input: Pick<Reminder, 'personId' | 'email' | 'name' | 'remindOn'>) {
    const ref = doc(collection(db, 'reminders'));
    const stored = { ...input, status: 'queued' as const, createdAt: new Date().toISOString() };
    await setDoc(ref, stored);
    return { ...stored, id: ref.id };
  }

  async deleteReminder(id: string) {
    await deleteDoc(doc(db, 'reminders', id));
  }

}
