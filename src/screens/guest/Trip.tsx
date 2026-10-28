import { useState } from 'react';
import { Empty, StayTimeline } from '../../components/bits';
import { Icon } from '../../components/Icon';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import { accessUnlocked, fillTemplate, mapsHref, nextTripFor, smsHref, stayPhase } from '../../lib/cabin';
import { daysBetween, fmtDay, fmtRange, today } from '../../lib/dates';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';
import { formatPhone } from '../../lib/phone';
import { googleCalendarHref, icsHref } from '../../lib/calendar';

const appUrl = `${window.location.origin}${window.location.pathname}`;

function seenKey(id: string) {
  return `camp-daniel:welcome-seen:${id}`;
}

/** A guest's finished stays, newest first, each with a way to share photos and tips from it. */
function PastStays() {
  const { snap, me } = useSession();
  const past = snap.bookings
    .filter((b) => b.personId === me.id && b.status === 'approved' && b.end < today())
    .sort((a, b) => b.start.localeCompare(a.start));
  if (past.length === 0) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="eyebrow">Past stays</div>
      <div className="card tight">
        {past.map((b) => (
          <div key={b.id} className="list-row">
            <span className="meta">
              <span className="strong">{fmtRange(b.start, b.end)}{b.start.slice(0, 4) !== today().slice(0, 4) ? `, ${b.start.slice(0, 4)}` : ''}</span>
              <span className="small muted">{b.names || `${b.partySize} people`}</span>
            </span>
            <a className="btn outline small" href={href(`/photos?tab=guests&stay=${b.id}`)}>Share photos &amp; tips</a>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Trip() {
  const { snap, me, host: pete, previewing } = useSession();
  const trip = nextTripFor(me.id, snap.bookings);
  const [firstView] = useState(() => {
    if (!trip) return false;
    try {
      const seen = localStorage.getItem(seenKey(trip.id));
      localStorage.setItem(seenKey(trip.id), '1');
      return !seen;
    } catch {
      return true;
    }
  });
  const [expanded, setExpanded] = useState(false);
  const [outNote, setOutNote] = useState(trip?.departureNote ?? '');

  if (!trip) {
    return (
      <main className="screen">
        <h1 className="title">My trip</h1>
        <Empty title="No trip on the books yet">
          <p className="muted" style={{ margin: 0 }}>Pick some dates and Pete &amp; Trisha will get back to you.</p>
          <a className="btn" href={href('/')}>Find open dates</a>
        </Empty>
        <PastStays />
      </main>
    );
  }

  const phase = stayPhase(trip);
  const unlocked = accessUnlocked(trip);
  const days = daysBetween(today(), trip.start);
  const showFull = firstView || expanded;
  const camerasText = `Hi ${pete?.shortName ?? 'Pete'}, it's ${me.shortName}. We're at Camp Daniel. Could you turn the cameras off? Thanks!`;
  const headingOut = fillTemplate(snap.templates.find((t) => t.id === 'heading-out')?.body ?? '', {}) + (outNote.trim() ? `\n\n${outNote.trim()}` : '');

  return (
    <main className="screen">
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">Your stay · {trip.partySize} people</div>
          <h1 className="title">{fmtRange(trip.start, trip.end)}</h1>
        </div>
        {phase === 'upcoming' && (
          <div style={{ textAlign: 'right' }}>
            <div className="title" style={{ color: 'var(--orange)', lineHeight: 1 }}>{days}</div>
            <div className="small muted strong">day{days === 1 ? '' : 's'} to go</div>
          </div>
        )}
        {phase === 'staying' && <span className="chip pick">You're here!</span>}
      </header>

      {phase === 'requested' ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="strong">Request sent</div>
            <span className="chip blue">Waiting on Pete &amp; Trisha</span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Once they approve, your welcome note, door code and Wi-Fi details show up here.</p>
        </div>
      ) : (
        <StayTimeline booking={trip} />
      )}

      {trip.welcomeNote && (
        <div className="card" style={{ gap: 4 }}>
          <div className="eyebrow">From Pete &amp; Trisha</div>
          <p style={{
            margin: 0, fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-line',
            ...(showFull ? {} : ({ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const)),
          }}>{trip.welcomeNote}</p>
          {!firstView && (
            <button className="link-btn" style={{ minHeight: 32 }} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read more'}</button>
          )}
        </div>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="eyebrow">Before you go</div>
        <div className="card tight">
          {snap.settings.address ? (
            <a className="list-row" href={mapsHref(snap.settings.address)} target="_blank" rel="noreferrer">
              <span className="meta"><span className="strong">Directions</span><span className="small muted">{snap.settings.directions}</span></span>
              <span className="small strong" style={{ color: 'var(--blue)', whiteSpace: 'nowrap' }}>Maps ›</span>
            </a>
          ) : (
            <div className="list-row">
              <span className="meta"><span className="strong">Directions</span><span className="small muted">{snap.settings.directions}</span></span>
            </div>
          )}
          <a className="list-row" href={href('/guide')}>
            <span className="meta"><span className="strong">Cabin guide</span><span className="small muted">Amenities, boat, local favorites</span></span>
            <span aria-hidden="true">›</span>
          </a>
          {trip.status === 'approved' && phase !== 'done' && (
            <div className="list-row cal-row">
              <span className="meta"><span className="strong">Add to my calendar</span><span className="small muted">{fmtRange(trip.start, trip.end)}, with a reminder 3 days before</span></span>
              <span className="cal-btns">
                <a className="btn outline small" href={icsHref(trip, snap.settings.address, appUrl)} download="camp-daniel-stay.ics">Apple / Outlook</a>
                <a className="btn outline small" href={googleCalendarHref(trip, snap.settings.address, appUrl)} target="_blank" rel="noreferrer">Google</a>
              </span>
            </div>
          )}
        </div>
      </section>

      {phase !== 'requested' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="eyebrow">When you arrive</div>
          <div className="card tight">
            <div className="list-row">
              <span className="row"><Icon name="lock" /><span className="meta"><span className="strong">Door code</span>
                {!unlocked && <span className="small muted">Shows {fmtDay(trip.start)} at noon</span>}</span></span>
              {unlocked ? <span className="title-sm num">{trip.doorCode || 'Ask Pete'}</span> : <span className="chip grey">Locked</span>}
            </div>
            <div className="list-row">
              <span className="row"><Icon name="wifi" /><span className="meta"><span className="strong">Wi-Fi</span>
                <span className="small muted">{unlocked ? snap.settings.wifiNetwork || 'Ask Pete' : 'Fiber, strong signal'}</span></span></span>
              {unlocked ? <span className="strong num">{snap.settings.wifiPassword || 'Ask Pete'}</span> : <span className="chip grey">Locked</span>}
            </div>
            <a className="list-row" href={href('/guide')}>
              <span className="meta"><span className="strong">Arrival checklist</span><span className="small muted">Door, well, Wi-Fi</span></span>
              <span className="chip orange">3 steps</span>
            </a>
            {pete?.phone && (
              <a className="list-row" href={smsHref(pete.phone, camerasText)}>
                <span className="meta"><span className="strong">Ask {pete.shortName} to turn off the cameras</span><span className="small muted">Opens a text to {formatPhone(pete.phone)}</span></span>
                <span aria-hidden="true">›</span>
              </a>
            )}
          </div>
        </section>
      )}

      {phase === 'staying' && (
        <a className="card album-link" href={href('/photos?tab=guests')}>
          <span className="ico" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
          </span>
          <span className="meta" style={{ flex: 1 }}><span className="strong">Share a photo or tip from your stay</span><span className="small muted">Other guests will see it under Photos</span></span>
          <span aria-hidden="true">›</span>
        </a>
      )}

      {phase === 'staying' && pete?.phone && (
        <section className="card">
          <div className="title-sm">Heading out?</div>
{snap.guide.some((g) => g.id === 'exit' && !g.hidden) && (
          <a className="list-row" href={href('/guide/exit')} style={{ borderBottom: 0, minHeight: 40 }}>
            <span className="strong">Exit checklist</span><span aria-hidden="true">›</span>
          </a>
          )}
          <div className="field">
            <label htmlFor="outnote">Anything Pete &amp; Trisha should know?</label>
            <textarea id="outnote" className="input" rows={2} value={outNote} onChange={(e) => setOutNote(e.target.value)} placeholder="We ran low on TP, the dock ladder is loose…" />
          </div>
          <a
            className="btn block"
            href={smsHref(pete.phone, headingOut)}
            onClick={(e) => {
              if (previewing) {
                e.preventDefault();
                toast('Guest preview: nothing was sent.');
                return;
              }
              store.updateBooking(trip.id, { departureNote: outNote.trim() || '(no notes)' });
              toast('Thanks! Pete will see your note.');
            }}
          >
            Text {pete.shortName} we're heading out
          </a>
        </section>
      )}
      <PastStays />
    </main>
  );
}
