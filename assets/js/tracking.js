// Jordan Odyssey: cookie consent banner (Google Consent Mode v2), visit attribution and analytics events.
// The consent defaults and Google Tag Manager load inline at the top of every page's <head>;
// this file runs after them. No personal data (name, email, phone) is ever sent to the dataLayer.
(function () {
  'use strict';

  var w = window;
  var d = document;
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }

  var lang = (d.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  var DAY = 24 * 60 * 60 * 1000;
  var now = Date.now();

  // Storage can be blocked (private windows, strict settings): every read and write is guarded,
  // and the site works the same without it.
  function load(key) {
    try { var v = w.localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function save(key, value) {
    try { w.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }
  function forget(key) {
    try { w.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  }

  /* ---------- Where the visitor came from ---------- */

  var CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
  var params = new URLSearchParams(location.search);
  var fresh = {};
  CAMPAIGN_KEYS.forEach(function (k) {
    var v = params.get(k);
    if (v) fresh[k] = v.slice(0, 300);
  });
  var hasFresh = Object.keys(fresh).length > 0;

  // Last campaign wins: new campaign parameters replace the old set; otherwise the old set is kept for 90 days.
  var campaign = load('jo_campaign');
  if (hasFresh) {
    campaign = { values: fresh, at: now };
    save('jo_campaign', campaign);
  } else if (campaign && !(now - campaign.at < 90 * DAY)) {
    campaign = null;
    forget('jo_campaign');
  }

  // A visit ends after 30 minutes without a page view; its first page records the landing page and referrer.
  var visit = load('jo_visit');
  if (!visit || !(now - visit.last < 30 * 60 * 1000) || hasFresh) {
    visit = { landing_page: location.href.slice(0, 500), referrer: d.referrer.slice(0, 500), last: now };
  } else {
    visit.last = now;
  }
  save('jo_visit', visit);

  w.JO = w.JO || {};
  /** Everything the enquiry form sends in its "Source" section, as plain strings. */
  w.JO.attribution = function () {
    var out = {};
    var values = (campaign && campaign.values) || {};
    CAMPAIGN_KEYS.forEach(function (k) { out[k] = values[k] || ''; });
    out.landing_page = visit.landing_page || '';
    out.referrer = visit.referrer || '';
    return out;
  };

  /* ---------- Cookie consent ---------- */

  // EU and EEA countries, the UK and Switzerland: analytics and ads stay off until the visitor accepts.
  // The same list sets Google's consent defaults in each page's <head>.
  var CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU',
    'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];

  // Banner wording, one entry per language. Arabic pages pick up the "ar" entry and right-to-left layout.
  var TEXT = {
    en: {
      label: 'Cookie choices',
      text: 'We use cookies to understand how people use this site and to measure our ads. You can accept or reject them.',
      privacy: 'Privacy policy',
      accept: 'Accept',
      reject: 'Reject'
    },
    ar: {
      label: 'خيارات ملفات تعريف الارتباط',
      text: 'نستخدم ملفات تعريف الارتباط لفهم طريقة استخدام هذا الموقع ولقياس أداء إعلاناتنا. يمكنك قبولها أو رفضها.',
      privacy: 'سياسة الخصوصية',
      accept: 'قبول',
      reject: 'رفض'
    }
  };
  var t = TEXT[lang] || TEXT.en;

  function applyChoice(choice) {
    var v = choice === 'accepted' ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
  }

  var banner = null;
  function buildBanner() {
    banner = d.createElement('section');
    banner.className = 'consent';
    banner.setAttribute('aria-label', t.label);
    banner.setAttribute('dir', d.documentElement.dir || (lang === 'ar' ? 'rtl' : 'ltr'));
    banner.hidden = true;
    banner.innerHTML =
      '<div class="consent-inner">' +
        '<p class="consent-text"></p>' +
        '<div class="consent-actions">' +
          '<button type="button" class="btn btn--ghost btn--small consent-btn" data-consent="rejected"></button>' +
          '<button type="button" class="btn btn--primary btn--small consent-btn" data-consent="accepted"></button>' +
        '</div>' +
      '</div>';
    var text = banner.querySelector('.consent-text');
    text.appendChild(d.createTextNode(t.text + ' '));
    var link = d.createElement('a');
    link.href = '/' + (TEXT[lang] ? lang : 'en') + '/privacy.html';
    link.textContent = t.privacy;
    text.appendChild(link);
    banner.querySelector('[data-consent="accepted"]').textContent = t.accept;
    banner.querySelector('[data-consent="rejected"]').textContent = t.reject;
    banner.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var choice = btn.getAttribute('data-consent');
      applyChoice(choice);
      save('jo_consent', { choice: choice, at: Date.now() });
      hideBanner();
    });
    d.body.appendChild(banner);
  }
  var returnFocus = null;
  function showBanner(fromSettings) {
    if (!banner) buildBanner();
    banner.hidden = false;
    d.documentElement.classList.add('consent-open');
    if (fromSettings) {
      returnFocus = d.activeElement;
      banner.querySelector('.consent-btn').focus();
    }
  }
  function hideBanner() {
    banner.hidden = true;
    d.documentElement.classList.remove('consent-open');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  // "Cookie settings" links (footer, privacy page) reopen the banner
  d.addEventListener('click', function (e) {
    var opener = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (!opener) return;
    e.preventDefault();
    showBanner(true);
  });

  // A choice is remembered for a year; the head script has already applied it.
  var stored = load('jo_consent');
  if (stored && !(now - stored.at < 365 * DAY)) { stored = null; forget('jo_consent'); }

  function decide(country) {
    // No country (local preview, lookup failed): show the banner to everyone
    if (!country || CONSENT_REGIONS.indexOf(country) !== -1) showBanner(false);
  }
  if (!stored) {
    // ?consent_region=DE (or US) previews the banner for that country
    var forced = (params.get('consent_region') || '').toUpperCase();
    var cached = null;
    try { cached = w.sessionStorage.getItem('jo_country'); } catch (e) { /* storage unavailable */ }
    if (forced) decide(forced);
    else if (cached !== null) decide(cached);
    else if (w.fetch) {
      // Vercel reports the visitor's country from their IP address
      fetch('/api/geo', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (data) {
          var c = typeof data.country === 'string' ? data.country.toUpperCase() : '';
          try { w.sessionStorage.setItem('jo_country', c); } catch (e) { /* storage unavailable */ }
          decide(c);
        })
        .catch(function () { decide(''); });
    } else decide('');
  }

  /* ---------- Click events ---------- */

  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    // Calls to action: every link to the enquiry page, plus any link marked data-cta (one event per click)
    if (/(^|\/)enquire\.html(\?|#|$)/.test(href) || a.hasAttribute('data-cta')) {
      var program = '';
      try { program = new URL(a.href).searchParams.get('program') || ''; } catch (err) { /* old browsers */ }
      w.dataLayer.push({
        event: 'cta_click',
        cta_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        program: program || 'none'
      });
    } else if (/^https?:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?whatsapp\.com)\//i.test(href)) {
      w.dataLayer.push({ event: 'whatsapp_click' });
    } else if (/^tel:/i.test(href)) {
      w.dataLayer.push({ event: 'phone_click' });
    } else if (/^mailto:/i.test(href)) {
      w.dataLayer.push({ event: 'email_click' });
    }
  });
})();
