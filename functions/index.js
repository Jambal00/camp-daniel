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
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.MAIL_FROM) throw new Error('Email is not set up yet (RESEND_API_KEY / MAIL_FROM).');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddress().header,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html,
      attachments: [{ filename: 'camp-daniel-reminder.ics', content: Buffer.from(ics).toString('base64'), content_type: `text/calendar; method=${method}` }],
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
