import { useEffect, useState } from 'react';
import { UpdateBanner, VersionLabel } from '../components/UpdateBanner';

type Fb = typeof import('../data/firebase');

/** Sign in with Google or an emailed link. Invite-only: data stays locked unless Pete & Trisha added you. */
export function SignIn() {
  const [fb, setFb] = useState<Fb | null>(null);
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<'choose' | 'sent' | 'confirm' | 'working'>('choose');
  const [error, setError] = useState('');
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    import('../data/firebase').then(async (m) => {
      setFb(m);
      if (m.arrivedFromEmailLink()) {
        const remembered = m.rememberedEmail();
        if (remembered) {
          setStage('working');
          try {
            await m.completeEmailLink(remembered);
          } catch (e) {
            setStage('choose');
            setError(friendly(e));
          }
        } else {
          setStage('confirm');
        }
      }
    });
  }, []);

  const google = async () => {
    if (!fb) return;
    setError('');
    try {
      await fb.signInWithGoogle();
    } catch (e) {
      setError(friendly(e));
    }
  };

  const sendLink = async () => {
    if (!fb || !email.trim()) return;
    setError('');
    setStage('working');
    try {
      await fb.sendEmailLink(email.trim().toLowerCase());
      setStage('sent');
    } catch (e) {
      setStage('choose');
      setError(friendly(e));
    }
  };

  const pasteLink = async () => {
    if (!fb) return;
    const link = pasted.trim();
    if (!fb.isEmailLink(link)) {
      setError('That doesn’t look like the sign-in link. In the email, press and hold the link, choose Copy Link, then paste it here.');
      return;
    }
    setError('');
    setStage('working');
    try {
      await fb.completeEmailLink(email.trim().toLowerCase(), link);
    } catch (e) {
      setStage('sent');
      setError(friendly(e));
    }
  };

  const confirm = async () => {
    if (!fb || !email.trim()) return;
    setStage('working');
    try {
      await fb.completeEmailLink(email.trim().toLowerCase());
    } catch (e) {
      setStage('confirm');
      setError(friendly(e));
    }
  };

  return (
    <div className="app">
      <UpdateBanner />
      <div className="band" style={{ paddingTop: 48, paddingBottom: 28 }}>
        <div className="eyebrow">#sconnicabin</div>
        <h1 className="title" style={{ color: '#fff', fontSize: 34 }}>Camp Daniel</h1>
        <div className="sub" style={{ fontSize: 15 }}>Plan a stay at the cabin. Pete &amp; Trisha approve every visit.</div>
      </div>
      <main className="screen" style={{ paddingTop: 24 }}>
        {error && <div className="alert">{error}</div>}

        {stage === 'sent' && (
          <div className="card">
            <div className="title-sm">Check your email</div>
            <p className="muted" style={{ margin: 0 }}>We sent a sign-in link to <b>{email}</b>. Open it on this phone and you're in. It can take a minute, and sometimes lands in spam.</p>
            <button className="link-btn" onClick={() => setStage('choose')}>Use a different way</button>
          </div>
        )}

        {stage === 'sent' && (
          <div className="card">
            <div className="strong">Using Camp Daniel from your home screen?</div>
            <p className="small muted" style={{ margin: 0 }}>
              On iPhone the link opens in Safari, not here. Instead, press and hold the link in the email, choose <b>Copy Link</b>, and paste it below.
            </p>
            <div className="field">
              <label htmlFor="paste">Sign-in link</label>
              <input id="paste" className="input" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the link from your email" autoComplete="off" />
            </div>
            <button className="btn block" onClick={pasteLink} disabled={!pasted.trim()}>Sign in here</button>
          </div>
        )}

        {stage === 'confirm' && (
          <div className="card">
            <div className="title-sm">Confirm your email</div>
            <p className="muted" style={{ margin: 0 }}>You opened the link on a different device. Type the email you used so we can finish signing you in.</p>
            <div className="field">
              <label htmlFor="cemail">Email</label>
              <input id="cemail" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn block" onClick={confirm} disabled={!email.trim()}>Sign in</button>
          </div>
        )}

        {stage === 'working' && <div className="card muted">Signing you in…</div>}

        {stage === 'choose' && (
          <>
            <button className="btn block" onClick={google} disabled={!fb}>Continue with Google</button>
            <div className="row" style={{ gap: 10 }}>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span className="small muted">or get a link by email</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email Pete & Trisha have for you" />
            </div>
            <button className="btn block outline" onClick={sendLink} disabled={!fb || !email.trim()}>Email me a sign-in link</button>
            <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Camp Daniel is invite-only. No passwords to remember.</p>
          </>
        )}
        <VersionLabel />
      </main>
    </div>
  );
}

export function NotInvited({ email, setUp }: { email: string; setUp?: boolean }) {
  return (
    <div className="app">
      <main className="screen" style={{ paddingTop: 48 }}>
        <h1 className="title">{setUp ? 'Almost ready' : 'You’re not on the list yet'}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {setUp
            ? 'Pete & Trisha are still setting up the cabin. Check back soon.'
            : <>You're signed in as <b>{email}</b>, but Pete &amp; Trisha haven't added that address. Ask them to invite it, or sign out and try the email they have for you.</>}
        </p>
        <SignOutButton />
      </main>
    </div>
  );
}

export function SignOutButton() {
  return (
    <button
      className="btn outline"
      onClick={async () => {
        const m = await import('../data/firebase');
        await m.signOut();
      }}
    >
      Sign out
    </button>
  );
}

function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'Google sign-in was closed before it finished.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google window. Allow pop-ups for this site, or use the email link.';
  if (code.includes('quota') || code.includes('too-many')) return 'Too many sign-in emails today. Try Continue with Google, or try again tomorrow.';
  if (code.includes('invalid-email')) return 'That email address doesn’t look right.';
  if (code.includes('invalid-action-code') || code.includes('expired')) return 'That sign-in link has expired or was already used. Ask for a new one.';
  if (code.includes('unauthorized-domain')) return 'This site isn’t allowed to sign in yet. Pete needs to add it in Firebase.';
  return 'Sign-in didn’t work. Please try again.';
}
