// Shared data shapes. Every backend (local sample data today, Supabase or
// another service later) reads and writes exactly these.

export type Tier = 'owner' | 'kids' | 'friends';

export const TIER_LABEL: Record<Tier, string> = {
  owner: 'Us',
  kids: 'Kids',
  friends: 'Friends & family',
};

/** Dibs order: lower number gets priority when requests compete. */
export const TIER_RANK: Record<Tier, number> = { owner: 0, kids: 1, friends: 2 };

export interface Person {
  id: string;
  name: string;
  shortName: string;
  email: string;
  phone: string;
  tier: Tier;
}

export type BookingStatus = 'pending' | 'approved' | 'declined' | 'blocked' | 'cancelled';

export interface Booking {
  id: string;
  personId: string;
  /** Arrival date, YYYY-MM-DD. */
  start: string;
  /** Departure date, YYYY-MM-DD. Nights run from start up to (not including) end. */
  end: string;
  partySize: number;
  names: string;
  note: string;
  status: BookingStatus;
  welcomeNote: string;
  doorCode: string;
  createdAt: string;
  decidedAt?: string;
  /** Set when an owner booked or blocked the dates on someone's behalf. */
  bookedByOwner?: boolean;
  /** Message the guest left when heading out. */
  departureNote?: string;
  /** Day (YYYY-MM-DD) an owner told the neighbors about this stay. */
  neighborsToldOn?: string;
  /** When the guest cancelled it. */
  cancelledAt?: string;
  /** For a change-of-dates request: the approved stay it would replace. */
  replaces?: string;
}

export type GuideGroup = 'arrive' | 'stay' | 'leave';
export type Season = 'winter' | 'spring' | 'summer' | 'fall';
export type AmenityStatus = 'ready' | 'out' | 'stored' | 'info';

export interface GuideSection {
  id: string;
  group: GuideGroup;
  title: string;
  summary: string;
  body: string[];
  checklist?: string[];
  status: AmenityStatus;
  statusNote?: string;
  /** Seasons when this section is featured at the top of its group. */
  featuredIn?: Season[];
  order: number;
  /** Kept for owners but not shown to guests. */
  hidden?: boolean;
}

export type Delivery = 'email' | 'tap-to-text' | 'auto-text';

/**
 * A saved message. Today owners send by email or tap-to-text. Automated
 * texting slots in later by adding 'auto-text' to a template's delivery list.
 */
export interface MessageTemplate {
  id: 'welcome' | 'heading-out' | 'neighbors' | 'open-weekends';
  label: string;
  body: string;
  delivery: Delivery[];
}

export interface CabinSettings {
  address: string;
  directions: string;
  wifiNetwork: string;
  wifiPassword: string;
  weekendGoal: number;
  showGoal: boolean;
  /** 'auto' picks the season from today's date. */
  season: Season | 'auto';
}

/** A photo attached to a guide section. `data` is a small JPEG as a data URL. */
export interface GuidePhoto {
  id: string;
  sectionId: string;
  caption: string;
  /** Full photo (local demo) or, when `thumbOf` is set, the small gallery copy. */
  data: string;
  order: number;
  createdAt: string;
  /** Set when `data` is a thumbnail; the full photo lives in this collection under the same id. */
  thumbOf?: 'photos' | 'postPhotos';
}

/** When someone first and last opened the app (signed in). */
export interface Visit {
  firstSeen: string;
  lastSeen: string;
}

/** A photo and/or tip shared by someone who has stayed. Everyone invited can see it. */
export interface GuestPost {
  id: string;
  /** Person id (their email when signed in). */
  authorId: string;
  authorName: string;
  text: string;
  /** Older posts: one shrunk JPEG data URL here. Newer posts keep photos in postPhotos. */
  photo: string;
  /** How many photos are stored separately in postPhotos. */
  photoCount?: number;
  /** The stay it's from, e.g. "Oct 23–26", or '' if not tied to one. */
  stay?: string;
  createdAt: string;
  /** Set when the words were changed after posting. */
  editedAt?: string;
}

/** One photo in a guest post (kept separately so a post can hold several full-size photos). */
export interface PostPhoto {
  id: string;
  postId: string;
  authorId: string;
  data: string;
  order: number;
  thumbOf?: 'photos' | 'postPhotos';
}

/** One person's like on a guest post. Id is `${postId}__${personId}`. */
export interface PostLike {
  id: string;
  postId: string;
  personId: string;
  name: string;
  createdAt: string;
}

/** A guest's question for the owners, and the owners' answer. */
export interface GuestQuestion {
  id: string;
  /** Person id (their email when signed in). */
  askerId: string;
  askerName: string;
  text: string;
  answer: string;
  answeredAt: string;
  createdAt: string;
}

/** "Remind me later": the day a guest wants an emailed calendar reminder to check the calendar. */
export interface Reminder {
  id: string;
  /** Person id (their email when signed in). */
  personId: string;
  email: string;
  name: string;
  /** YYYY-MM-DD; the reminder is at 9:00 AM Central that day. */
  remindOn: string;
  /** queued -> sent (invite emailed) or failed. Set by the server. */
  status: 'queued' | 'sent' | 'failed';
  createdAt: string;
  sentAt?: string;
  error?: string;
}

export interface Snapshot {
  people: Person[];
  /** Owners only: sign-in history keyed by person id. */
  visits?: Record<string, Visit>;
  bookings: Booking[];
  guide: GuideSection[];
  templates: MessageTemplate[];
  settings: CabinSettings;
}
