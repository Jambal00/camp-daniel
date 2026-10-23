import { seedSnapshot } from './seed';
import type { DataStore } from './store';
import type { GuidePhoto, GuideSection, Snapshot } from './types';

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

  async updatePhoto(id: string, patch: Partial<Pick<GuidePhoto, 'data' | 'caption'>>) {
    this.photos = this.photos.map((p) => (p.id === id ? { ...p, ...patch } : p));
    this.savePhotos();
  }

  async deletePhoto(id: string) {
    this.photos = this.photos.filter((p) => p.id !== id);
    this.savePhotos();
  }

  async reset() {
    this.commit(seedSnapshot());
  }
}
