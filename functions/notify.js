// Who gets which phone notification, and when.
// Each person picks which ones they want on the Notifications screen (notifyPrefs/{email});
// anything they haven't switched off is on.

const { pushToPeople } = require('./push');
const { fmtShort } = require('./requests');

const TZ = 'America/Chicago';

/** Today in Chicago as YYYY-MM-DD, optionally shifted by whole days. */
function chicagoDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

async function wants(db, personId, key) {
  const snap = await db.collection('notifyPrefs').doc(String(personId).toLowerCase()).get();
  return !(snap.exists && snap.data()[key] === false);
}

/** Push to each person who hasn't switched this kind off. */
async function notify(db, personIds, key, payload) {
  const to = [];
  for (const p of personIds) if (await wants(db, p, key)) to.push(p);
  if (!to.length) return { sent: 0, skipped: personIds.length };
  return pushToPeople(db, to, payload);
}

/** Send once per (thing, kind): remembers in notified/{id} so retries and re-runs don't repeat. */
async function once(db, id, fn) {
  const ref = db.collection('notified').doc(id);
  try {
    await ref.create({ at: new Date().toISOString() });
  } catch (e) {
    if (e && (e.code === 6 || /already exists/i.test(String(e.message)))) return 'already';
    throw e;
  }
  await fn();
  return 'sent';
}

async function ownerIds(db) {
  const owners = await db.collection('people').where('tier', '==', 'owner').get();
  return owners.docs.map((d) => d.id).filter((id) => id.includes('@'));
}

async function nameOf(db, personId, fallback) {
  const s = await db.collection('people').doc(personId).get();
  const n = s.exists ? s.data().name : '';
  return (n || fallback || 'A guest').replace(/\s*\(example\)/, '');
}
const first = (name) => String(name).split(/\s+&?\s*/)[0];

module.exports = { chicagoDay, wants, notify, once, ownerIds, nameOf, first, fmtShort };
