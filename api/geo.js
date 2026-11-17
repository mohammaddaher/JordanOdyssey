// Jordan Odyssey: the visitor's country (Vercel Function, GET /api/geo).
// The cookie banner uses it to appear only in the EU/EEA, the UK and Switzerland.
// Vercel adds x-vercel-ip-country to every request; nothing is stored or logged.

'use strict';

module.exports = function handler(req, res) {
  const country = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ country: /^[A-Z]{2}$/.test(country) ? country : '' });
};
