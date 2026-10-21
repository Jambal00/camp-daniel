import { Icon } from '../../components/Icon';
import { fmtDay, fmtRange } from '../../lib/dates';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

export function Sent({ id }: { id: string }) {
  const { snap } = useSession();
  const b = snap.bookings.find((x) => x.id === id);
  if (!b) {
    return (
      <main className="screen">
        <div className="alert">We couldn't find that request.</div>
        <a className="btn" href={href('/')}>Back to calendar</a>
      </main>
    );
  }
  return (
    <main className="screen" style={{ paddingTop: 48, gap: 22 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
        <div style={{ width: 88, height: 88, borderRadius: 999, background: 'var(--orange-tint)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={44} />
        </div>
        <h1 className="title" style={{ fontSize: 32 }}>Request sent!</h1>
        <p className="muted" style={{ margin: 0, maxWidth: '30ch' }}>Pete &amp; Trisha will take a look. You'll hear from them the moment they say yes.</p>
      </div>

      <div className="card">
        <div className="eyebrow">What happens next</div>
        <div className="steps-v">
          <div>
            <div className="rail"><span className="node done" /></div>
            <div className="txt"><div className="strong">Request sent</div><div className="small muted">Today · {fmtRange(b.start, b.end)} · {b.partySize} people</div></div>
          </div>
          <div>
            <div className="rail"><span className="node next" /></div>
            <div className="txt"><div className="strong">Pete &amp; Trisha approve</div><div className="small muted">You'll get a welcome note</div></div>
          </div>
          <div>
            <div className="rail"><span className="node" /></div>
            <div className="txt"><div className="strong">Arrive {fmtDay(b.start)}</div><div className="small muted">Door code and Wi-Fi unlock at noon</div></div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        <a className="btn block" href={href('/guide')}>Peek at the cabin guide</a>
        <a className="btn block outline" href={href('/')}>Back to calendar</a>
      </div>
    </main>
  );
}
