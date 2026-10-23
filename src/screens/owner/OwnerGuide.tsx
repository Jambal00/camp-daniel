import { useState } from 'react';
import { StatusChip } from '../../components/bits';
import { PhotoManager, PhotoPackImport, usePhotos } from '../../components/Photos';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { AmenityStatus, GuideGroup, GuideSection, Season } from '../../data/types';
import { currentSeason, SEASON_LABEL, sortSections } from '../../lib/cabin';
import { go, href } from '../../lib/router';
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
                <a key={g.id} className={`list-row${g.hidden ? ' stored' : ''}`} href={href(`/owner/guide/${g.id}`)}>
                  <span className="meta"><span className="strong">{g.title}</span><span className="small muted">{g.summary}</span></span>
                  <span className="row" style={{ gap: 6 }}>{g.hidden ? <span className="chip grey">Hidden</span> : <StatusChip section={g} featured={g.featuredIn?.includes(season)} />}<span aria-hidden="true">›</span></span>
                </a>
              ))}
              <a className="link-btn" style={{ display: 'flex', alignItems: 'center' }} href={href(`/owner/guide/new?group=${grp.id}`)}>+ Add a topic</a>
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

/** Owner › Guide › one section, or a new one (id "new", group from ?group=). */
export function EditSection({ id, group }: { id: string; group?: string | null }) {
  const { snap } = useSession();
  const isNew = id === 'new';
  const sec = snap.guide.find((g) => g.id === id);
  const [form, setForm] = useState(() => ({
    group: (sec?.group ?? (GROUPS.some((g) => g.id === group) ? group : 'stay')) as GuideGroup,
    title: sec?.title ?? '',
    summary: sec?.summary ?? '',
    body: sec?.body.join('\n\n') ?? '',
    checklist: sec?.checklist?.join('\n') ?? '',
    status: sec?.status ?? 'info',
    statusNote: sec?.statusNote ?? '',
    featuredIn: sec?.featuredIn ?? [],
    hidden: sec?.hidden ?? false,
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const photos = usePhotos(isNew ? '' : id);

  if (!sec && !isNew) {
    return (
      <main className="screen">
        <a className="back" href={href('/owner/guide')}>‹ Guide</a>
        <div className="alert">That topic isn't in the guide anymore.</div>
      </main>
    );
  }

  const fields = (): Omit<GuideSection, 'id' | 'order'> => ({
    group: form.group,
    title: form.title.trim(),
    summary: form.summary.trim(),
    body: form.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    checklist: form.checklist.split('\n').map((l) => l.trim()).filter(Boolean),
    status: form.status as AmenityStatus,
    statusNote: form.statusNote.trim(),
    featuredIn: form.featuredIn,
    hidden: form.hidden,
  });

  const save = async () => {
    if (!form.title.trim()) {
      toast('Give the topic a title first.');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const order = Math.max(0, ...snap.guide.filter((g) => g.group === form.group).map((g) => g.order)) + 1;
        const created = await store.addGuideSection({ ...fields(), order });
        toast(form.hidden ? 'Topic added (hidden from guests).' : 'Topic added. Guests see it right away.');
        go(`/owner/guide/${created.id}`);
      } else {
        await store.updateGuideSection(sec!.id, fields());
        toast(form.hidden ? 'Saved. Hidden from guests.' : 'Saved. Guests see it right away.');
      }
    } catch {
      toast('Couldn’t save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await store.deleteGuideSection(sec!.id);
      toast(`Deleted ${sec!.title}.`);
      go('/owner/guide');
    } catch {
      toast('Couldn’t delete. Try again.');
    }
  };

  const toggleSeason = (x: Season) =>
    setForm({ ...form, featuredIn: form.featuredIn.includes(x) ? form.featuredIn.filter((y) => y !== x) : [...form.featuredIn, x] });

  const photoCount = photos?.length ?? 0;

  return (
    <main className="screen with-bottom-action">
      <a className="back" href={href('/owner/guide')}>‹ Guide</a>
      <h1 className="title">{isNew ? 'New topic' : `Edit ${sec!.title}`}</h1>

      <div className="field">
        <label htmlFor="t">Title</label>
        <input id="t" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Hot tub" autoFocus={isNew} />
      </div>
      <div className="field">
        <label htmlFor="sm">One-line summary</label>
        <input id="sm" className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Shows under the title in the list" />
      </div>
      <div className="field">
        <label htmlFor="grp">Where it goes</label>
        <select id="grp" className="input" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value as GuideGroup })}>
          {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <label className="check" style={{ borderBottom: 0 }}>
        <input type="checkbox" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
        <span>Hide from guests<span className="small muted" style={{ display: 'block' }}>Keeps everything you wrote; guests won't see it until you uncheck this.</span></span>
      </label>
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
        <div className="small muted">Leave a blank line between paragraphs. To add a link, write [Crow Bar](https://…) or paste the web address.</div>
      </div>
      {isNew ? (
        <div className="field">
          <div className="label">Photos</div>
          <div className="small muted">Save the topic first, then you can add photos.</div>
        </div>
      ) : (
        <PhotoManager sectionId={sec!.id} />
      )}

      <div className="field">
        <label htmlFor="cl">Checklist (optional, one item per line)</label>
        <textarea id="cl" className="input" rows={sec?.checklist?.length ? 10 : 3} value={form.checklist} onChange={(e) => setForm({ ...form, checklist: e.target.value })} />
      </div>

      {!isNew && (
        <div className="card" style={{ borderColor: confirmDelete ? 'var(--red-ink)' : undefined }}>
          {confirmDelete ? (
            <>
              <div className="strong">Delete {sec!.title}{photoCount ? ` and its ${photoCount} photo${photoCount === 1 ? '' : 's'}` : ''}?</div>
              <div className="small muted">This can't be undone. To take it out of the guide for now, use "Hide from guests" instead.</div>
              <div className="grid-2">
                <button className="btn outline" onClick={() => setConfirmDelete(false)}>Keep it</button>
                <button className="btn" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={remove}>Delete</button>
              </div>
            </>
          ) : (
            <button className="link-btn" style={{ color: 'var(--red-ink)' }} onClick={() => setConfirmDelete(true)}>Delete this topic</button>
          )}
        </div>
      )}

      <div className="bottom-action no-tabs">
        <button className="btn block" onClick={save} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add topic' : 'Save topic'}</button>
      </div>
    </main>
  );
}
