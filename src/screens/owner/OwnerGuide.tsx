import { useState } from 'react';
import { StatusChip } from '../../components/bits';
import { PhotoManager, PhotoPackImport } from '../../components/Photos';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { AmenityStatus, GuideGroup, Season } from '../../data/types';
import { currentSeason, SEASON_LABEL, sortSections } from '../../lib/cabin';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

const GROUPS: { id: GuideGroup; name: string }[] = [
  { id: 'arrive', name: 'Arrive' },
  { id: 'stay', name: 'During your stay' },
  { id: 'leave', name: 'Head out' },
];

/** Owner › Guide: quick status toggles, cabin settings, and links into each section's editor. */
export function OwnerGuide() {
  const { snap } = useSession();
  const season = currentSeason(snap.settings);
  const s = snap.settings;
  const tpl = snap.templates.find((t) => t.id === 'welcome');
  const [wifi, setWifi] = useState({ net: s.wifiNetwork, pw: s.wifiPassword });
  const [where, setWhere] = useState({ address: s.address, directions: s.directions });
  const [welcome, setWelcome] = useState(tpl?.body ?? '');

  const setStatus = (id: string, status: AmenityStatus) => store.updateGuideSection(id, { status });

  return (
    <>
      <div className="band">
        <div className="eyebrow">Owner · Guide</div>
        <h1 className="title" style={{ color: '#fff' }}>Cabin guide</h1>
      </div>
      <main className="screen" style={{ paddingTop: 14 }}>
        <div className="row wrap" style={{ justifyContent: "space-between" }}><span className="small muted">Add or delete photos inside each section.</span><PhotoPackImport /></div>

        <div className="eyebrow">Amenity status</div>
        <div className="card tight">
          {snap.guide.filter((g) => g.status !== 'info').map((g) => (
            <div key={g.id} className="list-row">
              <span className="meta"><span className="strong">{g.title}</span>{g.statusNote && g.status !== 'ready' && <span className="small muted">{g.statusNote}</span>}</span>
              <select
                className="input"
                style={{ width: 'auto', minHeight: 40, padding: '4px 8px', fontSize: 14 }}
                aria-label={`${g.title} status`}
                value={g.status}
                onChange={(e) => { setStatus(g.id, e.target.value as AmenityStatus); toast(`${g.title} updated.`); }}
              >
                <option value="ready">Ready</option>
                <option value="out">Out of order</option>
                <option value="stored">Stored</option>
              </select>
            </div>
          ))}
        </div>

        {GROUPS.map((grp) => (
          <section key={grp.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="eyebrow">{grp.name}</div>
            <div className="card tight">
              {sortSections(snap.guide.filter((g) => g.group === grp.id), season).map((g) => (
                <a key={g.id} className="list-row" href={href(`/owner/guide/${g.id}`)}>
                  <span className="meta"><span className="strong">{g.title}</span><span className="small muted">{g.summary}</span></span>
                  <span className="row" style={{ gap: 6 }}><StatusChip section={g} featured={g.featuredIn?.includes(season)} /><span aria-hidden="true">›</span></span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <div className="eyebrow">Cabin settings</div>
        <div className="card">
          <div className="field">
            <label htmlFor="season">Season for the guide</label>
            <select id="season" className="input" value={s.season} onChange={(e) => store.updateSettings({ season: e.target.value as Season | 'auto' })}>
              <option value="auto">Automatic ({SEASON_LABEL[season]} right now)</option>
              {(['spring', 'summer', 'fall', 'winter'] as Season[]).map((x) => <option key={x} value={x}>{SEASON_LABEL[x]}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="addr">Cabin address</label>
            <input id="addr" className="input" value={where.address} onChange={(e) => setWhere({ ...where, address: e.target.value })} placeholder="Used for the Maps link on trip pages" />
          </div>
          <div className="field">
            <label htmlFor="dir">Directions</label>
            <input id="dir" className="input" value={where.directions} onChange={(e) => setWhere({ ...where, directions: e.target.value })} />
          </div>
          <button className="btn outline small" onClick={async () => { await store.updateSettings({ address: where.address.trim(), directions: where.directions.trim() }); toast('Address saved.'); }}>Save address</button>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="wnet">Wi-Fi network</label>
              <input id="wnet" className="input" value={wifi.net} onChange={(e) => setWifi({ ...wifi, net: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="wpw">Wi-Fi password</label>
              <input id="wpw" className="input" value={wifi.pw} onChange={(e) => setWifi({ ...wifi, pw: e.target.value })} placeholder="Guests see it during their stay" />
            </div>
          </div>
          <button className="btn outline small" onClick={async () => { await store.updateSettings({ wifiNetwork: wifi.net.trim(), wifiPassword: wifi.pw.trim() }); toast('Wi-Fi saved.'); }}>Save Wi-Fi</button>
          <label className="check" style={{ borderBottom: 0 }}>
            <input type="checkbox" checked={s.showGoal} onChange={(e) => store.updateSettings({ showGoal: e.target.checked })} />
            <span>Show the {s.weekendGoal}-weekend goal on my home screen</span>
          </label>
        </div>

        <div className="eyebrow">Welcome note template</div>
        <div className="card">
          <div className="field">
            <label htmlFor="tpl">Starting text for every approval</label>
            <textarea id="tpl" className="input" rows={5} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
            <div className="small muted">{'{first}'} becomes the guest's first name.</div>
          </div>
          <button className="btn outline small" onClick={async () => { await store.updateTemplate('welcome', { body: welcome }); toast('Template saved.'); }}>Save template</button>
        </div>
      </main>
    </>
  );
}

/** Owner › Guide › one section. */
export function EditSection({ id }: { id: string }) {
  const { snap } = useSession();
  const sec = snap.guide.find((g) => g.id === id);
  const [form, setForm] = useState(() => ({
    title: sec?.title ?? '',
    summary: sec?.summary ?? '',
    body: sec?.body.join('\n\n') ?? '',
    checklist: sec?.checklist?.join('\n') ?? '',
    status: sec?.status ?? 'info',
    statusNote: sec?.statusNote ?? '',
    featuredIn: sec?.featuredIn ?? [],
  }));

  if (!sec) {
    return (
      <main className="screen">
        <a className="back" href={href('/owner/guide')}>‹ Guide</a>
        <div className="alert">That section doesn't exist.</div>
      </main>
    );
  }

  const save = async () => {
    await store.updateGuideSection(sec.id, {
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
      checklist: sec.checklist ? form.checklist.split('\n').map((l) => l.trim()).filter(Boolean) : undefined,
      status: form.status as AmenityStatus,
      statusNote: form.statusNote.trim() || undefined,
      featuredIn: form.featuredIn,
    });
    toast('Saved. Guests see it right away.');
  };

  const toggleSeason = (x: Season) =>
    setForm({ ...form, featuredIn: form.featuredIn.includes(x) ? form.featuredIn.filter((y) => y !== x) : [...form.featuredIn, x] });

  return (
    <main className="screen with-bottom-action">
      <a className="back" href={href('/owner/guide')}>‹ Guide</a>
      <h1 className="title">Edit {sec.title}</h1>

      <div className="field">
        <label htmlFor="t">Title</label>
        <input id="t" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="sm">One-line summary</label>
        <input id="sm" className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="st">Status</label>
          <select id="st" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as AmenityStatus })}>
            <option value="info">Info only</option>
            <option value="ready">Ready</option>
            <option value="out">Out of order</option>
            <option value="stored">Stored</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sn">Status note</label>
          <input id="sn" className="input" value={form.statusNote} onChange={(e) => setForm({ ...form, statusNote: e.target.value })} placeholder="e.g. Back in May" />
        </div>
      </div>
      <div className="field">
        <div className="label">Feature it in</div>
        <div className="row wrap">
          {(['spring', 'summer', 'fall', 'winter'] as Season[]).map((x) => (
            <button key={x} type="button" className={`btn small${form.featuredIn.includes(x) ? '' : ' outline'}`} aria-pressed={form.featuredIn.includes(x)} onClick={() => toggleSeason(x)}>
              {SEASON_LABEL[x]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="body">What guests should know</label>
        <textarea id="body" className="input" rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="small muted">Leave a blank line between paragraphs.</div>
      </div>
      <PhotoManager sectionId={sec.id} />

      {sec.checklist && (
        <div className="field">
          <label htmlFor="cl">Checklist (one item per line)</label>
          <textarea id="cl" className="input" rows={10} value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} />
        </div>
      )}

      <div className="bottom-action no-tabs">
        <button className="btn block" onClick={save}>Save section</button>
      </div>
    </main>
  );
}
