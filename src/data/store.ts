import type { Booking, CabinSettings, GuideSection, MessageTemplate, Person, Snapshot } from './types';

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
  updateTemplate(id: MessageTemplate['id'], patch: Partial<MessageTemplate>): Promise<MessageTemplate>;
  updateSettings(patch: Partial<CabinSettings>): Promise<CabinSettings>;

  /** Development only: put the sample data back. */
  reset?(): Promise<void>;
}
