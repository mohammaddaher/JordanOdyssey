// Jordan Odyssey: enquiry page. Pre-selects the program from ?program=<slug>,
// checks the fields, adds where the visit came from, and sends the enquiry to /api/enquiry
// (a Vercel Function that emails it). A confirmed send is reported to the dataLayer as generate_lead.
(function () {
  'use strict';

  var ENDPOINT = '/api/enquiry';

  var TEXT = {
    en: {
      name: 'Please enter your name.',
      email: 'Please enter a valid email address, like name@example.com.',
      phone: 'Please enter a valid phone or WhatsApp number, or leave it empty.',
      message: 'Please keep your message under 3,000 characters.',
      fix: 'Please check the highlighted fields.',
      sending: 'Sending…',
      sent: 'Thank you. Your enquiry has been sent, and we’ll reply by email soon.',
      failed: 'Sorry, your enquiry could not be sent. Please try again in a few minutes.',
      offline: 'The enquiry form isn’t connected yet, so this message hasn’t been sent.'
    }
  };
  var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  var t = TEXT[lang] || TEXT.en;

  var form = document.querySelector('[data-enquire-form]');
  if (!form) return;
  var select = form.querySelector('[data-program-select]');
  var status = form.querySelector('[data-form-status]');
  var summary = document.querySelector('[data-program-summary]');

  /* Program: from the link, and kept in the address when changed */
  function showSummary() {
    var opt = select.options[select.selectedIndex];
    var slug = opt && opt.getAttribute('data-slug');
    summary.hidden = !slug;
    if (!slug) return;
    summary.querySelector('[data-summary-days]').textContent = opt.getAttribute('data-days') + ' days';
    summary.querySelector('[data-summary-price]').textContent = opt.getAttribute('data-price');
    summary.querySelector('[data-summary-link]').href = opt.getAttribute('data-url');
  }
  var params = new URLSearchParams(location.search);
  var wanted = params.get('program');
  if (wanted) {
    Array.prototype.forEach.call(select.options, function (o) {
      if (o.getAttribute('data-slug') === wanted) o.selected = true;
    });
  }
  showSummary();
  select.addEventListener('change', function () {
    var slug = select.options[select.selectedIndex].getAttribute('data-slug');
    if (slug) params.set('program', slug); else params.delete('program');
    var q = params.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '')); } catch (e) { /* file:// */ }
    showSummary();
  });

  /* Checks (the server repeats them) */
  var checks = {
    name: function (v) { return v.length >= 2; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); },
    phone: function (v) { return !v || (/^[+()\d\s.-]{6,30}$/.test(v) && v.replace(/\D/g, '').length >= 6); },
    message: function (v) { return v.length <= 3000; }
  };
  function check(name) {
    var field = form.elements[name];
    var ok = checks[name](field.value.trim());
    field.setAttribute('aria-invalid', String(!ok));
    form.querySelector('[data-error-for="' + name + '"]').textContent = ok ? '' : t[name];
    return ok;
  }
  Object.keys(checks).forEach(function (name) {
    form.elements[name].addEventListener('blur', function () {
      if (this.value.trim() || this.hasAttribute('aria-invalid')) check(name);
    });
  });

  /* Where the visit came from (campaign tags, landing page, referrer), plus this page and the program.
     Stored values come from tracking.js; without storage, the current address still supplies its tags. */
  function fillSource() {
    var src = (window.JO && window.JO.attribution) ? window.JO.attribution() : {};
    var here = new URLSearchParams(location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'].forEach(function (k) {
      if (!src[k] && here.get(k)) src[k] = here.get(k).slice(0, 300);
    });
    var opt = select.options[select.selectedIndex];
    src.landing_page = src.landing_page || location.href;
    src.referrer = src.referrer || document.referrer;
    src.page_submitted_from = location.href;
    src.language = lang;
    src.program_slug = (opt && opt.getAttribute('data-slug')) || '';
    Array.prototype.forEach.call(form.querySelectorAll('[data-source]'), function (input) {
      input.value = src[input.name] || '';
    });
  }

  /* "3–4 travellers" -> "3-4", "9 or more travellers" -> "9+", nothing chosen -> "not_given" */
  function travellerCount(v) {
    if (!v) return 'not_given';
    if (/or more/.test(v)) return v.replace(/\D+/g, '') + '+';
    return v.replace(/[^\d–-]/g, '').replace('–', '-');
  }

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = Object.keys(checks).filter(function (name) { return !check(name); });
    if (bad.length) {
      setStatus(t.fix, 'error');
      form.elements[bad[0]].focus();
      return;
    }
    fillSource();
    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
    // Kept before the form resets: the analytics event carries no personal details
    var lead = {
      event: 'generate_lead',
      form_name: 'enquiry',
      program: data.program_slug || 'undecided',
      language: lang,
      travellers: travellerCount(data.travelers)
    };
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    setStatus(t.sending);
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, ok: r.ok, body: body }; });
      })
      .then(function (res) {
        if (res.ok && res.body.ok === true) {
          setStatus(t.sent, 'success');
          form.reset();
          showSummary();
          // Only after the server confirms the enquiry was sent
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push(lead);
          return;
        }
        var err = res.body.error;
        if (err === 'validation' && res.body.fields) {
          var first = null;
          Object.keys(res.body.fields).forEach(function (name) {
            if (!form.elements[name] || !t[name]) return;
            form.elements[name].setAttribute('aria-invalid', 'true');
            form.querySelector('[data-error-for="' + name + '"]').textContent = t[name];
            first = first || name;
          });
          setStatus(t.fix, 'error');
          if (first) form.elements[first].focus();
        } else if (err === 'not_configured') {
          setStatus(t.offline, 'error');
        } else {
          setStatus(t.failed, 'error');
        }
      })
      .catch(function () { setStatus(t.failed, 'error'); })
      .then(function () { button.disabled = false; });
  });
})();
