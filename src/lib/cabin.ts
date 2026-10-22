import type { Booking, CabinSettings, GuideSection, Person, Season, Snapshot } from '../data/types';
import { TIER_RANK } from '../data/types';
import { addDays, dayOfWeek, fmtRange, fromISO, nextFriday, nightsOf, onDayOf, rangesOverlap, seasonOf, today, type ISODate } from './dates';

/** Bookings that actually hold the cabin. Pending requests do not. */
export function holding(bookings: Booking[]): Booking[] {
  return bookings.filter((b) => b.status === 'approved' || b.status === 'blocked');
}

export function bookingOn(date: ISODate, bookings: Booking[]): Booking | undefined {
  return bookings.find((b) => onDayOf(date, b.start, b.end));
}

/** Is this day held by a stay, including its departure day? */
export function isDayTaken(date: ISODate, bookings: Booking[], ignoreId?: string): boolean {
  return holding(bookings).some((b) => b.id !== ignoreId && onDayOf(date, b.start, b.end));
}

export function rangeAvailable(start: ISODate, end: ISODate, bookings: Booking[], ignoreId?: string): boolean {
  if (end <= start) return false;
  return !holding(bookings).some((b) => b.id !== ignoreId && rangesOverlap(start, end, b.start, b.end));
}

/** Friday through Sunday all free (a Fri–Sun stay holds Sunday too). */
export function isOpenWeekend(friday: ISODate, bookings: Booking[]): boolean {
  return rangeAvailable(friday, addDays(friday, 2), bookings);
}

/** Upcoming open Fri–Sun weekends, soonest first. */
export function openWeekends(bookings: Booking[], count = 6, from: ISODate = today()): ISODate[] {
  const out: ISODate[] = [];
  let f = nextFriday(from);
  if (f === from && new Date().getHours() >= 15) f = addDays(f, 7);
  for (let i = 0; i < 104 && out.length < count; i++, f = addDays(f, 7)) {
    if (isOpenWeekend(f, bookings)) out.push(f);
  }
  return out;
}

/** Is this date part of an open Fri/Sat/Sun weekend? */
export function inOpenWeekend(date: ISODate, bookings: Booking[]): boolean {
  const dow = dayOfWeek(date);
  if (dow !== 5 && dow !== 6 && dow !== 0) return false;
  const friday = dow === 5 ? date : dow === 6 ? addDays(date, -1) : addDays(date, -2);
  return isOpenWeekend(friday, bookings);
}

/** Weekends (Saturday nights) in a calendar year that are booked or blocked. */
export function weekendsUsed(bookings: Booking[], year: number): number {
  const sats = new Set<string>();
  for (const b of holding(bookings)) {
    for (const n of nightsOf(b.start, b.end)) {
      if (fromISO(n).getFullYear() === year && dayOfWeek(n) === 6) sats.add(n);
    }
  }
  return sats.size;
}

/** Weekends a set of pending requests would add on top of what's booked. */
export function weekendsAddedBy(pending: Booking[], bookings: Booking[], year: number): number {
  const before = weekendsUsed(bookings, year);
  const after = weekendsUsed(
    bookings.map((b) => (pending.some((p) => p.id === b.id) ? { ...b, status: 'approved' as const } : b)),
    year,
  );
  return after - before;
}

/** Someone's next trip: the soonest pending or approved stay that hasn't ended. */
export function nextTripFor(personId: string, bookings: Booking[]): Booking | undefined {
  const t = today();
  return bookings
    .filter((b) => b.personId === personId && (b.status === 'pending' || b.status === 'approved') && b.end >= t)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
}

/** Door code and Wi-Fi unlock at noon on arrival day and stay until the end of departure day. */
export function accessUnlocked(b: Booking, now = new Date()): boolean {
  if (b.status !== 'approved') return false;
  const open = fromISO(b.start);
  open.setHours(12, 0, 0, 0);
  const close = fromISO(b.end);
  close.setHours(23, 59, 59, 999);
  return now >= open && now <= close;
}

export function stayPhase(b: Booking): 'requested' | 'upcoming' | 'staying' | 'done' {
  const t = today();
  if (b.status === 'pending') return 'requested';
  if (t < b.start) return 'upcoming';
  if (t <= b.end) return 'staying';
  return 'done';
}

/** Pending requests in dibs order: tier first, then date requested. */
export function needsDecision(snap: Snapshot): Booking[] {
  const tier = (b: Booking) => TIER_RANK[personById(snap.people, b.personId)?.tier ?? 'friends'];
  return snap.bookings
    .filter((b) => b.status === 'pending' && b.end >= today())
    .sort((a, b) => tier(a) - tier(b) || a.start.localeCompare(b.start));
}

export function personById(people: Person[], id: string): Person | undefined {
  return people.find((p) => p.id === id);
}

export function currentSeason(settings: CabinSettings): Season {
  return settings.season === 'auto' ? seasonOf(today()) : settings.season;
}

export const SEASON_LABEL: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' };

/** Sections in a group: this season's picks first, then problems, then the rest. */
export function sortSections(sections: GuideSection[], season: Season): GuideSection[] {
  // Stored for the season goes last, even if it's normally featured.
  const rank = (s: GuideSection) => (s.status === 'stored' ? 3 : s.featuredIn?.includes(season) ? 0 : s.status === 'out' ? 1 : 2);
  return [...sections].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
}

export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Opens the phone's Messages app with the text filled in. Works on iOS and Android. */
export function smsHref(phone: string, body: string): string {
  return `sms:${phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
}

export function mailHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function stayLabel(b: Booking): string {
  return fmtRange(b.start, b.end);
}
