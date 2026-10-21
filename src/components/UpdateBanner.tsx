import { useEffect, useState } from 'react';

/** This build's id, baked in at build time. */
export const BUILD: string = __BUILD__;

/** Small "Version abc1234" line for the bottom of a screen. */
export function VersionLabel() {
  return <p className="small muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>Camp Daniel version {BUILD}</p>;
}

/**
 * Checks for a newer deploy when the app opens, when it comes back to the
 * foreground, and every 10 minutes. Phones (especially iPhone home-screen
 * apps) can keep showing an old copy; this offers a one-tap update instead.
 */
export function UpdateBanner() {
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== BUILD) setLatest(build);
      } catch {
        /* offline or local dev: nothing to do */
      }
    };
    void check();
    const onShow = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onShow);
    const timer = window.setInterval(check, 10 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onShow);
      window.clearInterval(timer);
    };
  }, []);

  if (!latest) return null;
  // A fresh query string makes the phone fetch the new page instead of its saved copy.
  const update = () => window.location.replace(`${window.location.pathname}?v=${latest}${window.location.hash}`);
  return (
    <div
      role="status"
      style={{
        position: 'sticky', top: 0, zIndex: 30, background: 'var(--orange-tint)', color: 'var(--orange-ink)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        padding: '10px var(--gutter)', paddingTop: 'max(10px, env(safe-area-inset-top, 0px))', fontSize: 14, fontWeight: 600,
      }}
    >
      <span>A new version of Camp Daniel is ready.</span>
      <button className="btn small" onClick={update}>Update</button>
    </div>
  );
}
