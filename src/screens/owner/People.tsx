import { useEffect, useState } from 'react';
import { toast } from '../../components/Toast';
import { MODE, store } from '../../data';
import { SignOutButton } from '../SignIn';
import { VersionLabel } from '../../components/UpdateBanner';
import { NotificationsSettings } from '../../components/Notifications';
import { TIER_LABEL, type Tier, type Visit } from '../../data/types';
import { holding, mailHref, smsHref } from '../../lib/cabin';
import { fmtRange, fromISO, today } from '../../lib/dates';
import { useSession } from '../../lib/session';
import { formatPhone, formatPhoneAsTyped } from '../../lib/phone';

const ORDER: Tier[] = ['owner', 'kids', 'friends'];

function inviteText(first: string) {
  return `Hi ${first}! Pete & Trisha here. We'd love for you to use our cabin at Camp Daniel. Pick a weekend in the app: ${window.location.origin}${window.location.pathname}`;
}

/** "today", "yesterday", "Tue", or "Oct 20" for a sign-in time. */
function whenLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

function SignedIn({ visit }: { visit: Visit | undefined }) {
  return visit ? (
    <span className="seen on"><span className="dot" aria-hidden="true" />Signed in · last opened {whenLabel(visit.lastSeen)}</span>
  ) : (
    <span className="seen"><span className="dot" aria-hidden="true" />Hasn't signed in yet</span>
  );
}

export function People() {
  const { snap, me } = useSession();
  const visits = snap.visits ?? {};
  const guests = snap.people.filter((p) => p.tier !== 'owner');
  const signedIn = guests.filter((p) => visits[p.id]).length;
  const year = fromISO(today()).getFullYear();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', tier: 'friends' as Tier });
  const [editId, setEditId] = useState<string | null>(null);

  // Tidy any numbers saved before the standard format existed (runs once per visit).
  useEffect(() => {
    snap.people
      .filter((p) => p.phone && formatPhone(p.phone) !== p.phone)
      .forEach((p) => void store.updatePerson(p.id, { phone: formatPhone(p.phone) }).catch(() => undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [edit, setEdit] = useState({ name: '', email: '', phone: '' });
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Stays that would be cancelled if this person is removed.
  const upcomingFor = (id: string) =>
    snap.bookings.filter((b) => b.personId === id && b.end >= today() && (b.status === 'pending' || b.status === 'approved')).sort((a, b) => a.start.localeCompare(b.start));

  const removePerson = async (id: string) => {
    const who = snap.people.find((p) => p.id === id);
    try {
      for (const b of upcomingFor(id)) await store.updateBooking(b.id, { status: 'declined', decidedAt: new Date().toISOString() });
      await store.deletePerson(id);
      setEditId(null);
      setConfirmRemove(false);
      toast(`${who?.shortName ?? 'They'} ${who ? 'is' : 'are'} off the list.`);
    } catch {
      toast('Couldn’t remove them. Check your connection and try again.');
    }
  };

  const startEdit = (id: string) => {
    const p = snap.people.find((x) => x.id === id);
    setEdit({ name: p?.name ?? '', email: p?.email ?? '', phone: p?.phone ?? '' });
    setConfirmRemove(false);
    setEditId(id);
  };
  const saveEdit = async () => {
    if (!editId) return;
    const name = edit.name.trim();
    await store.updatePerson(editId, { ...(name ? { name, shortName: name.split(/\s+/)[0] } : {}), email: edit.email.trim(), phone: formatPhone(edit.phone) });
    setEditId(null);
    toast('Contact details saved.');
  };

  const staysThisYear = (id: string) => holding(snap.bookings).filter((b) => b.personId === id && fromISO(b.start).getFullYear() === year).length;

  const add = async () => {
    if (!form.name.trim()) return;
    if (MODE === 'firebase' && !form.email.trim()) {
      toast('Add their email. It is how they sign in.');
      return;
    }
    const name = form.name.trim();
    await store.addPerson({ ...form, name, shortName: name.split(/\s+/)[0], email: form.email.trim().toLowerCase(), phone: formatPhone(form.phone) });
    setForm({ name: '', email: '', phone: '', tier: 'friends' });
    setAdding(false);
    toast(`Added ${name}. Send them an invite below.`);
  };

  return (
    <>
      <div className="band">
        <div className="eyebrow">Owner · People</div>
        <h1 className="title" style={{ color: '#fff' }}>Who's invited</h1>
        <div className="sub">Only people you add can request a stay.</div>
        {guests.length > 0 && <div className="sub num">{signedIn} of {guests.length} guest{guests.length === 1 ? ' has' : 's have'} signed in.</div>}
      </div>
      <main className="screen" style={{ paddingTop: 14 }}>
        {adding ? (
          <div className="card">
            <div className="title-sm">Invite someone</div>
            <div className="field"><label htmlFor="pn">Name</label><input id="pn" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="pe">Email</label><input id="pe" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="pp">Mobile</label><input id="pp" className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneAsTyped(e.target.value) })} placeholder="(952) 555-0123" /></div>
            <div className="field">
              <label htmlFor="pt">Dibs group</label>
              <select id="pt" className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as Tier })}>
                <option value="kids">{TIER_LABEL.kids}</option>
                <option value="friends">{TIER_LABEL.friends}</option>
              </select>
            </div>
            <div className="grid-2">
              <button className="btn outline" onClick={() => setAdding(false)}>Cancel</button>
              <button className="btn" onClick={add} disabled={!form.name.trim()}>Add</button>
            </div>
          </div>
        ) : (
          <button className="btn" onClick={() => setAdding(true)}>Invite someone</button>
        )}

        {ORDER.map((tier) => {
          const list = snap.people.filter((p) => p.tier === tier);
          if (!list.length) return null;
          return (
            <section key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="section-label">
                <div className="eyebrow">{TIER_LABEL[tier]}</div>
                <div className="small muted">Stays in {year}</div>
              </div>
              <div className="card tight">
                {list.map((p) =>
                  editId === p.id ? (
                    <div key={p.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '12px 0' }}>
                      <div className="field"><label htmlFor={`nm-${p.id}`}>Name</label><input id={`nm-${p.id}`} className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
                      <div className="field"><label htmlFor={`em-${p.id}`}>Email</label><input id={`em-${p.id}`} className="input" type="email" value={edit.email} disabled={MODE === 'firebase'} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />{MODE === 'firebase' && <span className="small muted">This is how they sign in. To change it, invite the new address.</span>}</div>
                      <div className="field"><label htmlFor={`ph-${p.id}`}>Mobile</label><input id={`ph-${p.id}`} className="input" type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: formatPhoneAsTyped(e.target.value) })} placeholder="(952) 555-0123" /></div>
                      <div className="grid-2">
                        <button className="btn outline small" onClick={() => setEditId(null)}>Cancel</button>
                        <button className="btn small" onClick={saveEdit}>Save</button>
                      </div>
                      {tier !== 'owner' && (confirmRemove ? (
                        <div className="card" style={{ borderColor: 'var(--red-ink)' }}>
                          <div className="strong">Remove {p.name}?</div>
                          <div className="small muted">
                            They won't be able to sign in or request stays.
                            {upcomingFor(p.id).length > 0 && ` Their upcoming ${upcomingFor(p.id).map((b) => fmtRange(b.start, b.end)).join(', ')} ${upcomingFor(p.id).length === 1 ? 'stay' : 'stays'} will be cancelled and the dates opened up.`}
                            {' '}Past stays still count toward your weekends.
                          </div>
                          <div className="grid-2">
                            <button className="btn outline small" onClick={() => setConfirmRemove(false)}>Keep them</button>
                            <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={() => removePerson(p.id)}>Remove</button>
                          </div>
                        </div>
                      ) : (
                        <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setConfirmRemove(true)}>Remove from the list</button>
                      ))}
                    </div>
                  ) : (
                    <div key={p.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                      <span className="meta"><span className="strong">{p.name}</span><span className="small muted">{[p.email, formatPhone(p.phone)].filter(Boolean).join(' · ') || 'No contact info yet'}</span>{p.id !== me.id && <SignedIn visit={visits[p.id]} />}</span>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="chip grey num" title={`Stays in ${year}`}>{staysThisYear(p.id)}</span>
                        <button className="link-btn" style={{ minHeight: 40 }} onClick={() => startEdit(p.id)}>Edit</button>
                        {tier !== 'owner' && p.email && <a className="btn outline small" href={mailHref(p.email, 'Come stay at Camp Daniel', inviteText(p.shortName))}>Email invite</a>}
                        {tier !== 'owner' && !p.email && p.phone && <a className="btn outline small" href={smsHref(p.phone, inviteText(p.shortName))}>Text invite</a>}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </section>
          );
        })}
        <NotificationsSettings />
        {MODE === 'firebase' && <SignOutButton />}
        <VersionLabel />
      </main>
    </>
  );
}
