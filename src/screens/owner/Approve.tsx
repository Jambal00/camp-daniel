import { useState } from 'react';
import { toast } from '../../components/Toast';
import { TierChip } from '../../components/bits';
import { Icon } from '../../components/Icon';
import { store } from '../../data';
import { fillTemplate, mailHref, personById, rangeAvailable, smsHref, tentativeOverlaps } from '../../lib/cabin';
import { fmtDay, fmtRange, fmtRangeLong, today } from '../../lib/dates';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

export function Approve({ id }: { id: string }) {
  const { snap } = useSession();
  const b = snap.bookings.find((x) => x.id === id);
  const p = b ? personById(snap.people, b.personId) : undefined;
  const tpl = snap.templates.find((t) => t.id === 'welcome');
  const [welcome, setWelcome] = useState(() => b?.welcomeNote || (b?.replaces ? snap.bookings.find((x) => x.id === b.replaces)?.welcomeNote : '') || fillTemplate(tpl?.body ?? '', { first: p?.shortName ?? 'Friends' }));
  const [code, setCode] = useState(b?.doorCode ?? '');
  const [done, setDone] = useState(false);
  // Remember whether this was already approved when the screen opened,
  // so the confirmation reads right after the status changes.
  const [editing] = useState(b?.status === 'approved');

  if (!b || !p) {
    return (
      <main className="screen">
        <a className="back" href={href('/owner')}>‹ Needs you</a>
        <div className="alert">That request isn't here anymore.</div>
      </main>
    );
  }

  // A change of dates replaces an approved stay; that stay's own days don't count against it.
  const replaced = b.replaces ? snap.bookings.find((x) => x.id === b.replaces && x.status === 'approved') : undefined;
  const free = rangeAvailable(b.start, b.end, snap.bookings.filter((x) => x.id !== replaced?.id), b.id);

  const save = async () => {
    await store.updateBooking(b.id, {
      status: 'approved',
      welcomeNote: welcome.trim(),
      doorCode: code.trim(),
      decidedAt: b.decidedAt ?? new Date().toISOString(),
    });
    // Moving a stay: the old dates go away once the new ones are approved.
    if (replaced) await store.updateBooking(replaced.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
    setDone(true);
  };

  if (done) {
    const msg = `${welcome.trim()}\n\nYour stay: ${fmtRangeLong(b.start, b.end)}. Details are in the Camp Daniel app.`;
    return (
      <main className="screen" style={{ paddingTop: 40, gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, background: 'var(--orange-tint)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={36} />
          </div>
          <h1 className="title">{editing ? 'Saved' : `${p.shortName} is coming up!`}</h1>
          <p className="muted" style={{ margin: 0, maxWidth: '32ch' }}>
            {p.shortName} sees the welcome note in the app now. Automatic email turns on once the backend is connected; until then, send it yourself:
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.email && <a className="btn block" href={mailHref(p.email, 'You’re booked at Camp Daniel!', msg)}>Email {p.shortName} the welcome</a>}
          {p.phone && <a className="btn block outline" href={smsHref(p.phone, msg)}>Text {p.shortName} instead</a>}
          <a className="btn block outline" href={href('/owner')}>Back to requests</a>
        </div>
      </main>
    );
  }

  return (
    <main className="screen with-bottom-action">
      <a className="back" href={href('/owner')}>‹ Needs you</a>

      <div className="card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="strong" style={{ fontSize: 17 }}>{p.name}</div>
          <div className="small muted">{fmtRangeLong(b.start, b.end)} · {b.partySize} people</div>
          {b.names && <div className="small muted">{b.names}</div>}
        </div>
        <TierChip tier={p.tier} />
      </div>
      {b.note && <div className="callout">“{b.note}”</div>}
      {!free && <div className="alert"><Icon name="alert" size={20} />These dates overlap another stay. Check the calendar before approving.</div>}
      {b.status === 'pending' && tentativeOverlaps(b.start, b.end, snap.bookings).map((h) => (
        <div key={h.id} className="callout">
          These dates are a choice in the <b>{h.names.replace(/^Held for /, '')}</b> vote ({fmtRange(h.start, h.end)}). Approving books them, and that choice drops out of the vote.{' '}
          {h.groupTripId && <a href={href(`/owner/group/${h.groupTripId}`)}>See the vote</a>}
        </div>
      ))}

      <div className="field">
        <div className="section-label">
          <label htmlFor="welcome">1 · Welcome note</label>
          <span className="small muted">From your template</span>
        </div>
        <textarea id="welcome" className="input" rows={6} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="code">2 · Door code <span className="muted" style={{ fontWeight: 400 }}>(can wait)</span></label>
        <input id="code" className="input num" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Set it in the Philips app, then type it here" />
        <div className="small muted">They see it from noon on {fmtDay(b.start)} until checkout. Skip it for now and it shows as a to-do on your home screen.</div>
      </div>

      <div className="field">
        <div className="label">3 · Send it</div>
        <div className="small muted">
          {p.shortName} sees the welcome note in the app as soon as you save. On the next screen you can also email or text it from your phone. Automatic texts are coming later.
        </div>
      </div>

      {b.status === 'approved' && (
        <div className="field">
          <div className="label">4 · Neighbors</div>
          <label className="check" style={{ borderBottom: 0 }}>
            <input
              type="checkbox"
              checked={!!b.neighborsToldOn}
              onChange={(e) => {
                const on = e.target.checked;
                store.updateBooking(b.id, { neighborsToldOn: on ? today() : '' }).then(
                  () => toast(on ? 'Marked as sent to the neighbors.' : 'Marked as not sent.'),
                  () => toast('Couldn’t save that. Try again.'),
                );
              }}
            />
            <span>
              Neighbors told about this stay
              <span className="small muted" style={{ display: 'block' }}>
                {b.neighborsToldOn ? `Sent ${fmtDay(b.neighborsToldOn)}` : 'Check this once you’ve texted or emailed them'}
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="bottom-action no-tabs">
        <button className="btn block" onClick={save} disabled={!free}>{editing ? 'Save changes' : 'Approve & send welcome'}</button>
      </div>
    </main>
  );
}
