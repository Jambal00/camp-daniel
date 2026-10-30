import { useEffect, useState } from 'react';
import { MODE } from '../data';
import { disablePush, enablePush, pushStatus, pushSupport, sendTestPush } from '../lib/push';
import { useSession } from '../lib/session';
import { toast } from './Toast';

const DISMISS_KEY = 'camp-daniel:push-prompt-dismissed';
const DEMO_KEY = 'camp-daniel:demo-push-on';

type State = { on: boolean; blocked: boolean } | null;

/** Notification status on this phone (the sample-data demo just pretends). */
function usePush() {
  const { me } = useSession();
  const [state, setState] = useState<State>(null);
  const [busy, setBusy] = useState(false);
  const demo = MODE === 'local';
  const support = demo ? 'ok' : pushSupport();

  const refresh = async () => {
    if (demo) {
      setState({ on: localStorage.getItem(DEMO_KEY) === '1', blocked: false });
      return;
    }
    setState(await pushStatus().catch(() => ({ on: false, blocked: false })));
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      if (demo) localStorage.setItem(DEMO_KEY, '1');
      else await enablePush(me.id);
      toast('Notifications are on. A confirmation should pop up in a moment.');
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      toast(m === 'blocked' ? 'Notifications are blocked for Camp Daniel. Turn them on in Settings › Notifications.' : m === 'dismissed' ? 'No problem. You can turn them on any time.' : m || 'Couldn’t turn them on. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      if (demo) localStorage.removeItem(DEMO_KEY);
      else await disablePush();
      toast('Notifications are off on this phone.');
    } catch {
      toast('Couldn’t turn them off. Try again.');
    } finally {
      setBusy(false);
      void refresh();
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      if (!demo) await sendTestPush();
      toast('Test sent. It should pop up in a few seconds.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t send a test.');
    } finally {
      setBusy(false);
    }
  };
  return { state, busy, support, turnOn, turnOff, test };
}

const BELL = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
);

function HomeScreenHint() {
  return (
    <div className="small muted">
      On iPhone, open Camp Daniel from its Home Screen icon to turn these on. Not on your Home Screen yet? In Safari, tap Share, then <b>Add to Home Screen</b>.
    </div>
  );
}

/** Owner home: a nudge to turn notifications on, until they're on (or dismissed). */
export function NotificationsPrompt() {
  const { state, busy, support, turnOn } = usePush();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!state || state.on || dismissed || support === 'unsupported') return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };
  return (
    <section className="card notify" aria-label="Phone notifications">
      <div className="album-link" style={{ alignItems: 'flex-start' }}>
        <span className="ico">{BELL}</span>
        <span className="meta" style={{ flex: 1 }}>
          <span className="strong">Get a notification for new requests</span>
          <span className="small muted">Tap it and you land right on the request, in this app.</span>
        </span>
      </div>
      {support === 'needs-home-screen' ? (
        <HomeScreenHint />
      ) : state.blocked ? (
        <div className="small muted">Notifications are blocked for Camp Daniel. Turn them on in your phone's Settings › Notifications.</div>
      ) : (
        <div className="grid-2">
          <button className="btn outline" onClick={dismiss}>Not now</button>
          <button className="btn" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>
        </div>
      )}
      {(support === 'needs-home-screen' || state.blocked) && (
        <button className="link-btn quiet" style={{ alignSelf: 'flex-start', minHeight: 32 }} onClick={dismiss}>Hide this</button>
      )}
    </section>
  );
}

/** People screen: notifications on or off for this phone, plus a test. */
export function NotificationsSettings() {
  const { state, busy, support, turnOn, turnOff, test } = usePush();
  return (
    <section className="card" aria-label="Notifications on this phone">
      <div className="album-link" style={{ alignItems: 'flex-start' }}>
        <span className="ico">{BELL}</span>
        <span className="meta" style={{ flex: 1 }}>
          <span className="strong">Notifications on this phone</span>
          <span className="small muted">
            {state === null ? 'Checking…' : state.on ? 'On. You’ll get one when someone asks for dates.' : 'Off. Turn on to get one when someone asks for dates.'}
          </span>
        </span>
        {state?.on && <span className="chip blue">On</span>}
      </div>
      {support === 'unsupported' ? (
        <div className="small muted">This browser can’t show notifications. Use the Camp Daniel app on your phone’s Home Screen.</div>
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
      <div className="small muted">Each phone is set up on its own. The emails keep coming either way.</div>
    </section>
  );
}
