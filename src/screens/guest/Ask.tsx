import { useEffect, useRef, useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GuestQuestion } from '../../data/types';
import { useSession } from '../../lib/session';

const SEEN_KEY = 'camp-daniel:answers-seen';

export function useQuestions(askerId?: string): GuestQuestion[] | null {
  const [qs, setQs] = useState<GuestQuestion[] | null>(null);
  useEffect(() => store.watchQuestions(setQs, askerId), [askerId]);
  return qs;
}

function seenAt() {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The panel: ask anything, and see your earlier questions with Pete & Trisha's answers. */
function AskSheet({ qs, onClose }: { qs: GuestQuestion[]; onClose: () => void }) {
  const { me, previewing } = useSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
    setBusy(true);
    try {
      await store.addQuestion({ askerId: me.id, askerName: me.name.replace(/\s*\(example\)/, ''), text: t });
      setText('');
      toast('Sent. You’ll see their answer right here.');
    } catch {
      toast('Couldn’t send it. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ask-title" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="ask-title" className="title-sm" style={{ fontSize: 22 }}>Ask Pete &amp; Trisha</h2>
          <button className="link-btn quiet" onClick={onClose}>Close</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Anything about the cabin, the lake or your stay. They’ll answer here. For anything urgent, text them.</p>
        <label htmlFor="ask-text" className="sr-only">Your question</label>
        <textarea
          id="ask-text"
          ref={boxRef}
          className="input"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Can we bring our dog? Is there a high chair?"
        />
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          {previewing ? <span className="chip orange">Preview only</span> : <span />}
          <button className="btn" onClick={send} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
        </div>

        {qs.length > 0 && (
          <div className="sheet-list">
            <div className="eyebrow">Your questions</div>
            {qs.map((q) => (
              <div key={q.id} className="qa-item">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span className="strong">{q.text}</span>
                  <span className={`chip ${q.answer ? 'solid' : 'grey'}`}>{q.answer ? 'Answered' : 'Waiting'}</span>
                </div>
                {q.answer ? <div className="qa-answer">{q.answer}</div> : <span className="small muted">Asked {when(q.createdAt)}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Floating "Ask" button on every guest screen, with a dot when there's a new answer. */
export function AskButton() {
  const { me } = useSession();
  const qs = useQuestions(me.id) ?? [];
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(seenAt);
  const fresh = qs.filter((q) => q.answeredAt && q.answeredAt > seen).length;

  const show = () => {
    setOpen(true);
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem(SEEN_KEY, now);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <button className="ask-fab" onClick={show} aria-label={fresh ? `Ask Pete & Trisha (${fresh} new answer${fresh === 1 ? '' : 's'})` : 'Ask Pete & Trisha'}>
        <span className="ask-q" aria-hidden="true">?</span>
        <span className="ask-label">Ask</span>
        {fresh > 0 && <i className="ask-dot" aria-hidden="true" />}
      </button>
      {open && <AskSheet qs={qs} onClose={() => setOpen(false)} />}
    </>
  );
}
