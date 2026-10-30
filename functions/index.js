// Camp Daniel server functions.
//
// "Remind me later": a guest saves reminders/{id} with the day they want to be nudged.
// We email them a calendar invite for 9:00 AM Central that day, with a link back to the
// app. Their own calendar does the reminding. Deleting the reminder emails a cancellation.
//
// Settings come from functions/.env, written at deploy time from GitHub secrets:
//   RESEND_API_KEY, MAIL_FROM ("Camp Daniel <camp@camp.productdna.net>"), APP_URL,
//   REPLY_TO (optional; otherwise the first owner in People, alphabetically)
//
// Also: emails the owners when a guest requests dates, and makes photo thumbnails.
//
// MAIL_FROM can send but has no inbox, so the invite's organizer and the email's
// reply-to are a real owner's address. Invites also arrive already accepted, so
// calendars don't ask the guest to RSVP.

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

const TZ = 'America/Chicago';
const MAX_ACTIVE_PER_PERSON = 5;

function appUrl() {
  return process.env.APP_URL || 'https://jambal00.github.io/camp-daniel/';
}

function fromAddress() {
  const from = process.env.MAIL_FROM || '';
  const m = from.match(/<([^>]+)>/);
  return { header: from, email: m ? m[1] : from };
}

/** Where replies (and any calendar RSVP) go: a real inbox. */
async function replyAddress() {
  if (process.env.REPLY_TO) return process.env.REPLY_TO;
  const owners = await admin.firestore().collection('people').where('tier', '==', 'owner').get();
  const ids = owners.docs.map((d) => d.id).filter((id) => id.includes('@')).sort();
  return ids[0] || fromAddress().email;
}

/** The moment it is 9:00 AM in Chicago on a YYYY-MM-DD day (handles daylight saving). */
function nineAmCentral(day) {
  const [y, m, d] = day.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, 14, 0, 0); // 9:00 CDT
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(t)));
  if (hour === 8) t += 60 * 60 * 1000; // CST: 9:00 is 15:00 UTC
  return new Date(t);
}

const icsTime = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

function buildIcs({ id, to, name, day, method, organizer }) {
  const start = nineAmCentral(day);
  const end = new Date(start.getTime() + 15 * 60 * 1000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Camp Daniel//Reminder//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:reminder-${id}@camp-daniel`,
    `SEQUENCE:${method === 'CANCEL' ? 1 : 0}`,
    `DTSTAMP:${icsTime(new Date())}`,
    `DTSTART:${icsTime(start)}`,
    `DTEND:${icsTime(end)}`,
    'SUMMARY:Check the Camp Daniel calendar',
    `DESCRIPTION:${icsText(`Your reminder to see what's open at Camp Daniel. Open the app: ${appUrl()}`)}`,
    `URL:${appUrl()}`,
    `ORGANIZER;CN=Camp Daniel:mailto:${organizer}`,
    `ATTENDEE;CN="${String(name || to).replace(/["\r\n]/g, '')}";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${to}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Check the Camp Daniel calendar',
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

function prettyDay(day) {
  return nineAmCentral(day).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });
}

async function sendMail({ to, subject, text, html, ics, method, replyTo }) {
  const recipients = Array.isArray(to) ? to : [to];
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.MAIL_FROM) throw new Error('Email is not set up yet (RESEND_API_KEY / MAIL_FROM).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress().header,
      to: recipients,
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html,
      ...(ics ? { attachments: [{ filename: 'camp-daniel-reminder.ics', content: Buffer.from(ics).toString('base64'), content_type: `text/calendar; method=${method}` }] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

exports.sendReminderInvite = functions.firestore.document('reminders/{id}').onCreate(async (snap, ctx) => {
  const r = snap.data() || {};
  const id = ctx.params.id;
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.remindOn || '')) throw new Error('Bad date.');
    const today = new Date().toISOString().slice(0, 10);
    const yearOut = new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10);
    if (r.remindOn <= today || r.remindOn > yearOut) throw new Error('Date must be between tomorrow and a year out.');
    if (!r.email || !/^[^@\s]+@[^@\s]+$/.test(r.email)) throw new Error('No email address.');

    // Keep it friendly, not spammy: a few reminders per person at most.
    const active = await admin.firestore().collection('reminders').where('personId', '==', r.personId).get();
    if (active.size > MAX_ACTIVE_PER_PERSON) throw new Error(`Only ${MAX_ACTIVE_PER_PERSON} reminders at a time.`);

    const first = String(r.name || '').split(/\s+/)[0] || 'there';
    const when = prettyDay(r.remindOn);
    const link = appUrl();
    const organizer = await replyAddress();
    await sendMail({
      to: r.email,
      method: 'REQUEST',
      replyTo: organizer,
      ics: buildIcs({ id, to: r.email, name: r.name, day: r.remindOn, method: 'REQUEST', organizer }),
      subject: `Reminder: check the Camp Daniel calendar on ${when}`,
      text: `Hi ${first},\n\nHere's the reminder you asked for. Add the attached invite to your calendar, and on ${when} at 9:00 AM it will remind you to see what's open at Camp Daniel.\n\nOpen the app any time: ${link}\n\nPete & Trisha`,
      html: `<p>Hi ${esc(first)},</p><p>Here's the reminder you asked for. Add the attached invite to your calendar, and on <b>${esc(when)}</b> at 9:00&nbsp;AM it will remind you to see what's open at Camp Daniel.</p><p><a href="${esc(link)}">Open Camp Daniel</a></p><p>Pete &amp; Trisha</p>`,
    });
    await snap.ref.update({ status: 'sent', sentAt: new Date().toISOString(), organizer });
  } catch (e) {
    console.error('Reminder invite failed', id, e);
    await snap.ref.update({ status: 'failed', error: String(e && e.message ? e.message : e).slice(0, 300) });
  }
});

exports.cancelReminderInvite = functions.firestore.document('reminders/{id}').onDelete(async (snap, ctx) => {
  const r = snap.data() || {};
  if (r.status !== 'sent') return;
  try {
    // The cancel must name the same organizer as the original invite.
    const organizer = r.organizer || fromAddress().email;
    await sendMail({
      to: r.email,
      method: 'CANCEL',
      replyTo: r.organizer || undefined,
      ics: buildIcs({ id: ctx.params.id, to: r.email, name: r.name, day: r.remindOn, method: 'CANCEL', organizer }),
      subject: 'Cancelled: Camp Daniel reminder',
      text: `Your Camp Daniel reminder for ${prettyDay(r.remindOn)} is cancelled. Open the app any time: ${appUrl()}`,
      html: `<p>Your Camp Daniel reminder for <b>${esc(prettyDay(r.remindOn))}</b> is cancelled.</p><p><a href="${esc(appUrl())}">Open Camp Daniel</a></p>`,
    });
  } catch (e) {
    console.error('Reminder cancel failed', ctx.params.id, e);
  }
});

// ---------- New stay requests: email the owners ----------
const { buildRequestEmail, fmtShort } = require('./requests');
const { sendTo } = require('./push');
const { chicagoDay, wants, notify, once, ownerIds, nameOf, first } = require('./notify');

async function ownerEmails() {
  const owners = await admin.firestore().collection('people').where('tier', '==', 'owner').get();
  return owners.docs.map((d) => d.id).filter((id) => id.includes('@')).sort();
}

exports.notifyNewRequest = functions.firestore.document('bookings/{id}').onCreate(async (snap, ctx) => {
  const b = snap.data() || {};
  const id = ctx.params.id;
  if (b.status !== 'pending' || b.bookedByOwner) return;
  try {
    const db = admin.firestore();
    const owners = await ownerEmails();
    if (!owners.length || owners.includes(String(b.personId).toLowerCase())) return;
    const [personSnap, replacedSnap, busySnap, pendingSnap] = await Promise.all([
      db.collection('people').doc(b.personId).get(),
      b.replaces ? db.collection('bookings').doc(b.replaces).get() : Promise.resolve(null),
      db.collection('busy').get(),
      db.collection('bookings').where('status', '==', 'pending').get(),
    ]);
    const person = personSnap.exists ? personSnap.data() : null;
    const mail = buildRequestEmail(id, b, {
      person,
      replaced: replacedSnap && replacedSnap.exists ? replacedSnap.data() : null,
      busy: busySnap.docs.map((d) => ({ ...d.data(), id: d.id })),
      pending: pendingSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
      appUrl: appUrl(),
    });
    const guestEmail = (person && person.email) || (String(b.personId).includes('@') ? b.personId : '');
    // Phone notification first (it's the quick one), then the email as the record.
    const who = (person && person.name) || b.names || 'Someone';
    const n = Math.round((new Date(`${b.end}T12:00:00Z`) - new Date(`${b.start}T12:00:00Z`)) / 86400000);
    try {
      const r = await notify(db, owners, 'request', {
        title: b.replaces ? `Change of dates: ${who}` : `New request: ${who}`,
        body: `${fmtShort(b.start, b.end)} · ${n} night${n === 1 ? '' : 's'} · party of ${b.partySize || '?'}${b.note ? ` · “${String(b.note).slice(0, 80)}”` : ''}`,
        url: `${appUrl()}#/owner/approve/${id}`,
        tag: `request-${id}`,
      });
      console.log('Request push', id, r);
    } catch (e) {
      console.error('Request push failed', id, e);
    }
    const emailTo = [];
    for (const o of owners) if (await wants(db, o, 'requestEmail')) emailTo.push(o);
    if (emailTo.length) await sendMail({ to: emailTo, replyTo: guestEmail || undefined, ...mail });
    console.log('Request email sent', id, 'to', emailTo.length, 'owners');
  } catch (e) {
    console.error('Request email failed', id, e);
  }
});

// ---------- Other notifications ----------
const APP = (hash) => `${appUrl()}#${hash}`;

// Owners: a guest asked a question.
exports.notifyQuestion = functions.firestore.document('questions/{id}').onCreate(async (snap, ctx) => {
  const q = snap.data() || {};
  const db = admin.firestore();
  try {
    const owners = await ownerIds(db);
    if (owners.includes(String(q.askerId).toLowerCase())) return;
    await notify(db, owners, 'question', {
      title: `Question from ${first(q.askerName || 'a guest')}`,
      body: String(q.text || '').slice(0, 160),
      url: APP('/owner/questions'),
      tag: `question-${ctx.params.id}`,
    });
  } catch (e) {
    console.error('Question push failed', ctx.params.id, e);
  }
});

// Guests: Pete & Trisha answered their question.
exports.notifyAnswer = functions.firestore.document('questions/{id}').onUpdate(async (change, ctx) => {
  const b = change.before.data() || {};
  const a = change.after.data() || {};
  if (!a.answer || b.answer) return;
  const db = admin.firestore();
  try {
    await once(db, `answer-${ctx.params.id}`, () =>
      notify(db, [a.askerId], 'answer', {
        title: 'Pete & Trisha answered your question',
        body: String(a.answer).slice(0, 160),
        url: APP('/?ask=1'),
        tag: `answer-${ctx.params.id}`,
      }),
    );
  } catch (e) {
    console.error('Answer push failed', ctx.params.id, e);
  }
});

// Bookings changing: approved (guest), cancelled (owners), heading-out note (owners).
exports.notifyBookingChange = functions.firestore.document('bookings/{id}').onUpdate(async (change, ctx) => {
  const b = change.before.data() || {};
  const a = change.after.data() || {};
  const id = ctx.params.id;
  const db = admin.firestore();
  try {
    const owners = await ownerIds(db);
    const isGuest = !owners.includes(String(a.personId).toLowerCase());
    if (b.status === 'pending' && a.status === 'approved' && isGuest) {
      await once(db, `approved-${id}`, () =>
        notify(db, [a.personId], 'approved', {
          title: a.replaces ? 'Your new dates are set' : 'You’re all set for Camp Daniel!',
          body: `${fmtShort(a.start, a.end)} is approved. Tap for your welcome note and trip details.`,
          url: APP('/trip'),
          tag: `approved-${id}`,
        }),
      );
    }
    // A guest cancelling (not the old stay an owner closes when approving a change of dates).
    const replacedByChange = a.status === 'cancelled' && !(await db.collection('bookings').where('replaces', '==', id).where('status', '==', 'approved').limit(1).get()).empty;
    if (b.status !== 'cancelled' && a.status === 'cancelled' && isGuest && b.status === 'approved' && !replacedByChange) {
      const who = await nameOf(db, a.personId, a.names);
      await once(db, `cancelled-${id}`, () =>
        notify(db, owners, 'cancel', {
          title: `${first(who)} cancelled their stay`,
          body: `${fmtShort(a.start, a.end)} is open again.`,
          url: APP('/owner/calendar'),
          tag: `cancelled-${id}`,
        }),
      );
    }
    if (a.departureNote && a.departureNote !== b.departureNote && isGuest) {
      const who = await nameOf(db, a.personId, a.names);
      await notify(db, owners, 'headingOut', {
        title: `${first(who)} is heading out`,
        body: String(a.departureNote).slice(0, 160),
        url: APP('/owner'),
        tag: `heading-out-${id}`,
      });
    }
  } catch (e) {
    console.error('Booking push failed', id, e);
  }
});

/** Approved guest stays starting on `day`, with their door code (if any). */
async function staysStarting(db, day) {
  const owners = await ownerIds(db);
  const snap = await db.collection('bookings').where('start', '==', day).get();
  const out = [];
  for (const d of snap.docs) {
    const b = d.data();
    if (b.status !== 'approved' || owners.includes(String(b.personId).toLowerCase())) continue;
    const acc = await db.collection('access').doc(d.id).get();
    out.push({ id: d.id, ...b, doorCode: (acc.exists && acc.data().doorCode) || '' });
  }
  return { owners, stays: out };
}

// Every morning at 9: trip in 3 days (guest), and any stay in the next 3 days still missing a door code (owners).
exports.morningNudges = functions.pubsub.schedule('0 9 * * *').timeZone(TZ).onRun(async () => {
  const db = admin.firestore();
  for (const offset of [0, 1, 2, 3]) {
    const day = chicagoDay(offset);
    const { owners, stays } = await staysStarting(db, day);
    for (const s of stays) {
      try {
        if (offset === 3) {
          await once(db, `trip-soon-${s.id}`, () =>
            notify(db, [s.personId], 'tripSoon', {
              title: 'Camp Daniel in 3 days!',
              body: `${fmtShort(s.start, s.end)}. Tap for directions, the guide and what to bring.`,
              url: APP('/trip'),
              tag: `trip-soon-${s.id}`,
            }),
          );
        }
        if (!s.doorCode) {
          const who = await nameOf(db, s.personId, s.names);
          await once(db, `door-code-${s.id}-${day === chicagoDay(0) ? 'today' : 'soon'}`, () =>
            notify(db, owners, 'doorCode', {
              title: `Door code needed for ${first(who)}`,
              body: `They arrive ${offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : `in ${offset} days`} (${fmtShort(s.start, s.end)}) and there’s no code yet.`,
              url: APP(`/owner/approve/${s.id}`),
              tag: `door-code-${s.id}`,
            }),
          );
        }
      } catch (e) {
        console.error('Morning nudge failed', s.id, e);
      }
    }
  }
});

// Arrival day at noon, when the code unlocks in the app (guest).
exports.noonCodeReady = functions.pubsub.schedule('0 12 * * *').timeZone(TZ).onRun(async () => {
  const db = admin.firestore();
  const { stays } = await staysStarting(db, chicagoDay(0));
  for (const s of stays) {
    if (!s.doorCode) continue;
    try {
      await once(db, `code-ready-${s.id}`, () =>
        notify(db, [s.personId], 'codeReady', {
          title: 'Your door code is ready',
          body: 'Welcome to Camp Daniel! Tap for the door code and Wi-Fi.',
          url: APP('/trip'),
          tag: `code-ready-${s.id}`,
        }),
      );
    } catch (e) {
      console.error('Code-ready push failed', s.id, e);
    }
  }
});

// A phone just turned notifications on, or asked for a test: send one so they can see it works.
exports.pushSubscriptionTest = functions.firestore.document('pushSubs/{id}').onWrite(async (change, ctx) => {
  if (!change.after.exists) return;
  const a = change.after.data();
  const b = change.before.exists ? change.before.data() : null;
  if (b && b.testAt === a.testAt) return;
  try {
    const r = await sendTo(admin.firestore(), change.after.ref, JSON.parse(a.sub), {
      title: b ? 'Camp Daniel test' : 'Notifications are on',
      body: b ? 'This is your test notification. Tap to open the app.' : 'You’ll get a notification here when someone asks for dates.',
      url: `${appUrl()}#/owner`,
      tag: 'camp-daniel-test',
    });
    console.log('Push test', ctx.params.id, r);
  } catch (e) {
    console.error('Push test failed', ctx.params.id, e && e.statusCode, e && e.body);
  }
});

// ---------- Photo thumbnails ----------
const { syncThumb } = require('./thumbs');

const thumbFn = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).firestore;

exports.thumbGuidePhoto = thumbFn.document('photos/{id}').onWrite(async (change, ctx) => {
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  try {
    await syncThumb(admin.firestore(), 'guide', ctx.params.id, before, after);
  } catch (e) {
    console.error('Thumbnail failed', ctx.params.id, e);
  }
});

exports.thumbPostPhoto = thumbFn.document('postPhotos/{id}').onWrite(async (change, ctx) => {
  const before = change.before.exists ? change.before.data() : null;
  const after = change.after.exists ? change.after.data() : null;
  try {
    await syncThumb(admin.firestore(), 'post', ctx.params.id, before, after);
  } catch (e) {
    console.error('Thumbnail failed', ctx.params.id, e);
  }
});

// For tests only.
exports._test = { buildIcs, nineAmCentral, prettyDay };
