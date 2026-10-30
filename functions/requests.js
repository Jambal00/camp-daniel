// Email Pete & Trisha when a guest asks for dates (or asks to move a stay).

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TIER_LABEL = { owner: 'Us', kids: 'Kids', friends: 'Friends & family' };

/** "2026-12-11" -> Date at noon UTC (no time-zone drift). */
const day = (iso) => new Date(`${iso}T12:00:00Z`);
const nights = (b) => Math.round((day(b.end) - day(b.start)) / 86400000);

function fmtRange(start, end) {
  const s = day(start), e = day(end);
  const md = (d, opts) => d.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const yr = sameYear && s.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: 'numeric' };
  return `${md(s, { weekday: 'short', month: 'short', day: 'numeric' })} – ${md(e, { weekday: 'short', month: 'short', day: 'numeric', ...yr })}`;
}
function fmtShort(start, end) {
  const s = day(start), e = day(end);
  const m = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' });
  return m(s) === m(e) ? `${m(s)} ${s.getUTCDate()}–${e.getUTCDate()}` : `${m(s)} ${s.getUTCDate()} – ${m(e)} ${e.getUTCDate()}`;
}
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Everything the email needs, from the new booking plus a few lookups.
 * `ctx` = { person, replaced, busy: [{start,end,id}], pending: [booking], appUrl }
 */
function buildRequestEmail(id, b, ctx) {
  const who = ctx.person?.name || b.names || b.personId;
  const tier = TIER_LABEL[ctx.person?.tier] || '';
  const n = nights(b);
  const range = fmtRange(b.start, b.end);
  const isChange = !!b.replaces;
  const link = `${ctx.appUrl}#/owner/approve/${id}`;

  const clashBusy = ctx.busy.filter((x) => x.id !== b.replaces && overlaps(x, b));
  const clashPending = ctx.pending.filter((x) => x.id !== id && overlaps(x, b));
  const warnings = [];
  if (clashBusy.length) warnings.push(`Overlaps a stay that's already approved or blocked (${clashBusy.map((x) => fmtShort(x.start, x.end)).join(', ')}).`);
  if (clashPending.length) warnings.push(`${clashPending.length === 1 ? 'Another request wants' : `${clashPending.length} other requests want`} some of the same nights. The app sorts them by dibs.`);

  const subject = isChange
    ? `Change of dates: ${who} → ${fmtShort(b.start, b.end)}`
    : `New request: ${who}, ${fmtShort(b.start, b.end)} (${n} night${n === 1 ? '' : 's'})`;

  const rows = [
    ['Who', `${who}${tier ? ` · ${tier}` : ''}`],
    ['Dates', `${range} · ${n} night${n === 1 ? '' : 's'}`],
    ...(isChange && ctx.replaced ? [['Instead of', fmtRange(ctx.replaced.start, ctx.replaced.end)]] : []),
    ['Party', `${b.partySize || '?'}${b.names ? ` · ${b.names}` : ''}`],
    ...(b.note ? [['Note', b.note]] : []),
  ];

  const intro = isChange ? `${who} would like to move their stay.` : `${who} would like to come up to Camp Daniel.`;
  const text = [
    intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(warnings.length ? ['', ...warnings.map((w) => `Heads up: ${w}`)] : []),
    '',
    `Review & approve: ${link}`,
    '',
    `Reply to this email to write to ${who} directly.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2533">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #d3dbe5">
<tr><td style="background:#1f4e79;color:#ffffff;padding:16px 22px;border-radius:14px 14px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-weight:600">Camp Daniel · ${isChange ? 'Change of dates' : 'New request'}</td></tr>
<tr><td style="padding:22px 22px 6px;font-size:20px;font-weight:700;line-height:1.3">${esc(intro)}</td></tr>
<tr><td style="padding:8px 22px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${rows.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;color:#556070;font-size:14px;vertical-align:top;width:92px">${esc(k)}</td><td style="padding:7px 0;font-size:15px;vertical-align:top;white-space:pre-wrap">${esc(v)}</td></tr>`).join('\n')}
</table></td></tr>
${warnings.length ? `<tr><td style="padding:10px 22px 0"><div style="background:#fdebd8;border:1px solid #f0b47a;color:#8a4510;border-radius:10px;padding:10px 12px;font-size:14px">${warnings.map((w) => `<b>Heads up:</b> ${esc(w)}`).join('<br>')}</div></td></tr>` : ''}
<tr><td style="padding:20px 22px 8px"><a href="${esc(link)}" style="display:inline-block;background:#1f4e79;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">Review &amp; approve</a></td></tr>
<tr><td style="padding:6px 22px 22px;color:#556070;font-size:13px">Reply to this email to write to ${esc(who)} directly.</td></tr>
</table>
<div style="max-width:520px;color:#7c8592;font-size:12px;padding:12px 4px">You get this because you're an owner of Camp Daniel.</div>
</td></tr></table></body></html>`;

  return { subject, text, html };
}

module.exports = { buildRequestEmail, fmtRange, fmtShort, overlaps };
