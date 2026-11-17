// Jordan Odyssey: enquiry form endpoint (Vercel Function, POST /api/enquiry).
// Checks the fields again, quietly drops spam, and emails the enquiry through Resend (https://resend.com).
//
// Vercel environment variables (Project → Settings → Environment Variables):
//   RESEND_API_KEY  the Resend API key (required)
//   ENQUIRY_TO      the inbox that receives enquiries (required)
//   ENQUIRY_FROM    the sender, e.g. "Jordan Odyssey <enquiries@jordanodyssey.com>" once the domain is
//                   verified in Resend; until then Resend's test sender is used, which can only
//                   deliver to the email address of the Resend account itself.
//
// Responses: 200 {ok:true} · 422 {error:'validation', fields:{name:'invalid',…}} · 503 {error:'not_configured'}
//            · 502 {error:'send_failed'} · 400/403/405 for malformed, cross-site or non-POST requests.
// The page shows its own localized message for each error code.

'use strict';

const LIMITS = { program: 200, dates: 100, travelers: 50, message: 3000, name: 100, email: 200, phone: 30 };
const SOURCE = [
  ['utm_source', 'utm_source'], ['utm_medium', 'utm_medium'], ['utm_campaign', 'utm_campaign'],
  ['utm_term', 'utm_term'], ['utm_content', 'utm_content'],
  ['gclid', 'gclid (Google Ads)'], ['gbraid', 'gbraid (Google Ads)'], ['wbraid', 'wbraid (Google Ads)'], ['fbclid', 'fbclid (Meta)'],
  ['landing_page', 'Landing page'], ['referrer', 'Referrer'], ['page_submitted_from', 'Submitted from'],
  ['language', 'Language'], ['program_slug', 'Program slug']
];
const ALLOWED_ORIGIN = /^https:\/\/(www\.)?jordanodyssey\.com$|^https:\/\/[a-z0-9-]+\.vercel\.app$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Strip control characters; single-line fields also lose line breaks
function clean(value, max, multiline) {
  let s = String(value == null ? '' : value);
  s = multiline ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : s.replace(/[\u0000-\u001F\u007F]+/g, ' ');
  return s.trim().slice(0, max);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function validate(body) {
  const errors = {};
  const name = clean(body.name, 1000);
  const email = clean(body.email, 1000);
  const phone = clean(body.phone, 1000);
  if (name.length < 2 || name.length > LIMITS.name) errors.name = 'invalid';
  if (email.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'invalid';
  if (phone && !(phone.length <= LIMITS.phone && /^[+()\d\s.-]{6,30}$/.test(phone) && phone.replace(/\D/g, '').length >= 6)) errors.phone = 'invalid';
  if (clean(body.message, 100000, true).length > LIMITS.message) errors.message = 'too_long';
  return errors;
}

function buildEmail(f, src) {
  const rows = [
    ['Program', f.program || 'Not chosen'],
    ['Travel dates', f.dates || 'Not given'],
    ['Travellers', f.travelers || 'Not given'],
    ['Name', f.name],
    ['Email', f.email],
    ['Phone or WhatsApp', f.phone || 'Not given']
  ];
  const sourceRows = SOURCE.map(([key, label]) => [label, src[key] || '—']);

  const text = [
    'New enquiry from jordanodyssey.com', '',
    ...rows.map(([k, v]) => `${k}: ${v}`), '',
    'Message:', f.message || '(no message)', '',
    '— Source —',
    ...sourceRows.map(([k, v]) => `${k}: ${v}`)
  ].join('\n');

  const table = (list) => list.map(([k, v]) =>
    `<tr><th style="text-align:left;vertical-align:top;padding:4px 16px 4px 0;color:#5c463a;font-weight:600;white-space:nowrap">${escapeHtml(k)}</th>` +
    `<td style="padding:4px 0;word-break:break-word">${escapeHtml(v)}</td></tr>`).join('');
  const html =
    '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#2b1a13;max-width:640px">' +
    '<h2 style="margin:0 0 12px;color:#4a170f">New enquiry from jordanodyssey.com</h2>' +
    `<table style="border-collapse:collapse">${table(rows)}</table>` +
    '<h3 style="margin:20px 0 6px;color:#4a170f">Message</h3>' +
    `<p style="margin:0;white-space:pre-wrap">${escapeHtml(f.message || '(no message)')}</p>` +
    '<h3 style="margin:28px 0 6px;padding-top:12px;border-top:1px solid #e5d3b8;color:#4a170f">Source</h3>' +
    `<table style="border-collapse:collapse;font-size:14px">${table(sourceRows)}</table>` +
    '</div>';
  return { text, html };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGIN.test(origin)) return res.status(403).json({ ok: false, error: 'origin' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ ok: false, error: 'invalid' });

  // Spam trap: people never see the "website" field. Pretend success so bots learn nothing.
  if (clean(body.website, 500)) return res.status(200).json({ ok: true });

  const errors = validate(body);
  if (Object.keys(errors).length) return res.status(422).json({ ok: false, error: 'validation', fields: errors });

  const f = {};
  for (const [key, max] of Object.entries(LIMITS)) f[key] = clean(body[key], max, key === 'message');
  const src = {};
  for (const [key] of SOURCE) src[key] = clean(body[key], 500);

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ENQUIRY_TO;
  if (!apiKey || !to) {
    console.error('Enquiry not sent: RESEND_API_KEY or ENQUIRY_TO is not set');
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }

  const { text, html } = buildEmail(f, src);
  const subject = `New enquiry: ${f.program || 'No program chosen'} — ${f.name}`.slice(0, 200);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.ENQUIRY_FROM || 'Jordan Odyssey <onboarding@resend.dev>',
        to: to.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: f.email,
        subject,
        text,
        html
      })
    });
    if (!r.ok) {
      console.error('Resend error', r.status, (await r.text()).slice(0, 500));
      return res.status(502).json({ ok: false, error: 'send_failed' });
    }
  } catch (e) {
    console.error('Resend request failed', e && e.message);
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
  return res.status(200).json({ ok: true });
};

module.exports.buildEmail = buildEmail;
module.exports.validate = validate;
