import { seedSnapshot } from './seed';
import type { DataStore } from './store';
import type { Booking, GroupTrip, GroupVote, GroupVoteAnswer, GuestPost, GuestQuestion, GuidePhoto, PostLike, PostPhoto, Reminder, GuideSection, Snapshot } from './types';

const KEY = 'camp-daniel:v1';
const PHOTOS_KEY = 'camp-daniel:photos';

function read(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Snapshot;
  } catch {
    /* storage blocked or corrupt: fall through to fresh sample data */
  }
  const s = seedSnapshot();
  write(s);
  return s;
}

function write(s: Snapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. Data still lives in memory for this session. */
  }
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Keeps everything in this browser's localStorage. Good for building and demos. */
export class LocalStore implements DataStore {
  readonly kind = 'local' as const;
  private state: Snapshot = read();
  private listeners = new Set<(s: Snapshot) => void>();

  constructor() {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) {
        this.state = read();
        this.emit();
      }
    });
  }

  private commit(next: Snapshot) {
    this.state = next;
    write(next);
    this.emit();
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  async load() {
    return this.state;
  }

  subscribe(fn: (s: Snapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  async createBooking(input: Parameters<DataStore['createBooking']>[0]) {
    const b = { ...input, id: uid('b'), createdAt: new Date().toISOString() };
    this.commit({ ...this.state, bookings: [...this.state.bookings, b] });
    return b;
  }

  async updateBooking(id: string, patch: Parameters<DataStore['updateBooking']>[1]) {
    let out = this.state.bookings.find((b) => b.id === id);
    if (!out) throw new Error(`No booking ${id}`);
    out = { ...out, ...patch };
    const updated = out;
    this.commit({ ...this.state, bookings: this.state.bookings.map((b) => (b.id === id ? updated : b)) });
    return updated;
  }

  // ---------- group trips ----------
  private makeHolds(trip: Pick<GroupTrip, 'id' | 'title' | 'hostId' | 'inviteeIds'>, options: { start: string; end: string }[]): Booking[] {
    const now = new Date().toISOString();
    return options.map((o) => ({
      id: uid('b'), personId: trip.hostId, start: o.start, end: o.end, partySize: trip.inviteeIds.length + 1,
      names: `Held for ${trip.title}`, note: '', status: 'tentative', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now,
      bookedByOwner: true, groupTripId: trip.id,
    }));
  }

  async createGroupTrip(input: Parameters<DataStore['createGroupTrip']>[0]) {
    const id = uid('gt');
    const now = new Date().toISOString();
    const host = this.state.people.find((p) => p.id === input.hostId);
    // Kids' plans wait for Pete & Trisha's OK before dates are held or invites go out.
    const proposed = host?.tier !== 'owner';
    const holds = proposed ? [] : this.makeHolds({ ...input, id }, input.options);
    const members = Object.fromEntries(
      [input.hostId, ...input.inviteeIds].map((pid) => {
        const p = this.state.people.find((x) => x.id === pid);
        return [pid, { name: p?.shortName ?? 'Someone', phone: p?.phone ?? '' }];
      }),
    );
    const trip: GroupTrip = {
      ...input, id, members, options: input.options.map((o, i) => ({ ...o, holdId: holds[i]?.id })), status: proposed ? 'proposed' : 'voting', createdAt: now,
    };
    this.commit({ ...this.state, bookings: [...this.state.bookings, ...holds], groupTrips: [...(this.state.groupTrips ?? []), trip] });
    return trip;
  }

  async approveGroupTrip(id: string) {
    const trip = (this.state.groupTrips ?? []).find((t) => t.id === id);
    if (!trip || trip.status !== 'proposed') return;
    const holds = this.makeHolds(trip, trip.options);
    this.commit({
      ...this.state,
      bookings: [...this.state.bookings, ...holds],
      groupTrips: (this.state.groupTrips ?? []).map((t) => (t.id === id ? { ...t, status: 'voting', options: t.options.map((o, i) => ({ ...o, holdId: holds[i].id })) } : t)),
    });
  }

  async declineGroupTrip(id: string) {
    this.commit({ ...this.state, groupTrips: (this.state.groupTrips ?? []).map((t) => (t.id === id ? { ...t, status: 'declined' } : t)) });
  }

  async updateGroupTrip(id: string, patch: Parameters<DataStore['updateGroupTrip']>[1]) {
    const trips = (this.state.groupTrips ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t));
    const title = patch.title;
    const bookings = title ? this.state.bookings.map((b) => (b.groupTripId === id && (b.status === 'blocked' || b.status === 'tentative') ? { ...b, names: `Held for ${title}` } : b)) : this.state.bookings;
    this.commit({ ...this.state, groupTrips: trips, bookings });
  }

  async lockGroupTrip(id: string, index: number, crew: string[]) {
    const trip = (this.state.groupTrips ?? []).find((t) => t.id === id);
    if (!trip) throw new Error('No such group trip');
    const keep = trip.options[index];
    const now = new Date().toISOString();
    let stay: Booking | undefined;
    const bookings = this.state.bookings
      .filter((b) => !(b.groupTripId === id && (b.status === 'blocked' || b.status === 'tentative') && b.id !== keep.holdId))
      .map((b) => {
        if (b.id !== keep.holdId) return b;
        stay = { ...b, status: 'approved', personId: trip.hostId, names: trip.title, partySize: crew.length + 1, crew, welcomeNote: trip.note, decidedAt: now };
        return stay;
      });
    if (!stay) throw new Error('That date hold is gone');
    const locked = stay;
    this.commit({
      ...this.state,
      bookings,
      groupTrips: (this.state.groupTrips ?? []).map((t) => (t.id === id ? { ...t, status: 'locked', lockedIndex: index, bookingId: locked.id } : t)),
    });
    return locked;
  }

  async cancelGroupTrip(id: string) {
    this.commit({
      ...this.state,
      bookings: this.state.bookings.filter((b) => !(b.groupTripId === id && (b.status === 'blocked' || b.status === 'tentative'))),
      groupTrips: (this.state.groupTrips ?? []).map((t) => (t.id === id ? { ...t, status: 'cancelled' } : t)),
    });
  }

  async voteGroupTrip(tripId: string, personId: string, answers: GroupVoteAnswer[], comment: string) {
    const id = `${tripId}__${personId}`;
    const trip = (this.state.groupTrips ?? []).find((t) => t.id === tripId);
    const v: GroupVote = { id, tripId, personId, inviteeIds: trip?.inviteeIds, hostId: trip?.hostId, answers, comment, updatedAt: new Date().toISOString() };
    this.commit({ ...this.state, groupVotes: [...(this.state.groupVotes ?? []).filter((x) => x.id !== id), v] });
  }

  async addPerson(input: Parameters<DataStore['addPerson']>[0]) {
    const p = { ...input, id: uid('p') };
    this.commit({ ...this.state, people: [...this.state.people, p] });
    return p;
  }

  async updatePerson(id: string, patch: Parameters<DataStore['updatePerson']>[1]) {
    const cur = this.state.people.find((p) => p.id === id);
    if (!cur) throw new Error(`No person ${id}`);
    const next = { ...cur, ...patch };
    this.commit({ ...this.state, people: this.state.people.map((p) => (p.id === id ? next : p)) });
    return next;
  }

  async deletePerson(id: string) {
    this.commit({ ...this.state, people: this.state.people.filter((p) => p.id !== id) });
  }

  async updateGuideSection(id: string, patch: Parameters<DataStore['updateGuideSection']>[1]) {
    const cur = this.state.guide.find((g) => g.id === id);
    if (!cur) throw new Error(`No guide section ${id}`);
    const next = { ...cur, ...patch };
    this.commit({ ...this.state, guide: this.state.guide.map((g) => (g.id === id ? next : g)) });
    return next;
  }

  async addGuideSection(input: Omit<GuideSection, 'id'>) {
    const g = { ...input, id: uid('g') };
    this.commit({ ...this.state, guide: [...this.state.guide, g] });
    return g;
  }

  async deleteGuideSection(id: string) {
    this.commit({ ...this.state, guide: this.state.guide.filter((g) => g.id !== id) });
    this.photos = this.photos.filter((p) => p.sectionId !== id);
    this.savePhotos();
  }

  async updateTemplate(id: Parameters<DataStore['updateTemplate']>[0], patch: Parameters<DataStore['updateTemplate']>[1]) {
    const cur = this.state.templates.find((t) => t.id === id);
    if (!cur) throw new Error(`No template ${id}`);
    const next = { ...cur, ...patch };
    this.commit({ ...this.state, templates: this.state.templates.map((t) => (t.id === id ? next : t)) });
    return next;
  }

  async updateSettings(patch: Parameters<DataStore['updateSettings']>[0]) {
    const next = { ...this.state.settings, ...patch };
    this.commit({ ...this.state, settings: next });
    return next;
  }

  // ---------- photos (kept separately; browsers allow only a few MB here) ----------
  private photos: GuidePhoto[] = (() => {
    try {
      return JSON.parse(localStorage.getItem(PHOTOS_KEY) || '[]') as GuidePhoto[];
    } catch {
      return [];
    }
  })();
  private photoListeners = new Set<() => void>();

  private savePhotos() {
    try {
      localStorage.setItem(PHOTOS_KEY, JSON.stringify(this.photos));
    } catch {
      /* over the browser's storage limit: photos still show until reload */
    }
    this.photoListeners.forEach((fn) => fn());
  }

  watchPhotos(sectionId: string, onChange: (photos: GuidePhoto[]) => void) {
    const send = () => onChange(this.photos.filter((p) => p.sectionId === sectionId).sort((a, b) => a.order - b.order));
    send();
    this.photoListeners.add(send);
    return () => {
      this.photoListeners.delete(send);
    };
  }

  async addPhoto(input: Omit<GuidePhoto, 'id' | 'createdAt'>) {
    const p = { ...input, id: uid('ph'), createdAt: new Date().toISOString() };
    this.photos = [...this.photos, p];
    this.savePhotos();
    return p;
  }

  async updatePhoto(id: string, { thumb: _thumb, ...patch }: Partial<Pick<GuidePhoto, 'data' | 'caption' | 'order'>> & { thumb?: string }) {
    void _thumb;
    this.photos = this.photos.map((p) => (p.id === id ? { ...p, ...patch } : p));
    this.savePhotos();
  }

  async getFullPhoto(col: 'photos' | 'postPhotos', id: string) {
    const hit = col === 'photos' ? this.photos.find((p) => p.id === id) : this.postPhotos.find((p) => p.id === id);
    if (!hit) throw new Error('Photo not found');
    return hit.data;
  }

  async deletePhoto(id: string) {
    this.photos = this.photos.filter((p) => p.id !== id);
    this.savePhotos();
  }

  // ---------- guest photos & tips ----------
  private posts: GuestPost[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('camp-daniel:posts') || '[]') as GuestPost[];
    } catch {
      return [];
    }
  })();
  private postListeners = new Set<() => void>();

  private savePosts() {
    try {
      localStorage.setItem('camp-daniel:posts', JSON.stringify(this.posts));
    } catch {
      /* over the browser's storage limit */
    }
    this.postListeners.forEach((fn) => fn());
  }

  watchPosts(onChange: (posts: GuestPost[]) => void, since?: string) {
    const send = () =>
      onChange([...this.posts].filter((p) => !since || p.createdAt > since).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60));
    send();
    this.postListeners.add(send);
    return () => {
      this.postListeners.delete(send);
    };
  }

  private postPhotos: PostPhoto[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('camp-daniel:post-photos') || '[]') as PostPhoto[];
    } catch {
      return [];
    }
  })();

  private savePostPhotos() {
    try {
      localStorage.setItem('camp-daniel:post-photos', JSON.stringify(this.postPhotos));
    } catch {
      /* over the browser's storage limit */
    }
    this.postListeners.forEach((fn) => fn());
  }

  async addPost(input: Omit<GuestPost, 'id' | 'createdAt' | 'photoCount'>, photos: string[] = []) {
    const p: GuestPost = { ...input, photoCount: photos.length, id: uid('post'), createdAt: new Date().toISOString() };
    this.posts = [...this.posts, p];
    this.postPhotos = [...this.postPhotos, ...photos.map((data, i) => ({ id: uid('pp'), postId: p.id, authorId: p.authorId, data, order: i + 1 }))];
    this.savePostPhotos();
    this.savePosts();
    return p;
  }

  async editPost(id: string, text: string) {
    this.posts = this.posts.map((p) => (p.id === id ? { ...p, text, editedAt: new Date().toISOString() } : p));
    this.savePosts();
  }

  async deletePost(id: string) {
    this.posts = this.posts.filter((p) => p.id !== id);
    this.postPhotos = this.postPhotos.filter((x) => x.postId !== id);
    this.likes = this.likes.filter((l) => l.postId !== id);
    try {
      localStorage.setItem('camp-daniel:likes', JSON.stringify(this.likes));
    } catch {
      /* ignore */
    }
    this.savePostPhotos();
    this.savePosts();
  }

  watchPostPhotos(postId: string, onChange: (photos: PostPhoto[]) => void) {
    const send = () => onChange(this.postPhotos.filter((x) => x.postId === postId).sort((a, b) => a.order - b.order));
    send();
    this.postListeners.add(send);
    return () => {
      this.postListeners.delete(send);
    };
  }

  // ---------- likes on guest posts ----------
  private likes: PostLike[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('camp-daniel:likes') || '[]') as PostLike[];
    } catch {
      return [];
    }
  })();

  watchLikes(onChange: (likes: PostLike[]) => void) {
    const send = () => onChange([...this.likes]);
    send();
    this.postListeners.add(send);
    return () => {
      this.postListeners.delete(send);
    };
  }

  async setLike(postId: string, person: { id: string; name: string }, liked: boolean) {
    const id = `${postId}__${person.id}`;
    this.likes = this.likes.filter((l) => l.id !== id);
    if (liked) this.likes.push({ id, postId, personId: person.id, name: person.name, createdAt: new Date().toISOString() });
    try {
      localStorage.setItem('camp-daniel:likes', JSON.stringify(this.likes));
    } catch {
      /* ignore */
    }
    this.postListeners.forEach((fn) => fn());
  }

  // ---------- questions for the owners ----------
  private questions: GuestQuestion[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('camp-daniel:questions') || '[]') as GuestQuestion[];
    } catch {
      return [];
    }
  })();
  private questionListeners = new Set<() => void>();

  private saveQuestions() {
    try {
      localStorage.setItem('camp-daniel:questions', JSON.stringify(this.questions));
    } catch {
      /* ignore */
    }
    this.questionListeners.forEach((fn) => fn());
  }

  watchQuestions(onChange: (qs: GuestQuestion[]) => void, askerId?: string) {
    const send = () =>
      onChange(this.questions.filter((q) => !askerId || q.askerId === askerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    send();
    this.questionListeners.add(send);
    return () => {
      this.questionListeners.delete(send);
    };
  }

  async addQuestion(input: Pick<GuestQuestion, 'askerId' | 'askerName' | 'text'>) {
    const q = { ...input, id: uid('q'), answer: '', answeredAt: '', createdAt: new Date().toISOString() };
    this.questions = [...this.questions, q];
    this.saveQuestions();
    return q;
  }

  async answerQuestion(id: string, answer: string) {
    this.questions = this.questions.map((q) => (q.id === id ? { ...q, answer, answeredAt: answer ? new Date().toISOString() : '' } : q));
    this.saveQuestions();
  }

  async deleteQuestion(id: string) {
    this.questions = this.questions.filter((q) => q.id !== id);
    this.saveQuestions();
  }

  // ---------- reminders (demo: pretend the invite was emailed) ----------
  private reminders: Reminder[] = (() => {
    try {
      return JSON.parse(localStorage.getItem('camp-daniel:reminders') || '[]') as Reminder[];
    } catch {
      return [];
    }
  })();
  private reminderListeners = new Set<() => void>();

  private saveReminders() {
    try {
      localStorage.setItem('camp-daniel:reminders', JSON.stringify(this.reminders));
    } catch {
      /* ignore */
    }
    this.reminderListeners.forEach((fn) => fn());
  }

  watchReminders(personId: string, onChange: (rs: Reminder[]) => void) {
    const send = () => onChange(this.reminders.filter((r) => r.personId === personId).sort((a, b) => a.remindOn.localeCompare(b.remindOn)));
    send();
    this.reminderListeners.add(send);
    return () => {
      this.reminderListeners.delete(send);
    };
  }

  async addReminder(input: Pick<Reminder, 'personId' | 'email' | 'name' | 'remindOn'>) {
    const r: Reminder = { ...input, id: uid('rem'), status: 'queued', createdAt: new Date().toISOString() };
    this.reminders = [...this.reminders, r];
    this.saveReminders();
    window.setTimeout(() => {
      this.reminders = this.reminders.map((x): Reminder => (x.id === r.id ? { ...x, status: 'sent', sentAt: new Date().toISOString() } : x));
      this.saveReminders();
    }, 900);
    return r;
  }

  async deleteReminder(id: string) {
    this.reminders = this.reminders.filter((r) => r.id !== id);
    this.saveReminders();
  }

  async reset() {
    this.commit(seedSnapshot());
  }
}
