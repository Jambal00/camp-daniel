import type { Booking, CabinSettings, GuidePhoto, GuideSection, MessageTemplate, Person, Snapshot } from './types';

/**
 * The one seam between the screens and wherever data lives.
 *
 * Today: LocalStore keeps everything in this browser (sample data).
 * Later: write a SupabaseStore / FirebaseStore / D1Store that implements
 * this same interface, then switch it in src/data/index.ts. No screen
 * code changes.
 */
export interface DataStore {
  /** 'local' = sample data in this browser; 'firebase' = shared, signed-in data. */
  readonly kind: 'local' | 'firebase';
  /** Current state of everything. */
  load(): Promise<Snapshot>;
  /** Called whenever data changes (another tab, or a realtime backend). */
  subscribe(onChange: (s: Snapshot) => void): () => void;

  createBooking(input: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking>;
  updateBooking(id: string, patch: Partial<Booking>): Promise<Booking>;

  addPerson(input: Omit<Person, 'id'>): Promise<Person>;
  updatePerson(id: string, patch: Partial<Person>): Promise<Person>;

  updateGuideSection(id: string, patch: Partial<GuideSection>): Promise<GuideSection>;
  addGuideSection(input: Omit<GuideSection, 'id'>): Promise<GuideSection>;
  /** Removes the topic and its photos. */
  deleteGuideSection(id: string): Promise<void>;
  updateTemplate(id: MessageTemplate['id'], patch: Partial<MessageTemplate>): Promise<MessageTemplate>;
  updateSettings(patch: Partial<CabinSettings>): Promise<CabinSettings>;

  /** Photos for one guide section, kept live; returns a stop function. Loaded per section to keep the app light. */
  watchPhotos(sectionId: string, onChange: (photos: GuidePhoto[]) => void): () => void;
  addPhoto(input: Omit<GuidePhoto, 'id' | 'createdAt'>): Promise<GuidePhoto>;
  updatePhoto(id: string, patch: Partial<Pick<GuidePhoto, 'data' | 'caption'>>): Promise<void>;
  deletePhoto(id: string): Promise<void>;

  /** Development only: put the sample data back. */
  reset?(): Promise<void>;
}
