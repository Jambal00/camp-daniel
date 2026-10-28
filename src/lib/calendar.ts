import type { Booking } from '../data/types';
import { addDays } from './dates';

// "Add to my calendar" for a stay. All-day event from arrival day through departure day.
// Deliberately leaves out the door code and Wi-Fi: those stay in the app.

const compact = (iso: string) => iso.replace(/-/g, '');

function details(appUrl: string) {
  return `Your stay at Camp Daniel. Your welcome note, door code, Wi-Fi and the cabin guide are in the app: ${appUrl}`;
}

/** Opens Google Calendar with the event filled in. */
export function googleCalendarHref(b: Booking, address: string, appUrl: string): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Camp Daniel stay',
    dates: `${compact(b.start)}/${compact(addDays(b.end, 1))}`,
    details: details(appUrl),
    location: address,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** A standard calendar file (Apple Calendar, Outlook) with a reminder 3 days before. */
export function icsHref(b: Booking, address: string, appUrl: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Camp Daniel//Stay//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:stay-${b.id}@camp-daniel`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(b.start)}`,
    `DTEND;VALUE=DATE:${compact(addDays(b.end, 1))}`,
    'SUMMARY:Camp Daniel stay',
    ...(address ? [`LOCATION:${esc(address)}`] : []),
    `DESCRIPTION:${esc(details(appUrl))}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Camp Daniel in 3 days',
    'TRIGGER:-P3D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}
