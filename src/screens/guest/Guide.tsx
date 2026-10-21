import { useState } from 'react';
import { StatusChip } from '../../components/bits';
import { Icon } from '../../components/Icon';
import type { GuideGroup } from '../../data/types';
import { currentSeason, SEASON_LABEL, sortSections } from '../../lib/cabin';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

const GROUPS: { id: GuideGroup; name: string; hint: string }[] = [
  { id: 'arrive', name: 'Arrive', hint: 'Start here' },
  { id: 'stay', name: 'During your stay', hint: '' },
  { id: 'leave', name: 'Head out', hint: 'Before you leave' },
];

const VISIBLE = 5;

export function Guide() {
  const { snap, isOwner } = useSession();
  const season = currentSeason(snap.settings);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const broken = snap.guide.filter((s) => s.status === 'out');

  return (
    <main className="screen">
      <header className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 className="title">Cabin guide</h1>
        <span className="chip orange">{SEASON_LABEL[season]} edition</span>
      </header>
      {isOwner && <a className="back" href={href('/owner/guide')} style={{ marginTop: -8 }}>‹ Back to editing</a>}

      {broken.map((s) => (
        <div key={s.id} className="alert">
          <Icon name="alert" size={20} />
          <div><b>{s.title} is out of order.</b> {s.statusNote}</div>
        </div>
      ))}

      {GROUPS.map((g) => {
        const all = sortSections(snap.guide.filter((s) => s.group === g.id), season);
        const shown = open[g.id] ? all : all.slice(0, VISIBLE);
        const rest = all.slice(VISIBLE);
        return (
          <section key={g.id} id={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="section-label">
              <div className="eyebrow">{g.name}</div>
              <div className="small muted">{g.id === 'arrive' ? '3 steps, then good to know' : g.id === 'stay' ? `${SEASON_LABEL[season]} picks first` : g.hint}</div>
            </div>
            <div className="card tight">
              {shown.map((s, i) => (
                <a key={s.id} className="list-row" href={href(`/guide/${s.id}`)}>
                  <span className="meta">
                    <span className="strong">{s.title}</span>
                    <span className="small muted">{s.status !== 'ready' && s.status !== 'info' && s.statusNote ? s.statusNote : s.summary}</span>
                  </span>
                  {g.id === 'arrive' ? (i < 3 ? <span className="chip blue">Step {i + 1}</span> : null) : <StatusChip section={s} featured={s.featuredIn?.includes(season)} />}
                </a>
              ))}
              {rest.length > 0 && !open[g.id] && (
                <button className="link-btn" onClick={() => setOpen({ ...open, [g.id]: true })}>
                  Show {rest.length} more
                </button>
              )}
            </div>
          </section>
        );
      })}
    </main>
  );
}
