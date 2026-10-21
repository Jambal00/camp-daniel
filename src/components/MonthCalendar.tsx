import { useState } from 'react';
import { fmtDay, fromISO, monthGrid, monthLabel, today, type ISODate } from '../lib/dates';

export interface DayLook {
  className: string;
  tag?: string;
  disabled?: boolean;
  /** Spoken description, e.g. "booked". */
  state?: string;
}

interface Props {
  look: (date: ISODate) => DayLook;
  onPick?: (date: ISODate) => void;
  /** Month to open on, any date within it. */
  start?: ISODate;
  /** Don't allow paging before the current month. */
  noPast?: boolean;
}

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function MonthCalendar({ look, onPick, start, noPast }: Props) {
  const first = fromISO(start ?? today());
  const [ym, setYm] = useState({ y: first.getFullYear(), m: first.getMonth() });
  const now = fromISO(today());
  const atMin = noPast && ym.y === now.getFullYear() && ym.m === now.getMonth();
  const shift = (n: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const t = today();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="cal-head">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} disabled={atMin}>‹</button>
        <div className="title-sm" style={{ fontSize: 19 }} aria-live="polite">{monthLabel(ym.y, ym.m)}</div>
        <button type="button" aria-label="Next month" onClick={() => shift(1)}>›</button>
      </div>
      <div className="cal-dow" aria-hidden="true">
        {DOW.map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="cal-grid">
        {monthGrid(ym.y, ym.m).map((d, i) => {
          if (!d) return <div key={i} className="day empty" />;
          const l = look(d);
          return (
            <button
              key={d}
              type="button"
              className={`day ${l.className}${d === t ? ' today' : ''}`}
              disabled={l.disabled}
              aria-label={`${fmtDay(d)}${l.state ? `, ${l.state}` : ''}`}
              onClick={() => onPick?.(d)}
            >
              <span>{fromISO(d).getDate()}</span>
              {l.tag ? <span className="tag">{l.tag}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
