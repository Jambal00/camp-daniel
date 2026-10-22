import { useState } from 'react';
import { Stepper, TierChip } from '../../components/bits';
import { MonthCalendar, type DayLook } from '../../components/MonthCalendar';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import { TIER_LABEL } from '../../data/types';
import { bookingOn, personById, rangeAvailable } from '../../lib/cabin';
import { daysBetween, fmtDay, fmtRange, fmtRangeLong, today, type ISODate } from '../../lib/dates';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';
import { formatPhone } from '../../lib/phone';

function initials(name: string) {
  return name.replace(/\(.*?\)/g, '').split(/[\s&+]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function OwnerCalendar() {
  const { snap, me } = useSession();
  const live = snap.bookings.filter((b) => b.status !== 'declined');
  const [sel, setSel] = useState<{ start?: ISODate; end?: ISODate }>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [mode, setMode] = useState<'block' | 'book'>('block');
  const guests = snap.people.filter((p) => p.tier !== 'owner');
  const [guestId, setGuestId] = useState(guests[0]?.id ?? '');
  const [party, setParty] = useState(4);

  const look = (d: ISODate): DayLook => {
    if (sel.start && (d === sel.start || d === sel.end)) return { className: 'selected', state: 'selected' };
    if (sel.start && sel.end && d > sel.start && d < sel.end) return { className: 'in-range', state: 'selected' };
    const b = bookingOn(d, live);
    if (b) {
      const p = personById(snap.people, b.personId);
      const tier = b.status === 'blocked' ? 'owner' : p?.tier ?? 'friends';
      return {
        className: `tier t-${tier}${b.status === 'pending' ? ' pending' : ''}`,
        tag: b.status === 'blocked' ? 'US' : initials(p?.shortName ?? '?'),
        state: `${b.status} by ${p?.shortName}`,
      };
    }
    return { className: d < today() ? 'past' : '', state: 'open' };
  };

  const pick = (d: ISODate) => {
    const b = bookingOn(d, live);
    if (b && !(sel.start && !sel.end && d > sel.start)) {
      setSel({});
      setFocus(b.id);
      return;
    }
    setFocus(null);
    if (!sel.start || sel.end || d <= sel.start) {
      setSel({ start: d });
      return;
    }
    if (!rangeAvailable(sel.start, d, snap.bookings)) {
      toast('That range runs into another stay.');
      return;
    }
    setSel({ start: sel.start, end: d });
  };

  const create = async () => {
    if (!sel.start || !sel.end) return;
    const now = new Date().toISOString();
    if (mode === 'block') {
      await store.createBooking({
        personId: me.id, start: sel.start, end: sel.end, partySize: 2, names: 'Pete & Trisha', note: '',
        status: 'blocked', welcomeNote: '', doorCode: '', decidedAt: now, bookedByOwner: true,
      });
      toast(`Blocked ${fmtRange(sel.start, sel.end)} for you.`);
    } else {
      const g = personById(snap.people, guestId);
      await store.createBooking({
        personId: guestId, start: sel.start, end: sel.end, partySize: party, names: g?.name ?? '', note: '',
        status: 'approved', welcomeNote: '', doorCode: '', decidedAt: now, bookedByOwner: true,
      });
      toast(`Booked ${fmtRange(sel.start, sel.end)} for ${g?.shortName}.`);
    }
    setSel({});
  };

  const fb = focus ? live.find((b) => b.id === focus) : undefined;
  const fp = fb ? personById(snap.people, fb.personId) : undefined;
  const upcoming = live.filter((b) => b.end >= today()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);

  return (
    <>
      <div className="band">
        <div className="eyebrow">Owner · Calendar</div>
        <h1 className="title" style={{ color: '#fff' }}>Who's at the cabin</h1>
      </div>
      <main className="screen" style={{ paddingTop: 14 }}>
        <section className="card" aria-label="Bookings calendar">
          <MonthCalendar look={look} onPick={pick} />
          <div className="legend">
            <span className="t-owner"><i className="sw" style={{ background: 'var(--tc)' }} />Us</span>
            <span className="t-kids"><i className="sw" style={{ background: 'var(--tc)' }} />Kids</span>
            <span className="t-friends"><i className="sw" style={{ background: 'var(--tc)' }} />Friends &amp; family</span>
            <span><i className="sw" style={{ border: '2px dashed var(--muted)' }} />Pending</span>
          </div>
        </section>

        {!sel.start && !fb && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Tap open days to block them or book for someone. Tap a stay to see details.</p>}

        {fb && fp && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="strong" style={{ fontSize: 17 }}>{fb.status === 'blocked' ? 'Blocked for us' : fb.names || fp.name}</div>
                <div className="small muted">{fmtRangeLong(fb.start, fb.end)} · {fb.partySize} people</div>
              </div>
              {fb.status === 'pending' ? <span className="chip orange">Pending</span> : <TierChip tier={fb.status === 'blocked' ? 'owner' : fp.tier} />}
            </div>
            {fb.note && <div className="small">“{fb.note}”</div>}
            {fb.status !== 'blocked' && (
              <div className="small muted">
                {fp.name}{fp.email ? ` · ${fp.email}` : ''}{fp.phone ? ` · ${formatPhone(fp.phone)}` : ''}
                {fb.bookedByOwner ? ' · booked by you' : ''}
              </div>
            )}
            <div className="grid-2">
              {fb.status === 'blocked' ? (
                <button className="btn outline small" onClick={async () => { await store.updateBooking(fb.id, { status: 'declined' }); setFocus(null); toast('Unblocked.'); }}>Unblock</button>
              ) : (
                <a className="btn small" href={href(`/owner/approve/${fb.id}`)}>{fb.status === 'pending' ? 'Review' : 'Edit stay'}</a>
              )}
              <button className="btn outline small" onClick={() => setFocus(null)}>Close</button>
            </div>
          </div>
        )}

        {sel.start && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="strong">{sel.end ? fmtRangeLong(sel.start, sel.end) : `From ${fmtDay(sel.start)}`}</div>
                <div className="small muted">{sel.end ? `${daysBetween(sel.start, sel.end)} night${daysBetween(sel.start, sel.end) > 1 ? 's' : ''}` : 'Tap the departure day.'}</div>
              </div>
              <button className="link-btn quiet" onClick={() => setSel({})}>Clear</button>
            </div>
            {sel.end && (
              <>
                <div className="grid-2" role="radiogroup" aria-label="What to do with these dates">
                  <button className={`btn small${mode === 'block' ? '' : ' outline'}`} role="radio" aria-checked={mode === 'block'} onClick={() => setMode('block')}>Block for us</button>
                  <button className={`btn small${mode === 'book' ? '' : ' outline'}`} role="radio" aria-checked={mode === 'book'} onClick={() => setMode('book')}>Book a guest</button>
                </div>
                {mode === 'book' && (
                  <>
                    <div className="field">
                      <label htmlFor="guest">Who</label>
                      <select id="guest" className="input" value={guestId} onChange={(e) => setGuestId(e.target.value)}>
                        {guests.map((g) => <option key={g.id} value={g.id}>{g.name} · {TIER_LABEL[g.tier]}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="oparty">People</label>
                      <Stepper id="oparty" value={party} onChange={setParty} max={9} />
                    </div>
                  </>
                )}
                <button className="btn block" onClick={create}>{mode === 'block' ? 'Block these dates' : 'Book it'}</button>
              </>
            )}
          </div>
        )}

        <div className="eyebrow" style={{ paddingTop: 4 }}>Upcoming</div>
        <div className="card tight">
          {upcoming.length === 0 && <div className="list-row muted">Nothing booked yet.</div>}
          {upcoming.map((b) => {
            const p = personById(snap.people, b.personId);
            const tier = b.status === 'blocked' ? 'owner' : p?.tier ?? 'friends';
            return (
              <button key={b.id} className={`list-row t-${tier}`} onClick={() => { setSel({}); setFocus(b.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                <span className="row" style={{ minWidth: 0 }}>
                  <span className={`dot${b.status === 'pending' ? ' pending' : ''}`} />
                  <span className="meta"><span className="strong">{b.status === 'blocked' ? 'Us · blocked' : b.names || p?.name}</span><span className="small muted">{fmtRange(b.start, b.end)} · {b.partySize} people</span></span>
                </span>
                <span className="small strong muted" style={{ textTransform: 'capitalize' }}>{b.status === 'approved' ? 'Confirmed' : b.status}</span>
              </button>
            );
          })}
        </div>
      </main>
    </>
  );
}
