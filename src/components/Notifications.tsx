import { useEffect, useState } from 'react';
import { MODE } from '../data';
import { disablePush, enablePush, pushStatus, pushSupport, sendTestPush } from '../lib/push';
import { href } from '../lib/router';
import { useSession } from '../lib/session';
import { toast } from './Toast';

const DISMISS_KEY = 'camp-daniel:push-prompt-dismissed';
const DEMO_KEY = 'camp-daniel:demo-push-on';

type State = { on: boolean; blocked: boolean } | null;

/** Notification status on this phone (the sample-data demo just pretends). */
export function usePush() {
  const { me, previewing } = useSession();
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
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      return;
    }
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
    if (previewing) {
      toast('Guest preview: nothing was changed.');
      return;
    }
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
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
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

export const BELL = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
);

export function HomeScreenHint() {
  return (
    <div className="small muted">
      On iPhone, open Camp Daniel from its Home Screen icon to turn these on. Not on your Home Screen yet? In Safari, tap Share, then <b>Add to Home Screen</b>.
    </div>
  );
}

/** A nudge to turn notifications on (owner home; guest's sent and trip screens), until they're on or dismissed. */
export function NotificationsPrompt({ title, sub }: { title?: string; sub?: string }) {
  const { isOwner } = useSession();
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
          <span className="strong">{title ?? (isOwner ? 'Get a notification for new requests' : 'Get a heads-up on your phone')}</span>
          <span className="small muted">{sub ?? (isOwner ? 'Tap it and you land right on the request, in this app.' : 'When your stay is approved, when your door code is ready, and when Pete & Trisha answer you.')}</span>
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
      <div className="row" style={{ gap: 16 }}>
        <a className="link-btn" style={{ minHeight: 32, display: 'inline-flex', alignItems: 'center' }} href={href(isOwner ? '/owner/alerts' : '/alerts')}>Choose what you get</a>
        {(support === 'needs-home-screen' || state.blocked) && (
          <button className="link-btn quiet" style={{ minHeight: 32 }} onClick={dismiss}>Hide this</button>
        )}
      </div>
    </section>
  );
}
