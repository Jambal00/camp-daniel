import { useState } from 'react';
import { LinkedText } from '../../components/LinkedText';
import { StatusChip } from '../../components/bits';
import { PhotoGallery } from '../../components/Photos';
import { currentSeason } from '../../lib/cabin';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

function checksKey(id: string) {
  return `camp-daniel:checks:${id}`;
}

export function GuideSection({ id }: { id: string }) {
  const { snap } = useSession();
  const s = snap.guide.find((g) => g.id === id && !g.hidden);
  const [checked, setChecked] = useState<number[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(checksKey(id)) || '[]');
    } catch {
      return [];
    }
  });

  if (!s) {
    return (
      <main className="screen">
        <a className="back" href={href('/guide')}>‹ Guide</a>
        <div className="alert">That section isn't in the guide anymore.</div>
      </main>
    );
  }

  const toggle = (i: number) => {
    const next = checked.includes(i) ? checked.filter((x) => x !== i) : [...checked, i];
    setChecked(next);
    try {
      localStorage.setItem(checksKey(id), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="screen">
      <a className="back" href={href('/guide')}>‹ Guide</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 className="title">{s.title}</h1>
          <StatusChip section={s} featured={s.featuredIn?.includes(currentSeason(snap.settings))} />
        </div>
        {s.statusNote && s.status !== 'ready' && <div className={s.status === 'out' ? 'alert' : 'callout'}>{s.statusNote}</div>}
      </header>

      <div className="card prose">
        {s.body.map((p, i) => <p key={i}><LinkedText text={p} /></p>)}
      </div>

      <PhotoGallery sectionId={s.id} />

      {!!s.checklist?.length && (
        <section className="card" aria-label="Checklist">
          <div className="section-label">
            <div className="title-sm">Checklist</div>
            <span className="chip orange num">{checked.length} of {s.checklist!.length}</span>
          </div>
          <div>
            {s.checklist!.map((item, i) => (
              <label key={i} className={`check${checked.includes(i) ? ' done' : ''}`}>
                <input type="checkbox" checked={checked.includes(i)} onChange={() => toggle(i)} />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Just a guide. Nothing gets sent from here.</p>
        </section>
      )}
    </main>
  );
}
