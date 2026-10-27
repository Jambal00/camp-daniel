import { useState } from 'react';
import { TierChip } from '../../components/bits';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import { holding, needsDecision, personById, smsHref, weekendsAddedBy, weekendsUsed } from '../../lib/cabin';
import { addDays, fmtRange, fromISO, today } from '../../lib/dates';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

export function OwnerHome() {
  const { snap, me } = useSession();
  const year = fromISO(today()).getFullYear();
  const pending = needsDecision(snap);
  const used = weekendsUsed(snap.bookings, year);
  const goal = snap.settings.weekendGoal;
  const gain = weekendsAddedBy(pending, snap.bookings, year);
  const [openId, setOpenId] = useState<string | null>(null);
  const upcoming = holding(snap.bookings)
    .filter((b) => b.end >= today() && b.status === 'approved')
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);
  const departed = snap.bookings.filter((b) => b.departureNote && b.end >= addDays(today(), -30));

  const decline = async (id: string) => {
    await store.updateBooking(id, { status: 'declined', decidedAt: new Date().toISOString() });
    setOpenId(null);
    toast('Declined. Let them know with a quick text.');
  };

  return (
    <>
      <div className="band">
        <div className="eyebrow">Camp Daniel · Owner</div>
        {snap.settings.showGoal ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="title-sm num">{used} of {goal} weekends used</div>
              <div className="sub">{year} goal</div>
            </div>
            <div className="goal-track" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={used} aria-label="Weekends used this year">
              <div className="goal-fill" style={{ width: `${Math.min(100, (used / goal) * 100)}%` }} />
            </div>
            {gain > 0 && <div className="sub">Approving the requests below gets you to {used + gain}.</div>}
          </div>
        ) : (
          <div className="title-sm" style={{ fontSize: 26 }}>Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {me.shortName}</div>
        )}
      </div>

      <main className="screen" style={{ paddingTop: 16 }}>
        <div className="section-label">
          <h1 className="title-sm" style={{ fontSize: 24 }}>Needs you</h1>
          {pending.length > 0 && <span className="chip pick num">{pending.length}</span>}
        </div>

        {pending.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="strong">All caught up</div>
            <div className="small muted">New requests show up here.</div>
          </div>
        )}

        {pending.map((b) => {
          const p = personById(snap.people, b.personId);
          return (
            <div key={b.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="strong" style={{ fontSize: 17 }}>{p?.name ?? 'Unknown'}</div>
                  <div className="small muted">{fmtRange(b.start, b.end)} · {b.partySize} people</div>
                </div>
                {p && <TierChip tier={p.tier} />}
              </div>
              {b.note && <div style={{ fontSize: 14, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>“{b.note}”</div>}
              <a className="btn" href={href(`/owner/approve/${b.id}`)}>Review &amp; approve</a>
              {openId === b.id ? (
                <div className="grid-2">
                  <button className="btn outline small" onClick={() => { setOpenId(null); toast('Left it pending. It stays here until you decide.'); }}>Not yet</button>
                  <button className="btn outline small" onClick={() => decline(b.id)}>Decline</button>
                </div>
              ) : (
                <button className="link-btn quiet" style={{ textAlign: 'center' }} onClick={() => setOpenId(b.id)}>Not yet or decline</button>
              )}
            </div>
          );
        })}

        {departed.length > 0 && (
          <>
            <div className="eyebrow" style={{ paddingTop: 6 }}>Notes from departing guests</div>
            <div className="card tight">
              {departed.map((b) => (
                <div key={b.id} className="list-row" style={{ alignItems: 'flex-start', padding: '10px 0' }}>
                  <span className="meta"><span className="strong">{personById(snap.people, b.personId)?.shortName} · {fmtRange(b.start, b.end)}</span><span className="small">{b.departureNote}</span></span>
                </div>
              ))}
            </div>
          </>
        )}

        {upcoming.length > 0 && (
          <>
            <div className="eyebrow" style={{ paddingTop: 6 }}>Coming up</div>
            <div className="card tight">
              {upcoming.map((b) => {
                const p = personById(snap.people, b.personId);
                const todo = !b.doorCode ? 'Add door code' : '';
                return (
                  <a key={b.id} className="list-row" href={href(`/owner/approve/${b.id}`)}>
                    <span className="meta">
                      <span className="strong">{b.names || p?.name}</span>
                      <span className="small muted">{fmtRange(b.start, b.end)} · {b.partySize} people</span>
                      <span className="small" style={{ fontWeight: 600, color: b.neighborsToldOn ? 'var(--teal)' : 'var(--orange-ink)' }}>
                        {b.neighborsToldOn ? '✓ Neighbors told' : 'Neighbors not told yet'}
                      </span>
                    </span>
                    {todo ? <span className="chip orange">{todo}</span> : <span className="chip blue">Ready</span>}
                  </a>
                );
              })}
            </div>
            {upcoming[0] && (() => {
              const next = upcoming[0];
              const who = next.names || personById(snap.people, next.personId)?.name;
              // Once the neighbors are told, the small line on the stay card is enough.
              return next.neighborsToldOn ? null : (
                <a
                  className="btn outline"
                  href={smsHref('', `Hi neighbors! Friends of ours, ${who}, will be at our place ${fmtRange(next.start, next.end)}. – Pete & Trisha`)}
                  onClick={() => { store.updateBooking(next.id, { neighborsToldOn: today() }).catch(() => toast('Couldn’t mark the neighbors as told. Try again.')); }}
                >
                  Text the neighbors about {fmtRange(next.start, next.end)}
                </a>
              );
            })()}
          </>
        )}
      </main>
    </>
  );
}
