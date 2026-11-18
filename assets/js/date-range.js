// Jordan Odyssey: travel dates calendar on the enquiry page.
// The "Travel dates" button opens a month calendar; visitors pick a start and an end date, then Apply.
// The range is shown on the button and sent in the hidden "dates" field as readable text plus ISO dates,
// e.g. "12–19 April 2027 (2027-04-12 to 2027-04-19)", which /api/enquiry emails as it is.
// Keyboard: arrows move by day and week, Home/End to the week's start and end, Page Up/Down change month
// (with Shift, year), Enter or Space picks a day, Escape closes without applying. Dates before today are off.
(function () {
  'use strict';

  var root = document.querySelector('[data-date-range]');
  if (!root) return;
  var trigger = root.querySelector('[data-date-trigger]');
  var label = root.querySelector('[data-date-text]');
  var hidden = root.querySelector('[data-date-value]');
  var dialog = root.querySelector('[data-datepicker]');
  var form = root.closest('form');

  var lang = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
  var LOCALE = lang === 'ar' ? 'ar' : 'en-GB';
  var TEXT = {
    en: {
      placeholder: 'Select travel dates',
      prev: 'Previous month', next: 'Next month',
      clear: 'Clear', apply: 'Apply',
      pickStart: 'Choose the first day of your trip.',
      pickEnd: 'Now choose the last day, or Apply for a single day.',
      chosen: 'Your dates: ',
      cleared: 'Dates cleared.',
      start: 'first day', end: 'last day', inRange: 'in your dates', today: 'today'
    }
  };
  var t = TEXT[lang] || TEXT.en;

  /* ---------- Dates as local calendar days ---------- */
  function day(y, m, d) { return new Date(y, m, d); }
  function same(a, b) { return !!a && !!b && a.getTime() === b.getTime(); }
  function addDays(d, n) { return day(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function addMonths(d, n) {
    var last = day(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
    return day(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var now = new Date();
  var TODAY = day(now.getFullYear(), now.getMonth(), now.getDate());
  var MAX = day(TODAY.getFullYear() + 3, TODAY.getMonth(), TODAY.getDate());
  function clamp(d) { return d < TODAY ? TODAY : (d > MAX ? MAX : d); }

  var fmt = function (o) { return new Intl.DateTimeFormat(LOCALE, o); };
  var fDay = fmt({ day: 'numeric' });
  var fDayMonth = fmt({ day: 'numeric', month: 'long' });
  var fFull = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
  var fMonth = fmt({ month: 'long', year: 'numeric' });
  var fLong = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var fWeek = fmt({ weekday: 'short' });

  /* "12–19 April 2027", "28 April – 3 May 2027", "28 December 2026 – 3 January 2027", "12 April 2027" */
  function rangeText(a, b) {
    if (!b || same(a, b)) return fFull.format(a);
    if (a.getFullYear() !== b.getFullYear()) return fFull.format(a) + ' – ' + fFull.format(b);
    if (a.getMonth() !== b.getMonth()) return fDayMonth.format(a) + ' – ' + fFull.format(b);
    return fDay.format(a) + '–' + fFull.format(b);
  }

  /* ---------- State ---------- */
  var applied = { start: null, end: null };   // what the form sends
  var pick = { start: null, end: null };      // what the open calendar shows
  var view = day(TODAY.getFullYear(), TODAY.getMonth(), 1);
  var focusDay = TODAY;

  function show() {
    if (applied.start) {
      label.textContent = rangeText(applied.start, applied.end);
      label.classList.remove('is-empty');
      hidden.value = rangeText(applied.start, applied.end) + ' (' + iso(applied.start) +
        (applied.end && !same(applied.start, applied.end) ? ' to ' + iso(applied.end) : '') + ')';
    } else {
      label.textContent = t.placeholder;
      label.classList.add('is-empty');
      hidden.value = '';
    }
  }

  /* ---------- Calendar ---------- */
  var chevron = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="' + d + '"/></svg>';
  };
  dialog.innerHTML =
    '<div class="dp-head">' +
      '<button class="dp-nav" type="button" data-dp-prev aria-label="' + t.prev + '">' + chevron('M15 5l-7 7 7 7') + '</button>' +
      '<h3 class="dp-title" id="dp-title" aria-live="polite"></h3>' +
      '<button class="dp-nav" type="button" data-dp-next aria-label="' + t.next + '">' + chevron('M9 5l7 7-7 7') + '</button>' +
    '</div>' +
    '<table class="dp-grid" role="grid" aria-labelledby="dp-title"><thead><tr></tr></thead><tbody></tbody></table>' +
    '<p class="dp-hint" aria-live="polite" data-dp-hint></p>' +
    '<div class="dp-actions">' +
      '<button class="dp-btn dp-clear" type="button" data-dp-clear>' + t.clear + '</button>' +
      '<button class="dp-btn dp-apply" type="button" data-dp-apply>' + t.apply + '</button>' +
    '</div>';
  var title = dialog.querySelector('.dp-title');
  var head = dialog.querySelector('thead tr');
  var body = dialog.querySelector('tbody');
  var hint = dialog.querySelector('[data-dp-hint]');
  var prevBtn = dialog.querySelector('[data-dp-prev]');
  var nextBtn = dialog.querySelector('[data-dp-next]');

  // Weekday names, Monday first
  for (var i = 0; i < 7; i++) {
    var wd = day(2024, 0, 1 + i); // 1 January 2024 was a Monday
    var th = document.createElement('th');
    th.scope = 'col';
    th.abbr = fmt({ weekday: 'long' }).format(wd);
    th.textContent = fWeek.format(wd);
    head.appendChild(th);
  }

  function render() {
    title.textContent = fMonth.format(view);
    prevBtn.disabled = view <= day(TODAY.getFullYear(), TODAY.getMonth(), 1);
    nextBtn.disabled = view >= day(MAX.getFullYear(), MAX.getMonth(), 1);
    body.textContent = '';
    var first = (view.getDay() + 6) % 7; // blank cells before the 1st, weeks starting Monday
    var days = day(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    var row = null;
    for (var cell = 0; cell < first + days; cell++) {
      if (cell % 7 === 0) { row = document.createElement('tr'); body.appendChild(row); }
      var td = document.createElement('td');
      row.appendChild(td);
      if (cell < first) continue;
      var d = day(view.getFullYear(), view.getMonth(), cell - first + 1);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-day';
      b.textContent = d.getDate();
      b.setAttribute('data-date', iso(d));
      b.tabIndex = same(d, focusDay) ? 0 : -1;
      var notes = [];
      var isStart = same(d, pick.start);
      var isEnd = pick.end ? same(d, pick.end) : isStart;
      var inside = pick.start && pick.end && d > pick.start && d < pick.end;
      if (isStart) { td.classList.add('range-start'); notes.push(t.start); }
      if (isEnd) { td.classList.add('range-end'); if (!isStart) notes.push(t.end); }
      if (inside) { td.classList.add('in-range'); notes.push(t.inRange); }
      if (same(d, TODAY)) { b.classList.add('is-today'); notes.push(t.today); }
      b.setAttribute('aria-pressed', String(isStart || isEnd || !!inside));
      b.setAttribute('aria-label', fLong.format(d) + (notes.length ? ', ' + notes.join(', ') : ''));
      if (d < TODAY || d > MAX) b.disabled = true;
      td.appendChild(b);
    }
  }

  function focusCurrent() {
    var b = body.querySelector('[data-date="' + iso(focusDay) + '"]');
    if (b) b.focus();
  }
  function moveTo(d) {
    focusDay = clamp(d);
    if (focusDay.getMonth() !== view.getMonth() || focusDay.getFullYear() !== view.getFullYear()) {
      view = day(focusDay.getFullYear(), focusDay.getMonth(), 1);
    }
    render();
    focusCurrent();
  }

  function choose(d) {
    if (!pick.start || pick.end || d < pick.start) {
      pick = { start: d, end: null };
      hint.textContent = t.pickEnd;
    } else {
      pick.end = d;
      hint.textContent = t.chosen + rangeText(pick.start, pick.end) + '.';
    }
    focusDay = d;
    render();
    focusCurrent();
  }

  /* ---------- Open, close, apply ---------- */
  function open() {
    pick = { start: applied.start, end: applied.end };
    focusDay = clamp(applied.start || TODAY);
    view = day(focusDay.getFullYear(), focusDay.getMonth(), 1);
    hint.textContent = pick.start ? t.chosen + rangeText(pick.start, pick.end) + '.' : t.pickStart;
    render();
    dialog.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    // keep the whole calendar on screen, then put focus on the day
    var r = dialog.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) dialog.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    focusCurrent();
    document.addEventListener('pointerdown', outside, true);
  }
  function close(returnFocus) {
    if (dialog.hidden) return;
    dialog.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    if (returnFocus) trigger.focus();
  }
  function outside(e) {
    // a tap or click outside closes the calendar without applying
    if (!root.contains(e.target)) close(false);
    else if (trigger.contains(e.target)) { /* the trigger's own click toggles it */ }
  }
  function apply() {
    applied = { start: pick.start, end: pick.start ? (pick.end || pick.start) : null };
    show();
    close(true);
  }

  trigger.addEventListener('click', function () {
    if (dialog.hidden) open(); else close(true);
  });
  prevBtn.addEventListener('click', function () { view = addMonths(view, -1); focusDay = clamp(day(view.getFullYear(), view.getMonth(), 1)); render(); });
  nextBtn.addEventListener('click', function () { view = addMonths(view, 1); focusDay = clamp(day(view.getFullYear(), view.getMonth(), 1)); render(); });
  dialog.querySelector('[data-dp-clear]').addEventListener('click', function () {
    pick = { start: null, end: null };
    hint.textContent = t.cleared + ' ' + t.pickStart;
    render();
  });
  dialog.querySelector('[data-dp-apply]').addEventListener('click', apply);
  body.addEventListener('click', function (e) {
    var b = e.target.closest('.dp-day');
    if (!b || b.disabled) return;
    var p = b.getAttribute('data-date').split('-');
    choose(day(+p[0], +p[1] - 1, +p[2]));
  });

  var rtl = function () { return getComputedStyle(dialog).direction === 'rtl'; };
  dialog.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (e.key === 'Tab') {
      // keep Tab inside the open calendar
      var stops = Array.prototype.filter.call(dialog.querySelectorAll('button'), function (b) { return !b.disabled && b.tabIndex !== -1; });
      var first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (!e.target.classList.contains('dp-day')) return;
    var step = { ArrowLeft: rtl() ? 1 : -1, ArrowRight: rtl() ? -1 : 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    var d = null;
    if (step) d = addDays(focusDay, step);
    else if (e.key === 'Home') d = addDays(focusDay, -((focusDay.getDay() + 6) % 7));
    else if (e.key === 'End') d = addDays(focusDay, 6 - ((focusDay.getDay() + 6) % 7));
    else if (e.key === 'PageUp') d = addMonths(focusDay, e.shiftKey ? -12 : -1);
    else if (e.key === 'PageDown') d = addMonths(focusDay, e.shiftKey ? 12 : 1);
    if (d) { e.preventDefault(); moveTo(d); }
  });
  // Escape from the trigger also closes an open calendar
  trigger.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dialog.hidden) { e.preventDefault(); close(true); } });

  // After a successful send the form resets: clear the dates too
  if (form) form.addEventListener('reset', function () { applied = { start: null, end: null }; setTimeout(show, 0); close(false); });

  show();
})();
