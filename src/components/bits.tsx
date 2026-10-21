import type { ReactNode } from 'react';
import type { AmenityStatus, Booking, GuideSection, Tier } from '../data/types';
import { TIER_LABEL } from '../data/types';
import { fmtDay } from '../lib/dates';
import { stayPhase } from '../lib/cabin';

export function TierChip({ tier }: { tier: Tier }) {
  const cls = tier === 'friends' ? 'orange' : tier === 'kids' ? 'blue' : 'solid';
  return <span className={`chip ${cls}`}>{TIER_LABEL[tier]}</span>;
}

const STATUS: Record<AmenityStatus, { label: string; cls: string }> = {
  ready: { label: 'Ready', cls: 'blue' },
  out: { label: 'Out of order', cls: 'red' },
  stored: { label: 'Stored', cls: 'grey' },
  info: { label: '', cls: '' },
};

export function StatusChip({ section, featured }: { section: GuideSection; featured?: boolean }) {
  if (section.status === 'out') return <span className="chip red">Out of order</span>;
  if (featured && section.status === 'ready') return <span className="chip pick">Season pick</span>;
  const s = STATUS[section.status];
  return s.label ? <span className={`chip ${s.cls}`}>{s.label}</span> : null;
}

export function Stepper({ value, onChange, min = 1, max = 12, id }: { value: number; onChange: (n: number) => void; min?: number; max?: number; id: string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Fewer people" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output id={id} className="value num" aria-live="polite">{value}</output>
      <button type="button" aria-label="More people" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Three-node horizontal timeline for a stay: Approved → Arrive → Head out. */
export function StayTimeline({ booking }: { booking: Booking }) {
  const phase = stayPhase(booking);
  const n1 = phase === 'requested' ? 'next' : 'done';
  const n2 = phase === 'staying' || phase === 'done' ? 'done' : phase === 'upcoming' ? 'next' : '';
  const n3 = phase === 'done' ? 'done' : phase === 'staying' ? 'next' : '';
  return (
    <div className="card">
      <div className="steps-h">
        <div>
          <span className={`node ${n1}`} />
          <div className="small strong">{phase === 'requested' ? 'Waiting' : 'Approved'}</div>
          <div className="small muted">{booking.decidedAt ? fmtDay(booking.decidedAt.slice(0, 10)) : 'Pete & Trisha'}</div>
        </div>
        <div>
          <span className={`node ${n2}`} />
          <div className="small strong">Arrive</div>
          <div className="small muted">{fmtDay(booking.start).split(',')[0]}, noon</div>
        </div>
        <div>
          <span className={`node ${n3}`} />
          <div className="small strong">Head out</div>
          <div className="small muted">{fmtDay(booking.end).split(',')[0]}</div>
        </div>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card" style={{ alignItems: 'center', textAlign: 'center', padding: '28px 18px' }}>
      <div className="title-sm">{title}</div>
      {children}
    </div>
  );
}
