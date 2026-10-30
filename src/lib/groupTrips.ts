import type { GroupTrip, GroupVote, GroupVoteAnswer, Snapshot } from '../data/types';

/** A trip member's first name and number: from People when visible (owners), else the trip's own list. */
export function member(snap: Snapshot, trip: GroupTrip | undefined, id: string): { name: string; phone: string } {
  const p = snap.people.find((x) => x.id === id);
  if (p) return { name: p.shortName, phone: p.phone };
  return trip?.members?.[id] ?? { name: 'Someone', phone: '' };
}


export function votesFor(snap: Snapshot, trip: GroupTrip): GroupVote[] {
  return (snap.groupVotes ?? []).filter((v) => v.tripId === trip.id && trip.inviteeIds.includes(v.personId));
}

export interface OptionTally {
  index: number;
  yes: string[];
  maybe: string[];
  no: string[];
  /** Yes counts double, "if needed" once. */
  score: number;
}

export function tally(trip: GroupTrip, votes: GroupVote[]): OptionTally[] {
  return trip.options.map((_, index) => {
    const by = (a: GroupVoteAnswer) => votes.filter((v) => v.answers[index] === a).map((v) => v.personId);
    const yes = by('yes');
    const maybe = by('maybe');
    return { index, yes, maybe, no: by('no'), score: yes.length * 2 + maybe.length };
  });
}

/** The option with the most support, if anyone has voted. */
export function bestOption(t: OptionTally[]): number | null {
  const top = [...t].sort((a, b) => b.score - a.score || b.yes.length - a.yes.length || a.index - b.index)[0];
  return top && top.score > 0 ? top.index : null;
}

/** Group trips a guest is invited to that still need them (voting). */
export function invitesFor(snap: Snapshot, personId: string): GroupTrip[] {
  return (snap.groupTrips ?? []).filter((t) => t.status === 'voting' && t.inviteeIds.includes(personId));
}

export const ANSWER_LABEL: Record<GroupVoteAnswer, string> = { yes: 'Yes', maybe: 'If needed', no: 'No' };
