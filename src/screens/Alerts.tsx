import { useEffect, useState } from 'react';
import { BELL, HomeScreenHint, usePush } from '../components/Notifications';
import { toast } from '../components/Toast';
import { setNotifyPref, watchNotifyPrefs, type NotifyKey, type NotifyPrefs } from '../lib/push';
import { useSession } from '../lib/session';

interface Kind {
  key: NotifyKey;
  label: string;
  sub: string;
  /** An email, not a phone notification: works whether or not this phone is on. */
  email?: boolean;
}

const OWNER_KINDS: Kind[] = [
  { key: 'request', label: 'New requests', sub: 'Someone asks for dates or wants to move a stay. Tap to review.' },
  { key: 'question', label: 'Guest questions', sub: 'Someone asks something with the Ask button.' },
  { key: 'cancel', label: 'Cancellations', sub: 'A guest cancels, so those dates are open again.' },
  { key: 'doorCode', label: 'Door code missing', sub: 'A stay starts within 3 days and has no code yet. 9 AM.' },
  { key: 'headingOut', label: 'Heading-out notes', sub: 'A guest taps “heading out” and leaves a note.' },
  { key: 'requestEmail', label: 'Email me new requests too', sub: 'The full details, with Review & approve. Reply goes to the guest.', email: true },
];

const GUEST_KINDS: Kind[] = [
  { key: 'approved', label: 'My stay is approved', sub: 'Tap for your welcome note and trip details.' },
  { key: 'answer', label: 'Answers to my questions', sub: 'Pete & Trisha replied to something you asked.' },
  { key: 'tripSoon', label: 'Trip in 3 days', sub: 'Directions, the guide and what to bring. 9 AM.' },
  { key: 'codeReady', label: 'Door code is ready', sub: 'Noon on arrival day, when the code and Wi-Fi unlock.' },
];

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} disabled={disabled}>
      <span className="knob" />
    </button>
  );
}

/** One place for notifications: this phone on/off, and which kinds you want. */
export function Alerts() {
  const { me, isOwner, previewing } = useSession();
  const { state, busy, support, turnOn, turnOff, test } = usePush();
  const [prefs, setPrefs] = useState<NotifyPrefs | null>(null);
  useEffect(() => watchNotifyPrefs(me.id, setPrefs), [me.id]);
  const kinds = isOwner ? OWNER_KINDS : GUEST_KINDS;

  const flip = async (key: NotifyKey, on: boolean) => {
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      return;
    }
    setPrefs((p) => ({ ...(p ?? {}), [key]: on }));
    try {
      await setNotifyPref(me.id, key, on);
    } catch {
      toast('Couldn’t save that. Check your connection and try again.');
    }
  };

  return (
    <main className="screen">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="title">Notifications</h1>
        <p className="muted" style={{ margin: 0 }}>{isOwner ? 'Know the moment something needs you.' : 'A heads-up on your phone for the things that matter.'}</p>
      </header>

      <section className="card" aria-label="This phone">
        <div className="album-link" style={{ alignItems: 'flex-start' }}>
          <span className="ico">{BELL}</span>
          <span className="meta" style={{ flex: 1 }}>
            <span className="strong">This phone</span>
            <span className="small muted">{state === null ? 'Checking…' : state.on ? 'Notifications are on.' : 'Notifications are off.'}</span>
          </span>
          {state?.on && <span className="chip blue">On</span>}
        </div>
        {support === 'unsupported' ? (
          <div className="small muted">This browser can’t show notifications. Use the Camp Daniel app from your phone’s Home Screen.</div>
        ) : support === 'needs-home-screen' ? (
          <HomeScreenHint />
        ) : state?.blocked ? (
          <div className="small muted">Blocked for Camp Daniel. Turn them on in your phone's Settings › Notifications, then come back here.</div>
        ) : state?.on ? (
          <div className="grid-2">
            <button className="btn outline" onClick={turnOff} disabled={busy}>Turn off</button>
            <button className="btn" onClick={test} disabled={busy}>Send a test</button>
          </div>
        ) : (
          <button className="btn" onClick={turnOn} disabled={busy || state === null}>{busy ? 'Turning on…' : 'Turn on notifications'}</button>
        )}
      </section>

      <section className="card tight" aria-label="What to notify me about">
        <div className="label" style={{ paddingTop: 14 }}>Notify me about</div>
        {kinds.map((k) => {
          const on = prefs ? prefs[k.key] !== false : true;
          return (
            <div key={k.key} className="list-row notify-row">
              <span className="meta" style={{ flex: 1, minWidth: 0 }}>
                <span className="strong">{k.label}</span>
                <span className="small muted">{k.sub}</span>
              </span>
              <Switch on={on} onChange={(v) => flip(k.key, v)} label={k.label} disabled={prefs === null} />
            </div>
          );
        })}
      </section>
      <p className="small muted" style={{ margin: 0 }}>
        {isOwner
          ? 'Your choices apply on every phone you use. Each phone is turned on separately. Emails come whether or not a phone is on.'
          : 'Your choices apply on every phone you use. Each phone is turned on separately.'}
      </p>
    </main>
  );
}
