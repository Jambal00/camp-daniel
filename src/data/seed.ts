import { addDays, nextFriday, today } from '../lib/dates';
import { GUIDE } from './guide';
import type { Booking, GroupTrip, GroupVote, Person, Snapshot } from './types';

// Sample data for local development. Bookings are placed relative to today
// so the calendar always has something on it. Everyone except Pete and
// Trisha is a made-up example guest.
//
// This repo is public, so no real contact details, addresses or passwords
// live here. Owners add their phone and email in the app (People), and the
// address and Wi-Fi in Owner › Guide › Cabin settings.

export const PEOPLE: Person[] = [
  { id: 'pete', name: 'Pete', shortName: 'Pete', email: '', phone: '', tier: 'owner' },
  { id: 'trisha', name: 'Trisha', shortName: 'Trisha', email: '', phone: '', tier: 'owner' },
  { id: 'maddie', name: 'Maddie (example)', shortName: 'Maddie', email: 'maddie@example.com', phone: '', tier: 'kids' },
  { id: 'tyler', name: 'Tyler (example)', shortName: 'Tyler', email: 'tyler@example.com', phone: '', tier: 'kids' },
  { id: 'rick', name: 'Rick & Jen Larson (example)', shortName: 'Rick', email: 'rick@example.com', phone: '', tier: 'friends' },
  { id: 'dave', name: 'Dave (example)', shortName: 'Dave', email: 'dave@example.com', phone: '555-0101', tier: 'friends' },
  { id: 'mike', name: 'Mike (example)', shortName: 'Mike', email: 'mike@example.com', phone: '555-0102', tier: 'friends' },
];

/** A sample group trip mid-vote: dates held, three of four have voted. */
function sampleGroupTrip(): { trip: GroupTrip; holds: Booking[]; votes: GroupVote[] } {
  const f1 = nextFriday(addDays(today(), 1));
  const now = new Date().toISOString();
  const starts = [addDays(f1, 7), addDays(f1, 42), addDays(f1, 49)];
  const holds: Booking[] = starts.map((s, i) => ({
    id: `b-gt-${i}`, personId: 'pete', start: s, end: addDays(s, 2), partySize: 5, names: "Held for Guys' weekend", note: '',
    status: 'tentative', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now, bookedByOwner: true, groupTripId: 'gt-guys',
  }));
  const trip: GroupTrip = {
    id: 'gt-guys', title: "Guys' weekend", note: 'Fishing, cards, steaks on the grill. Bring waders and a sleeping bag.', hostId: 'pete',
    inviteeIds: ['tyler', 'dave', 'mike', 'rick'], options: holds.map((h) => ({ start: h.start, end: h.end, holdId: h.id })),
    voteBy: addDays(today(), 5), status: 'voting', createdAt: now,
  };
  const v = (personId: string, answers: GroupVote['answers'], comment = ''): GroupVote => ({ id: `gt-guys__${personId}`, tripId: 'gt-guys', personId, answers, comment, updatedAt: now });
  return { trip, holds, votes: [v('tyler', ['yes', 'maybe', 'no']), v('dave', ['yes', 'yes', 'no'], 'Could only do Saturday night on the second one.'), v('mike', ['maybe', 'yes', 'yes'])] };
}

function sampleBookings(): Booking[] {
  const t = today();
  // f1 is the next Friday. The Friday after it is left open on purpose,
  // so the calendar has a featured open weekend.
  const f1 = nextFriday(addDays(t, 1));
  const f3 = addDays(f1, 14);
  const f4 = addDays(f1, 21);
  const f5 = addDays(f1, 35);
  const now = new Date().toISOString();
  const list: Booking[] = [
    {
      id: 'b-tyler', personId: 'tyler', start: f1, end: addDays(f1, 2), partySize: 4, names: 'Tyler + 3 friends',
      note: '', status: 'approved', welcomeNote: 'Have fun, bud. Text if you need anything.', doorCode: '',
      createdAt: now, decidedAt: now,
    },
    {
      id: 'b-maddie', personId: 'maddie', start: f3, end: addDays(f3, 2), partySize: 6, names: 'Maddie + 5 friends',
      note: 'Girls weekend!', status: 'pending', welcomeNote: '', doorCode: '', createdAt: now,
    },
    {
      id: 'b-us', personId: 'pete', start: f4, end: addDays(f4, 3), partySize: 2, names: 'Pete & Trisha',
      note: '', status: 'blocked', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now, bookedByOwner: true,
    },
    {
      id: 'b-rick-past', personId: 'rick', start: addDays(t, -60), end: addDays(t, -58), partySize: 4, names: 'Rick, Jen, Sam, Ava',
      note: '', status: 'approved', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now,
    },
    {
      id: 'b-tyler-past', personId: 'tyler', start: addDays(t, -30), end: addDays(t, -28), partySize: 3, names: 'Tyler + 2',
      note: '', status: 'approved', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now,
    },
    {
      id: 'b-us-later', personId: 'pete', start: f5, end: addDays(f5, 2), partySize: 2, names: 'Pete & Trisha',
      note: '', status: 'blocked', welcomeNote: '', doorCode: '', createdAt: now, decidedAt: now, bookedByOwner: true,
    },
  ];
  return list;
}

export function seedSnapshot(): Snapshot {
  const gt = sampleGroupTrip();
  return {
    people: PEOPLE,
    bookings: [...sampleBookings(), ...gt.holds],
    groupTrips: [gt.trip],
    groupVotes: gt.votes,
    visits: {
      pete: { firstSeen: `${addDays(today(), -20)}T19:02:00.000Z`, lastSeen: new Date().toISOString() },
      tyler: { firstSeen: `${addDays(today(), -9)}T01:15:00.000Z`, lastSeen: `${addDays(today(), -2)}T22:40:00.000Z` },
    },
    guide: GUIDE,
    templates: [
      {
        id: 'welcome',
        label: 'Welcome note',
        delivery: ['email', 'tap-to-text'],
        body:
          '{first}, we are so excited you are coming up! Turn on the well when you get there (breaker by the garage door), and the guide in the app covers the rest. Holler if you need anything whatsoever. – Pete & Trisha',
      },
      {
        id: 'heading-out',
        label: 'Heading out',
        delivery: ['tap-to-text'],
        body: 'Hi Pete! We are heading out of Camp Daniel. Cameras can go back on.',
      },
      {
        id: 'neighbors',
        label: 'Neighbor heads-up',
        delivery: ['tap-to-text'],
        body: 'Hi neighbors! Our friends {name} will be at our place {dates}. – Pete & Trisha',
      },
      {
        id: 'open-weekends',
        label: 'Open weekends',
        delivery: ['email'],
        body: 'Camp Daniel has open weekends coming up: {dates}. Grab one in the app!',
      },
    ],
    settings: {
      address: '',
      directions: 'First driveway on the left when you turn onto the trail.',
      wifiNetwork: '',
      wifiPassword: '',
      weekendGoal: 26,
      showGoal: true,
      season: 'auto',
    },
  };
}
