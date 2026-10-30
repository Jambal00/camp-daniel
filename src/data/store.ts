import type { Booking, CabinSettings, GuestPost, GuestQuestion, PostLike, PostPhoto, Reminder, GuidePhoto, GuideSection, MessageTemplate, Person, Snapshot } from './types';

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
  /** Takes someone off the guest list; they can no longer sign in. */
  deletePerson(id: string): Promise<void>;

  updateGuideSection(id: string, patch: Partial<GuideSection>): Promise<GuideSection>;
  addGuideSection(input: Omit<GuideSection, 'id'>): Promise<GuideSection>;
  /** Removes the topic and its photos. */
  deleteGuideSection(id: string): Promise<void>;
  updateTemplate(id: MessageTemplate['id'], patch: Partial<MessageTemplate>): Promise<MessageTemplate>;
  updateSettings(patch: Partial<CabinSettings>): Promise<CabinSettings>;

  /** Photos for one guide section, kept live; returns a stop function. Loaded per section to keep the app light. */
  watchPhotos(sectionId: string, onChange: (photos: GuidePhoto[]) => void): () => void;
  addPhoto(input: Omit<GuidePhoto, 'id' | 'createdAt'>): Promise<GuidePhoto>;
  /** `thumb` (owners) updates the gallery copy right away, e.g. after a rotate. */
  updatePhoto(id: string, patch: Partial<Pick<GuidePhoto, 'data' | 'caption' | 'order'>> & { thumb?: string }): Promise<void>;
  /** The full-size photo behind a gallery thumbnail. */
  getFullPhoto(col: 'photos' | 'postPhotos', id: string): Promise<string>;
  deletePhoto(id: string): Promise<void>;

  /** Guest photos & tips, newest first (most recent 60, or only those after `since`). Returns a stop function. */
  watchPosts(onChange: (posts: GuestPost[]) => void, since?: string): () => void;
  /** Saves the post, then each photo (shrunk JPEG data URLs) linked to it. */
  addPost(input: Omit<GuestPost, 'id' | 'createdAt' | 'photoCount'>, photos?: string[]): Promise<GuestPost>;
  /** Removes the post and its photos. */
  deletePost(id: string): Promise<void>;
  /** Fix the words on a post (author or owner). */
  editPost(id: string, text: string): Promise<void>;
  watchPostPhotos(postId: string, onChange: (photos: PostPhoto[]) => void): () => void;
  /** Every like on guest posts (small: one doc per person per post). */
  watchLikes(onChange: (likes: PostLike[]) => void): () => void;
  /** Like or unlike a post as this person. */
  setLike(postId: string, person: { id: string; name: string }, liked: boolean): Promise<void>;

  /** Questions for the owners, newest first: one person's own, or everyone's (owners). */
  watchQuestions(onChange: (qs: GuestQuestion[]) => void, askerId?: string): () => void;
  addQuestion(input: Pick<GuestQuestion, 'askerId' | 'askerName' | 'text'>): Promise<GuestQuestion>;
  answerQuestion(id: string, answer: string): Promise<void>;
  deleteQuestion(id: string): Promise<void>;

  /** One person's "Remind me later" reminders. Saving one emails a calendar invite (server side). */
  watchReminders(personId: string, onChange: (rs: Reminder[]) => void): () => void;
  addReminder(input: Pick<Reminder, 'personId' | 'email' | 'name' | 'remindOn'>): Promise<Reminder>;
  /** Deleting a sent reminder emails a cancellation. */
  deleteReminder(id: string): Promise<void>;

  /** Development only: put the sample data back. */
  reset?(): Promise<void>;
}
