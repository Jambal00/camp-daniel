// Small copies of every photo, so galleries load fast. The full photo is fetched
// only when someone taps it.
//
// photos/{id} and postPhotos/{id} hold full-size JPEG data URLs (up to ~600 KB each).
// photoThumbs/{id} (same id) holds a ~480px copy plus what a gallery needs to list it.

const sharp = require('sharp');

const EDGE = 480;

async function makeThumb(dataUrl) {
  const m = /^data:image\/[a-z+]+;base64,(.*)$/i.exec(dataUrl || '');
  if (!m) throw new Error('Not an image data URL');
  const buf = await sharp(Buffer.from(m[1], 'base64'))
    .rotate()
    .resize(EDGE, EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function metaFor(kind, d) {
  return kind === 'guide'
    ? { kind, sectionId: d.sectionId || '', caption: d.caption || '', order: d.order ?? 0 }
    : { kind, postId: d.postId || '', authorId: d.authorId || '', caption: '', order: d.order ?? 0 };
}

/** Keep photoThumbs/{id} in step with its source photo. */
async function syncThumb(db, kind, id, before, after) {
  const ref = db.collection('photoThumbs').doc(id);
  if (!after) {
    await ref.delete();
    return 'deleted';
  }
  const meta = metaFor(kind, after);
  const changed = !before || before.data !== after.data;
  if (changed || !(await ref.get()).exists) meta.thumb = await makeThumb(after.data);
  await ref.set(meta, { merge: true });
  return meta.thumb ? 'made' : 'meta';
}

module.exports = { makeThumb, syncThumb };
