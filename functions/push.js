// Phone notifications (standard Web Push). Owners turn them on per phone in the app;
// each phone's subscription is saved in pushSubs/{id}. The key pair lives in the
// owners-only secrets/push doc (made once by the "Set up push keys" workflow).

const webpush = require('web-push');

let keys = null;
async function vapid(db) {
  if (keys) return keys;
  const snap = await db.collection('secrets').doc('push').get();
  const d = snap.exists ? snap.data() : null;
  if (!d || !d.publicKey || !d.privateKey) throw new Error('Push keys are not set up yet (secrets/push).');
  keys = d;
  return keys;
}

/** Send to one saved subscription; deletes it if the phone has turned it off. */
async function sendTo(db, ref, sub, payload) {
  const k = await vapid(db);
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: { subject: 'mailto:camp@camp.productdna.net', publicKey: k.publicKey, privateKey: k.privateKey },
      TTL: 60 * 60 * 24,
      urgency: 'high',
    });
    return 'sent';
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) {
      await ref.delete();
      return 'gone';
    }
    throw e;
  }
}

/** Notify every phone these people turned notifications on for. */
async function pushToPeople(db, personIds, payload) {
  const ids = personIds.map((x) => String(x).toLowerCase());
  const out = { sent: 0, gone: 0, failed: 0 };
  for (let i = 0; i < ids.length; i += 10) {
    const snap = await db.collection('pushSubs').where('personId', 'in', ids.slice(i, i + 10)).get();
    for (const d of snap.docs) {
      try {
        out[await sendTo(db, d.ref, JSON.parse(d.data().sub), payload)]++;
      } catch (e) {
        out.failed++;
        console.error('Push failed', d.id, e && e.statusCode, e && e.body);
      }
    }
  }
  return out;
}

module.exports = { pushToPeople, sendTo };
