/* Best time to visit Jordan (en/travel-guide/best-time-to-visit-jordan.html)
   - Month tabs: click, or the arrow keys, Home and End (the tab pattern: one tab in the Tab order).
     The current month is chosen by a short inline script in the page, before it is drawn.
   - Questions: each one opens and closes; the answers stay in the page for search engines and
     the FAQPage schema, and show in full when scripts don't run. */
(function () {
  'use strict';

  var tablist = document.querySelector('[data-month-tabs]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    // a month's photo waits for the page to load (data-defer); show it at once if its month is chosen sooner
    var showPhoto = function (panel) {
      var pic = panel.querySelector('picture[data-defer]');
      if (!pic) return;
      pic.removeAttribute('data-defer');
      Array.prototype.forEach.call(pic.querySelectorAll('source, img'), function (p) {
        if (p.hasAttribute('data-srcset')) { p.setAttribute('srcset', p.getAttribute('data-srcset')); p.removeAttribute('data-srcset'); }
        if (p.hasAttribute('data-src')) { p.setAttribute('src', p.getAttribute('data-src')); p.removeAttribute('data-src'); }
      });
    };
    var select = function (index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        var panel = document.getElementById(tab.getAttribute('aria-controls'));
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        panel.hidden = !on;
        if (on) showPhoto(panel);
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      });
    });
  }

  var faq = document.querySelector('[data-faq]');
  if (faq) {
    Array.prototype.forEach.call(faq.querySelectorAll('.bt-faq-toggle'), function (button) {
      var answer = document.getElementById(button.getAttribute('aria-controls'));
      var set = function (open) {
        button.setAttribute('aria-expanded', String(open));
        answer.hidden = !open;
      };
      set(false);   // closed to start, as in the design
      button.addEventListener('click', function () { set(button.getAttribute('aria-expanded') !== 'true'); });
    });
  }
})();
