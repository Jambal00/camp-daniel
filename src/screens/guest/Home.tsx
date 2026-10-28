import { PhotosLink } from './PhotosHub';
import { useState } from 'react';
import { MonthCalendar, type DayLook } from '../../components/MonthCalendar';
import { toast } from '../../components/Toast';
import { holding, isDayTaken, nextTripFor, mapsHref, rangeAvailable } from '../../lib/cabin';
import { daysBetween, fmtDay, fmtRange, fmtRangeLong, onDayOf, today, type ISODate } from '../../lib/dates';
import { go, href, useRoute } from '../../lib/router';
import { useSession } from '../../lib/session';

export function Home() {
  const { snap, me } = useSession();
  const { query } = useRoute();
  // Picking new dates for one of your own bookings: its days count as open.
  const changing = snap.bookings.find((b) => b.id === query.get('change') && b.personId === me.id && (b.status === 'pending' || b.status === 'approved'));
  const ignoreId = changing?.id;
  const [sel, setSel] = useState<{ start?: ISODate; end?: ISODate }>({});
  const t = today();
  const trip = nextTripFor(me.id, snap.bookings);
  const mine = snap.bookings.filter((b) => b.personId === me.id && (b.status === 'pending' || b.status === 'approved'));
  const others = holding(snap.bookings).filter((b) => b.personId !== me.id);

  const pastStays = mine.filter((b) => b.status === 'approved' && b.start < t);
  const look = (d: ISODate): DayLook => {
    if (d < t) {
      // Past days can't be picked, but your own past stays stay marked.
      const p = pastStays.find((b) => onDayOf(d, b.start, b.end));
      return p ? { className: 'past mine-past', disabled: true, state: 'your past stay' } : { className: 'past', disabled: true };
    }
    if (sel.start && (d === sel.start || d === sel.end)) return { className: 'selected', state: 'selected' };
    if (sel.start && sel.end && d > sel.start && d < sel.end) return { className: 'in-range', state: 'selected' };
    const m = mine.find((b) => onDayOf(d, b.start, b.end));
    if (m && m.id === ignoreId) return { className: 'mine changing', state: 'the dates you are changing' };
    if (m) return { className: `mine ${m.status}`, state: m.status === 'pending' ? 'your request' : 'your stay' };
    if (others.some((b) => onDayOf(d, b.start, b.end))) return { className: 'booked', state: 'booked' };
    return { className: '', state: 'open' };
  };

  const pick = (d: ISODate) => {
    if (!sel.start || sel.end || d <= sel.start) {
      if (isDayTaken(d, snap.bookings, ignoreId)) {
        toast('That day is already booked.');
        return;
      }
      setSel({ start: d });
      return;
    }
    if (!rangeAvailable(sel.start, d, snap.bookings, ignoreId)) {
      toast('Those dates run into a booked stay. Try a shorter trip.');
      return;
    }
    setSel({ start: sel.start, end: d });
  };

  const request = (start: ISODate, end: ISODate) => go(`/request?start=${start}&end=${end}${changing ? `&change=${changing.id}` : ''}`);

  return (
    <main className={`screen${sel.start ? ' with-bottom-action' : ''}`}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="eyebrow">Camp Daniel · #sconnicabin</div>
        <h1 className="title">{changing ? 'Pick new dates' : `Hi ${me.shortName}! Come on up.`}</h1>
      </header>

      {changing && (
        <div className="callout row" style={{ justifyContent: 'space-between', gap: 10 }}>
          <span>Changing your {fmtRange(changing.start, changing.end)} {changing.status === 'approved' ? 'stay' : 'request'}. Tap the day you'd arrive, then the day you'd head out.</span>
          <a className="link-btn" style={{ minHeight: 32, flexShrink: 0 }} href={href('/trip')}>Never mind</a>
        </div>
      )}

      {!changing && trip?.status === 'approved' && (
        <a href={href('/trip')} className="card" style={{ textDecoration: 'none', color: 'inherit', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div className="eyebrow">Your stay</div>
            <div className="strong" style={{ fontSize: 17 }}>{fmtRangeLong(trip.start, trip.end)}</div>
          </div>
          <span className="chip solid">Approved</span>
        </a>
      )}

      {!changing && trip?.status === 'pending' && (
        <a href={href('/trip')} className="card" style={{ textDecoration: 'none', color: 'inherit', gap: 8 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="strong">Your request · {fmtRange(trip.start, trip.end)}</div>
            <span className="chip blue">Waiting on Pete &amp; Trisha</span>
          </div>
          <div className="mini-steps">
            <span className="node done" /><span className="strong" style={{ color: 'var(--ink)' }}>Sent</span>
            <span className="bar" />
            <span className="node next" /><span>Approved</span>
            <span className="bar" />
            <span className="node" /><span>Stay</span>
          </div>
        </a>
      )}

      <section className="card" aria-label="Availability calendar">
        <MonthCalendar look={look} onPick={pick} noPast={pastStays.length === 0} />
        <div className="legend">
          <span><i className="sw" style={{ background: '#fff', border: '1px solid var(--line)' }} />Open</span>
          <span><i className="sw" style={{ background: 'var(--booked)' }} />Booked</span>
          {mine.some((b) => b.status === 'approved' && b.end >= t) && <span><i className="sw" style={{ background: 'var(--blue)' }} />Your stay</span>}
          {pastStays.length > 0 && <span><i className="sw" style={{ background: 'var(--blue-tint)', border: '1px solid var(--blue)' }} />Past stay</span>}
          {mine.some((b) => b.status === 'pending') && <span><i className="sw" style={{ border: '2px dashed var(--blue)' }} />Your request</span>}
        </div>
      </section>
      {!sel.start && <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Tap the day you'd arrive, then the day you'd head out.</p>}

      {!sel.start && snap.settings.address && (
        <a className="card album-link" href={mapsHref(snap.settings.address)} target="_blank" rel="noreferrer">
          <span className="ico" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
          </span>
          <span className="meta" style={{ flex: 1 }}><span className="strong">Where we are</span><span className="small muted">See the cabin in Google Maps</span></span>
          <span aria-hidden="true">›</span>
        </a>
      )}

      {!sel.start && <PhotosLink />}

      {sel.start && (
        <div className="bottom-action">
          <div className="card" style={{ boxShadow: '0 8px 24px rgba(26,37,51,.12)' }}>
            {sel.end ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="strong">{fmtRangeLong(sel.start, sel.end)}</div>
                    <div className="small muted">{daysBetween(sel.start, sel.end)} night{daysBetween(sel.start, sel.end) > 1 ? 's' : ''}</div>
                  </div>
                  <button className="link-btn quiet" onClick={() => setSel({})}>Clear</button>
                </div>
                <button className="btn block" onClick={() => request(sel.start!, sel.end!)}>Request these dates</button>
              </>
            ) : (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="strong">Arrive {fmtDay(sel.start)}</div>
                  <div className="small muted">Now tap the day you'll head out.</div>
                </div>
                <button className="link-btn quiet" onClick={() => setSel({})}>Clear</button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
