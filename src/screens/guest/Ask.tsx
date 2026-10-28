import { useEffect, useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GuestQuestion, GuideSection } from '../../data/types';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';

const STOP = new Set(['the', 'and', 'for', 'how', 'what', 'where', 'when', 'does', 'can', 'are', 'you', 'our', 'with', 'there', 'is', 'do', 'to', 'a', 'an', 'of', 'in', 'on', 'it', 'my', 'we', 'i', 'get', 'have', 'any', 'this', 'that', 'should']);

function words(q: string) {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** Plain-word search across titles, summaries, text and checklists. Best matches first. */
export function searchGuide(sections: GuideSection[], q: string) {
  const ws = words(q);
  if (ws.length === 0) return [];
  const out: { s: GuideSection; score: number; snippet: string }[] = [];
  for (const s of sections) {
    const title = s.title.toLowerCase();
    const summary = s.summary.toLowerCase();
    const text = [...s.body, ...(s.checklist ?? [])].join(' · ');
    const lower = text.toLowerCase();
    let score = 0;
    let at = -1;
    for (const w of ws) {
      // Match the start of words, so "breaker" finds "breakers" but "ear" doesn't find "near".
      const re = new RegExp(`\\b${w.replace(/[-]/g, '\\-')}`, 'g');
      if (re.test(title)) score += 4;
      if (new RegExp(re.source).test(summary)) score += 2;
      const hits = lower.match(new RegExp(re.source, 'g'));
      if (hits) {
        score += Math.min(hits.length, 3);
        if (at < 0) at = lower.search(new RegExp(re.source));
      }
    }
    if (score === 0) continue;
    let snippet = s.summary;
    if (at >= 0) {
      // Start and end on whole words.
      let from = Math.max(0, at - 40);
      if (from > 0) from = text.indexOf(' ', from) + 1 || from;
      let to = Math.min(text.length, from + 120);
      if (to < text.length) to = text.lastIndexOf(' ', to) > from ? text.lastIndexOf(' ', to) : to;
      snippet = (from > 0 ? '…' : '') + text.slice(from, to).trim() + (to < text.length ? '…' : '');
    }
    out.push({ s, score, snippet });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function useQuestions(askerId?: string): GuestQuestion[] | null {
  const [qs, setQs] = useState<GuestQuestion[] | null>(null);
  useEffect(() => store.watchQuestions(setQs, askerId), [askerId]);
  return qs;
}

/** Top of the Guide: search as you type; if nothing fits, send the question to Pete & Trisha. */
export function AskBox({ sections }: { sections: GuideSection[] }) {
  const { me, previewing } = useSession();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const results = q.trim().length >= 2 ? searchGuide(sections, q) : [];

  const send = async () => {
    const text = q.trim();
    if (!text) return;
    if (previewing) {
      toast('Guest preview: nothing was sent.');
      return;
    }
    setBusy(true);
    try {
      await store.addQuestion({ askerId: me.id, askerName: me.name.replace(/\s*\(example\)/, ''), text });
      setQ('');
      toast('Sent to Pete & Trisha. Their answer will show up here in the Guide.');
    } catch {
      toast('Couldn’t send it. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card ask" aria-label="Search the guide or ask a question">
      <label htmlFor="ask" className="title-sm">Have a question?</label>
      <input
        id="ask"
        className="input"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && results.length === 0 && q.trim() && send()}
        placeholder="Try “well”, “propane” or “where’s the Wi-Fi”"
        autoComplete="off"
      />
      {q.trim().length >= 2 && (
        <>
          {results.length > 0 ? (
            <div className="ask-results">
              <div className="small muted">From the guide</div>
              {results.map(({ s, snippet }) => (
                <a key={s.id} className="ask-hit" href={href(`/guide/${s.id}`)}>
                  <span className="strong">{s.title}</span>
                  <span className="small muted">{snippet}</span>
                </a>
              ))}
            </div>
          ) : (
            <div className="small muted">Nothing in the guide matches that yet.</div>
          )}
          <div className="ask-send">
            <span className="small">{results.length ? 'Not what you needed?' : 'Ask Pete & Trisha instead.'}</span>
            <button className="btn small" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send to Pete & Trisha'}</button>
          </div>
          <div className="small muted">For anything urgent, text them from the Pete &amp; Trish tab.</div>
        </>
      )}
    </section>
  );
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The guest's own questions and any answers. Hidden until they've asked something. */
export function MyQuestions() {
  const { me } = useSession();
  const qs = useQuestions(me.id);
  if (!qs || qs.length === 0) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="section-label">
        <div className="eyebrow">Your questions</div>
        <div className="small muted">Answers from Pete &amp; Trisha</div>
      </div>
      <div className="card tight">
        {qs.map((q) => (
          <div key={q.id} className="list-row qa">
            <span className="meta">
              <span className="strong">{q.text}</span>
              {q.answer ? <span className="qa-answer">{q.answer}</span> : <span className="small muted">Asked {when(q.createdAt)}</span>}
            </span>
            <span className={`chip ${q.answer ? 'solid' : 'grey'}`}>{q.answer ? 'Answered' : 'Waiting'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
