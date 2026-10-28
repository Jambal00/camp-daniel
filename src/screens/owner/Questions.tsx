import { useState } from 'react';
import { toast } from '../../components/Toast';
import { store } from '../../data';
import type { GuestQuestion } from '../../data/types';
import { personById, smsHref } from '../../lib/cabin';
import { href } from '../../lib/router';
import { useSession } from '../../lib/session';
import { useQuestions } from '../guest/Ask';

const FAQ_ID_TITLE = 'Questions guests have asked';

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Card on the owner home: how many questions are waiting. */
export function QuestionsLink() {
  const qs = useQuestions();
  const waiting = (qs ?? []).filter((q) => !q.answer).length;
  return (
    <a className="card album-link" href={href('/owner/questions')}>
      <span className="ico" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></svg>
      </span>
      <span className="meta" style={{ flex: 1 }}>
        <span className="strong">Guest questions</span>
        <span className="small muted">{waiting ? 'Guests are waiting for an answer' : 'What guests ask with the Ask button'}</span>
      </span>
      {waiting > 0 && <span className="chip pick num">{waiting} waiting</span>}
      <span aria-hidden="true">›</span>
    </a>
  );
}

function QuestionCard({ q }: { q: GuestQuestion }) {
  const { snap } = useSession();
  const [answer, setAnswer] = useState(q.answer);
  const [editing, setEditing] = useState(!q.answer);
  const [confirm, setConfirm] = useState(false);
  const asker = personById(snap.people, q.askerId);
  const faq = snap.guide.find((g) => g.title === FAQ_ID_TITLE);
  const inFaq = !!faq?.body.includes(`Q: ${q.text}`);

  const save = async () => {
    try {
      await store.answerQuestion(q.id, answer.trim());
      setEditing(false);
      toast(`Answer saved. ${asker?.shortName ?? 'They'} will see it under Ask.`);
    } catch {
      toast('Couldn’t save the answer. Try again.');
    }
  };

  const addToGuide = async () => {
    const pair = [`Q: ${q.text}`, `A: ${q.answer}`];
    try {
      if (faq) {
        await store.updateGuideSection(faq.id, { body: [...faq.body, ...pair] });
      } else {
        const order = Math.max(0, ...snap.guide.filter((g) => g.group === 'stay').map((g) => g.order)) + 1;
        await store.addGuideSection({ group: 'stay', title: FAQ_ID_TITLE, summary: 'Answers from Pete & Trisha', body: pair, status: 'info', order });
      }
      toast(`Added to “${FAQ_ID_TITLE}” in the guide.`);
    } catch {
      toast('Couldn’t add it to the guide. Try again.');
    }
  };

  const remove = async () => {
    try {
      await store.deleteQuestion(q.id);
      toast('Question deleted.');
    } catch {
      toast('Couldn’t delete it. Try again.');
    }
  };

  return (
    <article className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="strong">{q.askerName}</span>
        <span className="small muted">{when(q.createdAt)}</span>
      </div>
      <p style={{ margin: 0, fontSize: 17 }}>{q.text}</p>

      {editing ? (
        <>
          <textarea className="input" rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label={`Answer for ${q.askerName}`} />
          <div className="grid-2">
            {q.answer ? <button className="btn outline" onClick={() => { setAnswer(q.answer); setEditing(false); }}>Cancel</button> : <span />}
            <button className="btn" onClick={save} disabled={!answer.trim()}>Send answer</button>
          </div>
        </>
      ) : (
        <>
          <div className="qa-answer">{q.answer}</div>
          <div className="row wrap" style={{ gap: 14 }}>
            <button className="link-btn" onClick={() => setEditing(true)}>Edit answer</button>
            {inFaq ? <span className="small muted">In the guide</span> : <button className="link-btn" onClick={addToGuide}>Add to guide as FAQ</button>}
            {asker?.phone && <a className="link-btn" style={{ display: 'inline-flex', alignItems: 'center' }} href={smsHref(asker.phone, `Hi ${asker.shortName}! You asked: “${q.text}” ${q.answer}`)}>Text it to {asker.shortName}</a>}
          </div>
        </>
      )}

      {confirm ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="small strong">Delete this question?</span>
          <button className="btn outline small" onClick={() => setConfirm(false)}>Keep</button>
          <button className="btn small" style={{ background: 'var(--red-ink)', borderColor: 'var(--red-ink)' }} onClick={remove}>Delete</button>
        </div>
      ) : (
        <button className="link-btn" style={{ color: 'var(--red-ink)', alignSelf: 'flex-start', minHeight: 32 }} onClick={() => setConfirm(true)}>Delete</button>
      )}
    </article>
  );
}

/** Owners: answer guest questions, then optionally add them to the guide. */
export function Questions() {
  const qs = useQuestions();
  const waiting = (qs ?? []).filter((q) => !q.answer);
  const answered = (qs ?? []).filter((q) => q.answer);
  return (
    <main className="screen">
      <a className="back" href={href('/owner')}>‹ Requests</a>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 className="title">Guest questions</h1>
        <p className="muted" style={{ margin: 0 }}>Sent with the Ask button. Your answer shows up for that guest under Ask. Add good ones to the guide so the next guest finds them.</p>
      </header>
      {qs === null ? (
        <div className="muted">Loading…</div>
      ) : qs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="strong">No questions yet</div>
          <div className="small muted">When a guest taps Ask and sends a question, it lands here.</div>
        </div>
      ) : (
        <>
          {waiting.length > 0 && <div className="eyebrow">Waiting for an answer</div>}
          {waiting.map((q) => <QuestionCard key={q.id} q={q} />)}
          {answered.length > 0 && <div className="eyebrow" style={{ paddingTop: 6 }}>Answered</div>}
          {answered.map((q) => <QuestionCard key={q.id} q={q} />)}
        </>
      )}
    </main>
  );
}
