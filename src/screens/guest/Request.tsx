import { useState } from 'react';
import { toast } from '../../components/Toast';
import { Stepper } from '../../components/bits';
import { store } from '../../data';
import { rangeAvailable } from '../../lib/cabin';
import { daysBetween, fmtRangeLong, rangesOverlap, today } from '../../lib/dates';
import { go, href, type Route } from '../../lib/router';
import { useSession } from '../../lib/session';

export function Request({ route }: { route: Route }) {
  const { snap, me, previewing } = useSession();
  const start = route.query.get('start') ?? '';
  const end = route.query.get('end') ?? '';
  const last = [...snap.bookings].filter((b) => b.personId === me.id).sort((a, b) => b.start.localeCompare(a.start))[0];
  const [party, setParty] = useState(last?.partySize ?? 4);
  const [names, setNames] = useState(last?.names ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start >= today() && end > start;
  const free = valid && rangeAvailable(start, end, snap.bookings);
  const competing = valid && snap.bookings.some((b) => b.status === 'pending' && b.personId !== me.id && rangesOverlap(start, end, b.start, b.end));
  const nights = valid ? daysBetween(start, end) : 0;

  const send = async () => {
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
    setBusy(true);
    const b = await store.createBooking({
      personId: me.id, start, end, partySize: party, names: names.trim(), note: note.trim(),
      status: 'pending', welcomeNote: '', doorCode: '',
    });
    go(`/sent/${b.id}`);
  };

  return (
    <main className="screen with-bottom-action">
      <a className="back" href={href('/')}>‹ Calendar</a>
      <h1 className="title" style={{ fontSize: 30 }}>Request a stay</h1>

      {!valid ? (
        <div className="alert">Those dates didn't come through. Head back to the calendar and pick them again.</div>
      ) : (
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
          <div>
            <div className="strong" style={{ fontSize: 17 }}>{fmtRangeLong(start, end)}</div>
            <div className="small muted">{nights} night{nights > 1 ? 's' : ''} · {free ? 'open' : 'no longer open'}</div>
          </div>
          <a href={href('/')} className="strong small" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Change</a>
        </div>
      )}
      {valid && !free && <div className="alert">Someone just booked part of these dates. Pick different dates on the calendar.</div>}
      {competing && free && <div className="callout">Someone else has asked about these dates too. Send yours anyway; Pete &amp; Trisha will sort it out.</div>}

      <div className="field">
        <label htmlFor="party">How many people?</label>
        <div className="row">
          <Stepper id="party" value={party} onChange={setParty} max={9} />
          {last && party === last.partySize && <span className="small muted">Same as last time</span>}
        </div>
        <div className="small muted">Comfy for 5–6, room for 7. The man-cave couch fits two more.</div>
      </div>

      <div className="field">
        <label htmlFor="names">Who's coming? <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="names" className="input" value={names} onChange={(e) => setNames(e.target.value)} placeholder="Names of your crew" />
      </div>

      {noteOpen ? (
        <div className="field">
          <label htmlFor="note">Note to Pete &amp; Trisha</label>
          <textarea id="note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Celebrating something? Bringing the dog? Let them know." autoFocus />
        </div>
      ) : (
        <button className="link-btn" onClick={() => setNoteOpen(true)}>+ Add a note to Pete &amp; Trisha</button>
      )}

      <div className="callout">Pete &amp; Trisha approve every stay. You'll hear from them as soon as they do.</div>

      <div className="bottom-action no-tabs">
        <button className="btn block" disabled={!free || busy} onClick={send}>Send request</button>
      </div>
    </main>
  );
}
