import { MODE } from '../../data';
import { smsHref } from '../../lib/cabin';
import { SignOutButton } from '../SignIn';
import { VersionLabel } from '../../components/UpdateBanner';
import { useSession } from '../../lib/session';

export function Contact() {
  const { snap, me } = useSession();
  const owners = snap.people.filter((p) => p.tier === 'owner');
  return (
    <main className="screen">
      <h1 className="title">Pete &amp; Trisha</h1>
      <p className="muted" style={{ margin: 0 }}>If you need anything, whatsoever, don't hesitate to reach out.</p>
      {owners.map((o) => (
        <div key={o.id} className="card">
          <div className="title-sm">{o.shortName}</div>
          {o.phone || o.email ? (
            <div className="small muted" style={{ userSelect: 'all' }}>{[o.phone, o.email].filter(Boolean).join(' · ')}</div>
          ) : (
            <div className="small muted">Contact details coming soon.</div>
          )}
          {o.phone && (
            <div className="grid-2">
              <a className="btn" href={smsHref(o.phone, `Hi ${o.shortName}, it's ${me.shortName}. `)}>Text</a>
              <a className="btn outline" href={`tel:${o.phone.replace(/[^\d+]/g, '')}`}>Call</a>
            </div>
          )}
          {!o.phone && o.email && <a className="btn outline" href={`mailto:${o.email}`}>Email</a>}
        </div>
      ))}
      {MODE === 'firebase' && <p className="small muted" style={{ margin: '12px 0 0' }}>Signed in as {me.email}</p>}
      {MODE === 'firebase' && <SignOutButton />}
      <VersionLabel />
    </main>
  );
}
