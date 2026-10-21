import { useState } from 'react';
import { MonthCalendar, type DayLook } from '../../components/MonthCalendar';
import { toast } from '../../components/Toast';
import { holding, isDayTaken, nextTripFor, openWeekends, rangeAvailable } from '../../lib/cabin';
import { addDays, daysBetween, fmtDay, fmtRange, fmtRangeLong, onDayOf, today, type ISODate } from '../../lib/dates';
import { go, href } from '../../lib/router';
import { useSession } from '../../lib/session';

export function Home() {
  const { snap, me } = useSession();
  const [sel, setSel] = useState<{ start?: ISODate; end?: ISODate }>({});
  const t = today();
  const trip = nextTripFor(me.id, snap.bookings);
  const mine = snap.bookings.filter((b) => b.personId === me.id && (b.status === 'pending' || b.status === 'approved'));
  const others = holding(snap.bookings).filter((b) => b.personId !== me.id);
  const featured = openWeekends(snap.bookings, 1)[0];
  const openCount = openWeekends(snap.bookings, 8, t).filter((f) => daysBetween(t, f) < 31).length;

  const look = (d: ISODate): DayLook => {
    if (d < t) return { className: 'past', disabled: true };
    if (sel.start && (d === sel.start || d === sel.end)) return { className: 'selected', state: 'selected' };
    if (sel.start && sel.end && d > sel.start && d < sel.end) return { className: 'in-range', state: 'selected' };
    const m = mine.find((b) => onDayOf(d, b.start, b.end));
    if (m) return { className: `mine ${m.status}`, state: m.status === 'pending' ? 'your request' : 'your stay' };
    if (others.some((b) => onDayOf(d, b.start, b.end))) return { className: 'booked', state: 'booked' };
    return { className: '', state: 'open' };
  };

  const pick = (d: ISODate) => {
    if (!sel.start || sel.end || d <= sel.start) {
      if (isDayTaken(d, snap.bookings)) {
        toast('That day is already booked.');
        return;
      }
      setSel({ start: d });
      return;
    }
    if (!rangeAvailable(sel.start, d, snap.bookings)) {
      toast('Those dates run into a booked stay. Try a shorter trip.');
      return;
    }
    setSel({ start: sel.start, end: d });
  };

  const request = (start: ISODate, end: ISODate) => go(`/request?start=${start}&end=${end}`);

  return (
    <main className={`screen${sel.start ? ' with-bottom-action' : ''}`}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="eyebrow">Camp Daniel · #sconnicabin</div>
        <h1 className="title">Hi {me.shortName}! Come on up.</h1>
      </header>

      {trip?.status === 'approved' && (
        <a href={href('/trip')} className="card" style={{ textDecoration: 'none', color: 'inherit', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div className="eyebrow">Your stay</div>
            <div className="strong" style={{ fontSize: 17 }}>{fmtRangeLong(trip.start, trip.end)}</div>
          </div>
          <span className="chip solid">Approved</span>
        </a>
      )}

      {trip?.status === 'pending' && (
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

      {featured && (
        <div className="highlight">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ color: 'var(--orange-ink)' }}>Next open weekend</div>
            <div className="title-sm" style={{ fontSize: 22 }}>{fmtRange(featured, addDays(featured, 2))}</div>
            <div className="small" style={{ color: '#6b3a10' }}>
              Fri to Sun{openCount > 1 ? ` · ${openCount} open weekends this month` : ''}
            </div>
          </div>
          <button className="btn" onClick={() => request(featured, addDays(featured, 2))}>Request</button>
        </div>
      )}

      <section className="card" aria-label="Availability calendar">
        <MonthCalendar look={look} onPick={pick} noPast />
        <div className="legend">
          <span><i className="sw" style={{ background: '#fff', border: '1px solid var(--line)' }} />Open</span>
          <span><i className="sw" style={{ background: 'var(--booked)' }} />Booked</span>
          {mine.some((b) => b.status === 'approved') && <span><i className="sw" style={{ background: 'var(--blue)' }} />Your stay</span>}
          {mine.some((b) => b.status === 'pending') && <span><i className="sw" style={{ border: '2px dashed var(--blue)' }} />Your request</span>}
        </div>
      </section>
      {!sel.start && <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Or tap any open day to pick your own dates.</p>}

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
