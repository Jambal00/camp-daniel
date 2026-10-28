import { useEffect, useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { Reminder } from '../../data/types';
import { addDays, fmtDay, fromISO, toISO, today, type ISODate } from '../../lib/dates';
import { useSession } from '../../lib/session';

function inMonths(n: number): ISODate {
  const d = fromISO(today());
  d.setMonth(d.getMonth() + n);
  return toISO(d);
}

const CHOICES: { label: string; day: () => ISODate }[] = [
  { label: 'In 2 weeks', day: () => addDays(today(), 14) },
  { label: 'In a month', day: () => inMonths(1) },
  { label: 'In 2 months', day: () => inMonths(2) },
];

function useReminders(personId: string) {
  const [rs, setRs] = useState<Reminder[]>([]);
  useEffect(() => store.watchReminders(personId, setRs), [personId]);
  return rs.filter((r) => r.remindOn > today());
}

/** "Not ready yet?" Email the guest a calendar invite to check back on a day they choose. */
export function RemindMe() {
  const { me, previewing } = useSession();
  const reminders = useReminders(me.id);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<ISODate | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const min = addDays(today(), 1);
  const max = addDays(today(), 365);
  const chosen = pick ?? (custom >= min && custom <= max ? custom : null);

  const save = async () => {
    if (!chosen) return;
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
    setBusy(true);
    try {
      await store.addReminder({ personId: me.id, email: me.email || me.id, name: me.name.replace(/\s*\(example\)/, ''), remindOn: chosen });
      setOpen(false);
      setPick(null);
      setCustom('');
      toast('Done. Check your email for the calendar invite.');
    } catch {
      toast('Couldn’t set that up. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Reminder) => {
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      return;
    }
    try {
      await store.deleteReminder(r.id);
      toast(r.status === 'sent' ? 'Reminder cancelled. We emailed you a cancellation for your calendar.' : 'Reminder cancelled.');
    } catch {
      toast('Couldn’t cancel it. Try again.');
    }
    setConfirmId(null);
  };

  return (
    <section className="card remind" aria-label="Remind me later">
      <div className="album-link" style={{ alignItems: 'flex-start' }}>
        <span className="ico" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        </span>
        <span className="meta" style={{ flex: 1 }}>
          <span className="strong">Not ready to pick dates?</span>
          <span className="small muted">We'll email you a calendar reminder to check back, on the day you choose.</span>
        </span>
      </div>

      {reminders.map((r) => (
        <div key={r.id} className="remind-row">
          <span className="meta">
            <span className="strong">Reminder for {fmtDay(r.remindOn)}</span>
            <span className="small muted">
              {r.status === 'sent' ? `Invite emailed to ${r.email}` : r.status === 'failed' ? 'Couldn’t send the invite. Cancel and try again.' : 'Sending the invite…'}
            </span>
          </span>
          {confirmId === r.id ? (
            <span className="row" style={{ gap: 6, flexShrink: 0 }}>
              <button className="btn outline small" onClick={() => setConfirmId(null)}>Keep</button>
              <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={() => remove(r)}>Cancel it</button>
            </span>
          ) : (
            <button className="link-btn" style={{ color: 'var(--red-ink)', flexShrink: 0, minHeight: 36 }} onClick={() => setConfirmId(r.id)}>Cancel</button>
          )}
        </div>
      ))}

      {open ? (
        <div className="remind-pick">
          <div className="label">Remind me</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {CHOICES.map((c) => {
              const d = c.day();
              return (
                <button key={c.label} type="button" className={`btn small${pick === d ? '' : ' outline'}`} aria-pressed={pick === d} onClick={() => { setPick(d); setCustom(''); }}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="field">
            <label htmlFor="remind-date" className="small">Or pick a date</label>
            <input id="remind-date" className="input" type="date" min={min} max={max} value={custom} onChange={(e) => { setCustom(e.target.value); setPick(null); }} />
          </div>
          <div className="small muted">{chosen ? `${fmtDay(chosen)} at 9:00 AM. The invite goes to ${me.email || 'your email'}.` : 'Choose when you’d like the reminder.'}</div>
          <div className="grid-2">
            <button className="btn outline" onClick={() => { setOpen(false); setPick(null); setCustom(''); }}>Never mind</button>
            <button className="btn" onClick={save} disabled={!chosen || busy}>{busy ? 'Setting it up…' : 'Email me the invite'}</button>
          </div>
        </div>
      ) : (
        <button className="btn outline" onClick={() => setOpen(true)}>{reminders.length ? 'Add another reminder' : 'Remind me later'}</button>
      )}
    </section>
  );
}
