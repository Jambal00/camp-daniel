// Emails for group trips: the invite (with the date choices) and "It's set!".

const { fmtRange } = require('./requests');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function shell({ eyebrow, heading, bodyHtml, button, link, footer }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a2533">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #d3dbe5">
<tr><td style="background:#1f4e79;color:#ffffff;padding:16px 22px;border-radius:14px 14px 0 0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;font-weight:600">${esc(eyebrow)}</td></tr>
<tr><td style="padding:22px 22px 6px;font-size:22px;font-weight:700;line-height:1.3">${esc(heading)}</td></tr>
<tr><td style="padding:6px 22px 4px;font-size:15px;line-height:1.5">${bodyHtml}</td></tr>
<tr><td style="padding:18px 22px 8px"><a href="${esc(link)}" style="display:inline-block;background:#1f4e79;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">${esc(button)}</a></td></tr>
<tr><td style="padding:6px 22px 22px;color:#556070;font-size:13px">${footer}</td></tr>
</table>
<div style="max-width:520px;color:#7c8592;font-size:12px;padding:12px 4px">Camp Daniel · Ham Lake</div>
</td></tr></table></body></html>`;
}

function prettyDay(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });
}

/** `ctx` = { host, others: [names], email, link } */
function inviteEmail(trip, ctx) {
  const dates = trip.options.map((o) => fmtRange(o.start, o.end));
  const subject = `${ctx.host} invited you: ${trip.title}`;
  const withWho = ctx.others.length ? ` with ${ctx.others.join(', ')}` : '';
  const voteBy = trip.voteBy ? `Vote by ${prettyDay(trip.voteBy)}.` : '';
  const text = [
    `${ctx.host} is putting together ${trip.title} at Camp Daniel${withWho}.`,
    ...(trip.note ? ['', trip.note] : []),
    '',
    'Which of these work for you?',
    ...dates.map((d) => `• ${d}`),
    '',
    `Vote on dates: ${ctx.link}`,
    voteBy,
    '',
    `Sign in with this email address (${ctx.email}). Google or an emailed link both work.`,
  ].join('\n');
  const html = shell({
    eyebrow: `Camp Daniel · Group trip`,
    heading: `${ctx.host} invited you to ${trip.title}`,
    bodyHtml: `<p style="margin:0 0 10px">${esc(`${ctx.host} is putting together a trip to Camp Daniel${withWho}.`)}</p>
${trip.note ? `<p style="margin:0 0 12px;padding:10px 12px;background:#f3f5f8;border-radius:10px;white-space:pre-wrap">${esc(trip.note)}</p>` : ''}
<p style="margin:0 0 6px;font-weight:700">Which of these work for you?</p>
${dates.map((d) => `<div style="padding:8px 12px;margin:0 0 6px;border:1px solid #d3dbe5;border-radius:10px">${esc(d)}</div>`).join('')}
${voteBy ? `<p style="margin:8px 0 0;color:#556070">${esc(voteBy)}</p>` : ''}`,
    button: 'Vote on dates',
    link: ctx.link,
    footer: `Sign in with this email address (${esc(ctx.email)}). Google or an emailed link both work. Reply to this email to reach ${esc(ctx.host)}.`,
  });
  return { subject, text, html };
}

/** `ctx` = { host, going: [names], link } */
function lockedEmail(trip, opt, ctx) {
  const range = fmtRange(opt.start, opt.end);
  const subject = `It's set: ${trip.title}, ${range}`;
  const text = [
    `${trip.title} is on for ${range}!`,
    '',
    `Who's going: ${ctx.going.join(', ')}`,
    ...(trip.note ? ['', trip.note] : []),
    '',
    `Your trip, directions and the cabin guide are in the app: ${ctx.link}`,
    'The door code shows at noon on arrival day.',
  ].join('\n');
  const html = shell({
    eyebrow: 'Camp Daniel · It’s set',
    heading: `${trip.title} is on for ${range}!`,
    bodyHtml: `<p style="margin:0 0 10px"><b>Who's going:</b> ${esc(ctx.going.join(', '))}</p>
${trip.note ? `<p style="margin:0 0 12px;padding:10px 12px;background:#f3f5f8;border-radius:10px;white-space:pre-wrap">${esc(trip.note)}</p>` : ''}
<p style="margin:0;color:#556070">Directions, the cabin guide and the door code (at noon on arrival day) are on My trip.</p>`,
    button: 'See my trip',
    link: ctx.link,
    footer: `Reply to this email to reach ${esc(ctx.host)}.`,
  });
  return { subject, text, html };
}

module.exports = { inviteEmail, lockedEmail };
