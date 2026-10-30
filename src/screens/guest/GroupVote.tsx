import { useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GroupVoteAnswer } from '../../data/types';
import { fmtDay, fmtRange } from '../../lib/dates';
import { ANSWER_LABEL, invitesFor, member, votesFor } from '../../lib/groupTrips';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

/** Calendar page: "You're invited" for each group trip waiting on this person. */
export function GroupInvites() {
  const { snap, me } = useSession();
  const trips = invitesFor(snap, me.id);
  if (!trips.length) return null;
  return (
    <>
      {trips.map((t) => {
        const host = member(snap, t, t.hostId).name;
        const voted = votesFor(snap, t).some((v) => v.personId === me.id);
        return (
          <a key={t.id} className="card gt-invite" href={href(`/group/${t.id}`)}>
            <div className="eyebrow">{voted ? 'You voted' : `${host} invited you`}</div>
            <div className="title-sm">{t.title}</div>
            <div className="small muted">
              {t.options.length} date choices{t.voteBy ? ` · vote by ${fmtDay(t.voteBy)}` : ''}
            </div>
            <span className={`btn small${voted ? ' outline' : ''}`} style={{ alignSelf: 'flex-start' }}>{voted ? 'See who’s in' : 'Vote on dates'}</span>
          </a>
        );
      })}
    </>
  );
}

const ANSWERS: GroupVoteAnswer[] = ['yes', 'maybe', 'no'];

/** Invitee: Yes / If needed / No for each date, and see how everyone else voted. */
export function GroupVote({ id }: { id: string }) {
  const { snap, me, previewing } = useSession();
  const trip = (snap.groupTrips ?? []).find((t) => t.id === id && t.inviteeIds.includes(me.id));
  const votes = trip ? votesFor(snap, trip) : [];
  const mine = votes.find((v) => v.personId === me.id);
  const [answers, setAnswers] = useState<(GroupVoteAnswer | null)[]>(() => trip?.options.map((_, i) => mine?.answers[i] ?? null) ?? []);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [busy, setBusy] = useState(false);

  if (!trip) {
    return (
      <main className="screen">
        <a className="back" href={href('/')}>‹ Calendar</a>
        <div className="alert">That invite isn't here anymore.</div>
      </main>
    );
  }
  const host = { shortName: member(snap, trip, trip.hostId).name };
  const name = (pid: string) => (pid === me.id ? 'You' : member(snap, trip, pid).name);
  const done = answers.every((a) => a);
  const locked = trip.status === 'locked' && trip.lockedIndex !== undefined ? trip.options[trip.lockedIndex] : null;
  const going = locked && snap.bookings.find((b) => b.id === trip.bookingId)?.crew?.includes(me.id);

  const save = async () => {
    if (!done) return;
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
    setBusy(true);
    try {
      await store.voteGroupTrip(trip.id, me.id, answers as GroupVoteAnswer[], comment.trim());
      toast(mine ? 'Votes updated.' : `Thanks! ${host?.shortName ?? 'Pete'} will pick the date and let everyone know.`);
    } catch {
      toast('Couldn’t save your votes. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <a className="back" href={href('/')}>‹ Calendar</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="eyebrow">{host?.shortName ?? 'Pete'} invited you</div>
        <h1 className="title" style={{ margin: 0 }}>{trip.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          With {trip.inviteeIds.filter((p) => p !== me.id).map(name).join(', ')}
          {trip.voteBy && trip.status === 'voting' ? ` · vote by ${fmtDay(trip.voteBy)}` : ''}
        </p>
      </header>

      {trip.note && <div className="card"><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{trip.note}</p></div>}

      {locked ? (
        <div className="card">
          <div className="strong">It's set: {fmtRange(locked.start, locked.end)}</div>
          <div className="small muted">{going ? 'You’re in! Everything for the trip is on My trip.' : 'You’re not on this one. Next time!'}</div>
          {going && <a className="btn" href={href('/trip')}>Go to My trip</a>}
        </div>
      ) : trip.status === 'cancelled' ? (
        <div className="alert">This trip was called off.</div>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>Which of these work for you?</p>
          {trip.options.map((o, i) => {
            const others = votes.filter((v) => v.personId !== me.id);
            return (
              <section key={i} className="card gt-option">
                <div className="title-sm">{fmtRange(o.start, o.end)}</div>
                <div className="gt-answers" role="radiogroup" aria-label={`Can you make ${fmtRange(o.start, o.end)}?`}>
                  {ANSWERS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={answers[i] === a}
                      className={`gt-answer ${a}${answers[i] === a ? ' on' : ''}`}
                      onClick={() => setAnswers(answers.map((x, k) => (k === i ? a : x)))}
                    >
                      {ANSWER_LABEL[a]}
                    </button>
                  ))}
                </div>
                {others.length > 0 && (
                  <div className="small muted">
                    {ANSWERS.map((a) => {
                      const who = others.filter((v) => v.answers[i] === a).map((v) => name(v.personId));
                      return who.length ? <span key={a} className="gt-who"><span className={`gt-dot ${a}`} /> {who.join(', ')}</span> : null;
                    })}
                  </div>
                )}
              </section>
            );
          })}
          <div className="field">
            <label htmlFor="gt-comment">Anything to add? (optional)</label>
            <input id="gt-comment" className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Could do Saturday only on the 14th" />
          </div>
          <button className="btn" onClick={save} disabled={!done || busy}>{busy ? 'Saving…' : mine ? 'Update my votes' : 'Send my votes'}</button>
          {!done && <div className="small muted" style={{ textAlign: 'center' }}>Answer each date to send.</div>}
        </>
      )}
    </main>
  );
}
