// Date helpers. Dates are plain 'YYYY-MM-DD' strings in local time so they
// never shift across time zones.

export type ISODate = string;

export function toISO(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): ISODate {
  return toISO(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

/** Every night of a stay: start up to the day before end. */
export function nightsOf(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate) {
  return aStart < bEnd && bStart < aEnd;
}

export function dayOfWeek(s: ISODate): number {
  return fromISO(s).getDay();
}

/** Next Friday on or after the given date. */
export function nextFriday(from: ISODate): ISODate {
  const dow = dayOfWeek(from);
  return addDays(from, (5 - dow + 7) % 7);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Fri, Nov 13" */
export function fmtDay(s: ISODate): string {
  const d = fromISO(s);
  return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
}

/** "Nov 13–15" or "Nov 29 – Dec 1" */
export function fmtRange(start: ISODate, end: ISODate): string {
  const a = fromISO(start);
  const b = fromISO(end);
  if (a.getMonth() === b.getMonth()) return `${MON[a.getMonth()]} ${a.getDate()}–${b.getDate()}`;
  return `${MON[a.getMonth()]} ${a.getDate()} – ${MON[b.getMonth()]} ${b.getDate()}`;
}

/** "Fri, Nov 13 – Sun, Nov 15" */
export function fmtRangeLong(start: ISODate, end: ISODate): string {
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH[month]} ${year}`;
}

/** 6-row grid of ISO dates (null for padding) for a month, Sunday first. */
export function monthGrid(year: number, month: number): (ISODate | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (ISODate | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function seasonOf(s: ISODate): 'winter' | 'spring' | 'summer' | 'fall' {
  const m = fromISO(s).getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'fall';
}
