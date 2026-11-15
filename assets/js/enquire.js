// Jordan Odyssey: enquiry page. Pre-selects the program from ?program=<slug>,
// checks the fields, and sends the enquiry once the server endpoint exists.
(function () {
  'use strict';

  // Set to '/api/enquiry' once the Vercel Function and email service are connected.
  var ENDPOINT = null;

  var TEXT = {
    en: {
      name: 'Please enter your name.',
      email: 'Please enter a valid email address, like name@example.com.',
      phone: 'Please enter a valid phone or WhatsApp number, or leave it empty.',
      message: 'Please write a short message (at least 10 characters).',
      fix: 'Please check the highlighted fields.',
      sending: 'Sending…',
      sent: 'Thank you. Your enquiry has been sent, and we’ll reply by email soon.',
      failed: 'Sorry, your enquiry could not be sent. Please try again in a few minutes.',
      offline: 'The enquiry form isn’t connected yet, so this message hasn’t been sent.'
    }
  };
  var t = TEXT[document.documentElement.lang] || TEXT.en;

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
    summary.querySelector('[data-summary-name]').textContent = opt.value;
    summary.querySelector('[data-summary-days]').textContent = opt.getAttribute('data-days') + ' days';
    summary.querySelector('[data-summary-price]').textContent = 'From ' + opt.getAttribute('data-price');
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
    message: function (v) { return v.length >= 10; }
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
    if (!ENDPOINT) { setStatus(t.offline, 'error'); return; }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
    data.page = location.href;
    var button = form.querySelector('[type="submit"]');
    button.disabled = true;
    setStatus(t.sending);
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        setStatus(t.sent, 'success');
        form.reset();
        showSummary();
        // Hook for analytics: a successful submission
        document.dispatchEvent(new CustomEvent('jo:enquiry-sent', { detail: { program: data.program } }));
      })
      .catch(function () { setStatus(t.failed, 'error'); })
      .then(function () { button.disabled = false; });
  });
})();
