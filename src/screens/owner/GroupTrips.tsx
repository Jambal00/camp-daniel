import { useMemo, useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';

import { groupSmsHref, openWeekends, personById, rangeAvailable } from '../../lib/cabin';
import { addDays, fmtDay, fmtRange, today } from '../../lib/dates';
import { ANSWER_LABEL, bestOption, tally, votesFor } from '../../lib/groupTrips';
import { go, href } from '../../lib/router';
import { useSession } from '../../lib/session';

const MAX_OPTIONS = 4;

/** Owner home: group trips that are still collecting votes, plus a way to start one. */
export function GroupTripsSection() {
  const { snap } = useSession();
  const voting = (snap.groupTrips ?? []).filter((t) => t.status === 'voting');
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="section-label"><h2 className="title-sm" style={{ fontSize: 20 }}>Group trips</h2></div>
      {voting.map((t) => {
        const voted = votesFor(snap, t).length;
        return (
          <a key={t.id} className="card album-link" href={href(`/owner/group/${t.id}`)}>
            <span className="ico" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>
            </span>
            <span className="meta" style={{ flex: 1 }}>
              <span className="strong">{t.title}</span>
              <span className="small muted">{voted} of {t.inviteeIds.length} voted{t.voteBy ? ` · vote by ${fmtDay(t.voteBy)}` : ''}</span>
            </span>
            <span className="chip orange">Voting</span>
          </a>
        );
      })}
      <a className="btn outline" href={href('/owner/group/new')}>+ Plan a group trip</a>
    </section>
  );
}

/** Owner: name it, pick who's invited and 2–4 date choices, send. */
export function GroupTripNew() {
  const { snap, me } = useSession();
  const guests = snap.people.filter((p) => p.tier !== 'owner');
  const weekends = useMemo(() => openWeekends(snap.bookings, 10), [snap.bookings]);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [options, setOptions] = useState<{ start: string; end: string }[]>([]);
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [voteBy, setVoteBy] = useState(addDays(today(), 7));
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);

  const has = (o: { start: string; end: string }) => options.some((x) => x.start === o.start && x.end === o.end);
  const toggleOption = (o: { start: string; end: string }) => {
    if (has(o)) setOptions(options.filter((x) => !(x.start === o.start && x.end === o.end)));
    else if (options.length >= MAX_OPTIONS) toast(`Up to ${MAX_OPTIONS} choices keeps it easy to answer.`);
    else setOptions([...options, o].sort((a, b) => a.start.localeCompare(b.start)));
  };
  const addCustom = () => {
    if (!custom.start || !custom.end || custom.end <= custom.start) return toast('Pick an arrival and a later departure.');
    if (!rangeAvailable(custom.start, custom.end, snap.bookings)) return toast('Those dates overlap a stay that’s already on the calendar.');
    toggleOption(custom);
    setCustom({ start: '', end: '' });
  };
  const addPerson = async () => {
    if (!newPerson.name.trim() || !newPerson.email.includes('@')) return;
    const name = newPerson.name.trim();
    const email = newPerson.email.trim().toLowerCase();
    if (snap.people.some((x) => x.email === email || x.id === email)) return toast('That email is already in People. Check them off above.');
    const p = await store.addPerson({ name, shortName: name.split(/\s+/)[0], email, phone: newPerson.phone.trim(), tier: 'friends' });
    setInvitees([...invitees, p.id]);
    setNewPerson({ name: '', phone: '', email: '' });
    setAdding(false);
    toast(`${p.shortName} added to People and invited.`);
  };

  const ready = title.trim() && invitees.length > 0 && options.length >= 2;
  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const t = await store.createGroupTrip({ title: title.trim(), note: note.trim(), hostId: me.id, inviteeIds: invitees, options, voteBy: voteBy || undefined });
      toast('Invites sent. The dates are held while everyone votes.');
      go(`/owner/group/${t.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t create it. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <a className="back" href={href('/owner')}>‹ Requests</a>
      <h1 className="title">Plan a group trip</h1>
      <p className="muted" style={{ margin: 0 }}>Invite a few people, offer a few dates, and let them vote. You pick the winner.</p>

      <div className="field">
        <label htmlFor="gt-title">Name it</label>
        <input id="gt-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Guys' weekend" />
      </div>

      <div className="field">
        <div className="label">Who's invited</div>
        <div className="card tight">
          {guests.map((p) => (
            <label key={p.id} className="list-row check-row">
              <input type="checkbox" checked={invitees.includes(p.id)} onChange={(e) => setInvitees(e.target.checked ? [...invitees, p.id] : invitees.filter((x) => x !== p.id))} />
              <span className="meta" style={{ flex: 1 }}><span className="strong">{p.name}</span><span className="small muted">{p.phone || p.email || 'No contact info yet'}</span></span>
            </label>
          ))}
        </div>
        {adding ? (
          <div className="card">
            <input className="input" placeholder="Name" value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} aria-label="Name" />
            <input className="input" placeholder="Mobile number" inputMode="tel" value={newPerson.phone} onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })} aria-label="Mobile number" />
            <input className="input" placeholder="Email (they sign in with it)" inputMode="email" value={newPerson.email} onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} aria-label="Email" />
            <div className="small muted">They'll get the invite by email, and sign in with that address to vote.</div>
            <div className="grid-2">
              <button className="btn outline" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn" onClick={addPerson} disabled={!newPerson.name.trim() || !newPerson.email.includes('@')}>Add & invite</button>
            </div>
          </div>
        ) : (
          <button className="link-btn" onClick={() => setAdding(true)}>+ Someone who isn't in People yet</button>
        )}
      </div>

      <div className="field">
        <div className="section-label"><div className="label">Date choices</div><span className="small muted num">{options.length} of 2–{MAX_OPTIONS}</span></div>
        <div className="small muted">Open weekends (Fri–Sun). They're held for this trip while people vote.</div>
        <div className="row wrap" style={{ gap: 8 }}>
          {weekends.map((f) => {
            const o = { start: f, end: addDays(f, 2) };
            return (
              <button key={f} type="button" className={`btn small${has(o) ? '' : ' outline'}`} aria-pressed={has(o)} onClick={() => toggleOption(o)}>
                {fmtRange(o.start, o.end)}
              </button>
            );
          })}
        </div>
        <details className="custom-dates">
          <summary className="link-btn">Other dates</summary>
          <div className="grid-2">
            <input className="input" type="date" min={today()} value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} aria-label="Arrive" />
            <input className="input" type="date" min={custom.start || today()} value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} aria-label="Leave" />
          </div>
          <button className="btn outline small" onClick={addCustom}>Add these dates</button>
        </details>
        {options.some((o) => !weekends.includes(o.start) || o.end !== addDays(o.start, 2)) && (
          <div className="small muted">Also: {options.filter((o) => !weekends.includes(o.start) || o.end !== addDays(o.start, 2)).map((o) => fmtRange(o.start, o.end)).join(', ')}</div>
        )}
      </div>

      <div className="field">
        <label htmlFor="gt-by">Vote by</label>
        <input id="gt-by" className="input" type="date" min={today()} value={voteBy} onChange={(e) => setVoteBy(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="gt-note">A note for everyone (optional)</label>
        <textarea id="gt-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fishing, cards, steaks. Bring waders." />
        <div className="small muted">Shows on the invite, and becomes the welcome note once you lock in a date.</div>
      </div>

      <button className="btn" onClick={send} disabled={!ready || busy}>{busy ? 'Sending…' : `Send invites${invitees.length ? ` to ${invitees.length}` : ''}`}</button>
      {!ready && <div className="small muted" style={{ textAlign: 'center' }}>Add a name, at least one person and 2 date choices.</div>}
    </main>
  );
}

/** Owner: who can make which date, then lock one in. */
export function GroupTripView({ id }: { id: string }) {
  const { snap } = useSession();
  const trip = (snap.groupTrips ?? []).find((t) => t.id === id);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  if (!trip) {
    return (
      <main className="screen">
        <a className="back" href={href('/owner')}>‹ Requests</a>
        <div className="alert">That group trip isn't here anymore.</div>
      </main>
    );
  }
  const votes = votesFor(snap, trip);
  const t = tally(trip, votes);
  const best = bestOption(t);
  const name = (pid: string) => personById(snap.people, pid)?.shortName ?? 'Someone';
  const notVoted = trip.inviteeIds.filter((pid) => !votes.some((v) => v.personId === pid));
  const phones = (ids: string[]) => ids.map((pid) => personById(snap.people, pid)?.phone ?? '').filter(Boolean);

  const lock = async (index: number) => {
    const crew = [...t[index].yes, ...t[index].maybe];
    try {
      await store.lockGroupTrip(trip.id, index, crew);
      toast('Locked in! Everyone going gets the trip on My trip.');
      setConfirm(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t lock it in.');
    }
  };
  const callOff = async () => {
    await store.cancelGroupTrip(trip.id);
    toast('Called off. The held dates are open again.');
    go('/owner');
  };

  return (
    <main className="screen">
      <a className="back" href={href('/owner')}>‹ Requests</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 className="title" style={{ margin: 0 }}>{trip.title}</h1>
          <span className={`chip ${trip.status === 'voting' ? 'orange' : trip.status === 'locked' ? 'blue' : 'grey'}`}>{trip.status === 'voting' ? 'Voting' : trip.status === 'locked' ? 'Locked in' : 'Called off'}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {votes.length} of {trip.inviteeIds.length} voted{trip.voteBy && trip.status === 'voting' ? ` · vote by ${fmtDay(trip.voteBy)}` : ''}
        </p>
      </header>

      {trip.status === 'locked' && trip.lockedIndex !== undefined && (
        <div className="card">
          <div className="strong">Going: {fmtRange(trip.options[trip.lockedIndex].start, trip.options[trip.lockedIndex].end)}</div>
          <div className="small muted">{[...t[trip.lockedIndex].yes, ...t[trip.lockedIndex].maybe].map(name).join(', ') || 'Just you so far'}</div>
          {trip.bookingId && <a className="btn outline" href={href(`/owner/approve/${trip.bookingId}`)}>Add the door code</a>}
        </div>
      )}

      {trip.options.map((o, i) => {
        const r = t[i];
        const isBest = best === i && trip.status === 'voting';
        const isLocked = trip.lockedIndex === i;
        return (
          <section key={i} className={`card gt-option${isBest ? ' best' : ''}${trip.status === 'locked' && !isLocked ? ' faded' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="title-sm">{fmtRange(o.start, o.end)}</div>
              {isBest && <span className="chip pick">Best so far</span>}
              {isLocked && <span className="chip blue">Locked in</span>}
            </div>
            <div className="gt-bars" aria-hidden="true">
              <span className="yes" style={{ flex: r.yes.length }} />
              <span className="maybe" style={{ flex: r.maybe.length }} />
              <span className="no" style={{ flex: r.no.length }} />
              <span className="none" style={{ flex: trip.inviteeIds.length - r.yes.length - r.maybe.length - r.no.length }} />
            </div>
            {(['yes', 'maybe', 'no'] as const).map((a) =>
              r[a].length ? (
                <div key={a} className="small"><span className={`gt-dot ${a}`} /> <b>{ANSWER_LABEL[a]}:</b> {r[a].map(name).join(', ')}</div>
              ) : null,
            )}
            {trip.status === 'voting' &&
              (confirm === i ? (
                <div className="card inset">
                  <div className="small">Lock in <b>{fmtRange(o.start, o.end)}</b>? {r.yes.length + r.maybe.length ? `${[...r.yes, ...r.maybe].map(name).join(', ')} get the trip on My trip.` : 'Nobody has said yes yet.'} The other dates open back up.</div>
                  <div className="grid-2">
                    <button className="btn outline" onClick={() => setConfirm(null)}>Not yet</button>
                    <button className="btn" onClick={() => lock(i)}>Lock it in</button>
                  </div>
                </div>
              ) : (
                <button className={`btn${isBest ? '' : ' outline'} small`} style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(i)}>Lock in these dates</button>
              ))}
          </section>
        );
      })}

      {votes.some((v) => v.comment) && (
        <section className="card">
          <div className="eyebrow">Comments</div>
          {votes.filter((v) => v.comment).map((v) => (
            <div key={v.id} className="small"><b>{name(v.personId)}:</b> {v.comment}</div>
          ))}
        </section>
      )}

      {trip.status === 'voting' && notVoted.length > 0 && (
        <section className="card">
          <div className="small"><b>Haven't voted:</b> {notVoted.map(name).join(', ')}</div>
          {phones(notVoted).length > 0 && (
            <a className="btn outline small" style={{ alignSelf: 'flex-start' }} href={groupSmsHref(phones(notVoted), `Hey! Vote on dates for ${trip.title} in the Camp Daniel app 👉 `)}>Text a nudge</a>
          )}
        </section>
      )}

      {phones(trip.inviteeIds).length > 0 && (
        <a className="btn outline" href={groupSmsHref(phones(trip.inviteeIds), `${trip.title}: `)}>Text the group</a>
      )}

      {trip.status === 'voting' &&
        (cancelling ? (
          <div className="card">
            <div className="small strong">Call off {trip.title}? The held dates open back up.</div>
            <div className="grid-2">
              <button className="btn outline" onClick={() => setCancelling(false)}>Keep it</button>
              <button className="btn" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={callOff}>Call it off</button>
            </div>
          </div>
        ) : (
          <button className="link-btn" style={{ color: 'var(--red-ink)', alignSelf: 'center' }} onClick={() => setCancelling(true)}>Call off this trip</button>
        ))}
    </main>
  );
}


