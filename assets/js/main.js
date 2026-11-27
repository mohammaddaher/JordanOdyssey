// Jordan Odyssey — shared page behaviour (header, mobile menu, active links, reveal on scroll)
(function () {
  'use strict';

  var header = document.querySelector('[data-header]');
  var toggle = document.querySelector('[data-menu-toggle]');
  var nav = document.querySelector('[data-nav]');
  var mobileQuery = window.matchMedia('(max-width: 899px)');

  /* Fonts that only text further down the page uses (scripts/build-dist.mjs LATE_FONTS) are switched on
     once the page has loaded, so they don't compete with the first screen */
  var lateFonts = document.getElementById('late-fonts');
  if (lateFonts) {
    var fontsOn = function () { lateFonts.media = 'all'; };
    if (document.readyState === 'complete') fontsOn(); else window.addEventListener('load', fontsOn, { once: true });
  }

  /* Header turns solid once the page scrolls past the top of the hero (40px).
     An observer on a 41px marker at the top of the page tells us, so nothing reads the scroll
     position or layout while the page loads (that forced a full style and layout pass early). */
  var pastTop = false;
  function updateHeader() {
    header.classList.toggle('is-solid', pastTop || document.body.classList.contains('menu-open'));
  }
  if ('IntersectionObserver' in window) {
    var marker = document.createElement('div');
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:41px;pointer-events:none;visibility:hidden';
    document.body.appendChild(marker);
    new IntersectionObserver(function (entries) {
      pastTop = !entries[entries.length - 1].isIntersecting;
      updateHeader();
    }).observe(marker);
  } else {
    window.addEventListener('scroll', function () { pastTop = window.scrollY > 40; updateHeader(); }, { passive: true });
  }

  /* Arriving from another page at a section (e.g. index.html#programs): the browser
     aims before the web fonts settle, and the text reflow can leave the section off by
     a few lines. Aim again once the fonts settle, unless the visitor has started scrolling. */
  if (location.hash.length > 1 && document.fonts && document.fonts.ready) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    var moved = false;
    var stop = function () { moved = true; };
    ['wheel', 'touchstart', 'keydown'].forEach(function (t) { window.addEventListener(t, stop, { once: true, passive: true }); });
    if (target) document.fonts.ready.then(function () {
      setTimeout(function () { if (!moved) target.scrollIntoView({ block: 'start' }); }, 60);
    });
  }

  /* Mobile menu */
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    updateHeader();
  }
  toggle.addEventListener('click', function () {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setMenu(false);
      toggle.focus();
    }
  });
  mobileQuery.addEventListener('change', function (e) {
    if (!e.matches) setMenu(false);
  });

  /* Highlight the nav link for the section in view */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-link[href^="#"]'));
  var sections = links
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  if ('IntersectionObserver' in window) {
    var current = null;
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) current = entry.target.id;
        else if (current === entry.target.id) current = null;
      });
      links.forEach(function (link) {
        link.classList.toggle('is-active', link.getAttribute('href') === '#' + current);
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { sectionObserver.observe(s); });

    /* Reveal on scroll */
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(function (el) { revealObserver.observe(el); });

    /* Photos just below the first screen wait until the page has finished loading (so they never compete
       with the hero), or until the visitor scrolls close. The Heritage background is held back by the
       stylesheet until .is-near; images marked data-defer keep their sources in data- attributes. */
    var nearObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          release(entry.target);
          nearObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -24px 0px' });
    var later = document.querySelectorAll('.heritage, [data-defer]');
    later.forEach(function (el) { nearObserver.observe(el); });
    var whenIdle = window.requestIdleCallback || function (fn) { setTimeout(fn, 200); };
    var releaseAll = function () { whenIdle(function () { later.forEach(release); }); };
    if (document.readyState === 'complete') releaseAll(); else window.addEventListener('load', releaseAll, { once: true });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
    document.querySelectorAll('.heritage, [data-defer]').forEach(release);
  }

  function release(el) {
    if (el.classList.contains('heritage')) { el.classList.add('is-near'); return; }
    if (!el.hasAttribute('data-defer')) return;
    el.removeAttribute('data-defer');
    var parts = el.tagName === 'PICTURE' ? el.querySelectorAll('source, img') : [el];
    Array.prototype.forEach.call(parts, function (p) {
      // a script may already have given the image a new photo: keep that one
      if (p.tagName === 'IMG' && p.getAttribute('src')) return;
      if (p.hasAttribute('data-srcset')) { p.setAttribute('srcset', p.getAttribute('data-srcset')); p.removeAttribute('data-srcset'); }
      if (p.hasAttribute('data-src')) { p.setAttribute('src', p.getAttribute('data-src')); p.removeAttribute('data-src'); }
    });
  }

  /* Hero sequence: a 12-second loop built from layered Petra photos (no video).
     0–3 s ridges and descent to the Siq entrance, 3–7 s flight through the Siq,
     7–12 s sideways slide to one lit Treasury column, then a foreground rock hides the loop.
     Reduced motion, or any image failing to load, leaves the still photo in place.
     Phones and small tablets (and Save-Data) keep the still photo and never download the layers;
     on larger screens the layers start loading only after the page has finished loading. */
  var media = document.querySelector('[data-hero-media]');
  var cine = document.querySelector('[data-cine]');
  var heroToggle = document.querySelector('[data-hero-toggle]');
  var saveData = navigator.connection && navigator.connection.saveData;
  if (cine && (mobileQuery.matches || saveData)) {
    cine.parentNode.removeChild(cine);
    cine = null;
  }
  if (media && cine && heroToggle && window.requestAnimationFrame && window.Promise) {
    var label = heroToggle.querySelector('[data-hero-toggle-label]');
    var caption = document.querySelector('[data-hero-caption]');
    var stillCaption = caption ? caption.textContent : '';
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var LOOP = 12;

    var shot = {};
    Array.prototype.forEach.call(cine.querySelectorAll('[data-shot]'), function (el) { shot[el.getAttribute('data-shot')] = el; });
    function layer(name, which) { return shot[name].querySelector('[data-layer="' + which + '"]'); }
    var L = {
      ridgesFar: layer('ridges', 'far'), ridgesNear: layer('ridges', 'near'),
      entrance: layer('entrance', 'far'),
      siqFar: layer('siq', 'far'), siqAir: layer('siq', 'air'), siqLeft: layer('siq', 'left'), siqRight: layer('siq', 'right'),
      colFar: layer('column', 'far'), colRight: layer('column', 'right')
    };
    var shaft = cine.querySelector('[data-shaft]');
    var dustGroup = cine.querySelector('[data-dust]');
    var dim = cine.querySelector('[data-dim]');
    var glow = cine.querySelector('[data-glow]');
    var wipe = cine.querySelector('[data-wipe]');

    // Dust motes drifting through the shaft of light (shot 2)
    var SVGNS = 'http://www.w3.org/2000/svg';
    var motes = [];
    for (var m = 0; m < 22; m++) {
      var dot = document.createElementNS(SVGNS, 'circle');
      var depth = Math.random();
      dot.setAttribute('r', (1.4 + depth * 2.6).toFixed(2));
      dot.setAttribute('fill', '#ffe6c4');
      dustGroup.appendChild(dot);
      var y0 = Math.random() * 900 - 150;
      motes.push({
        el: dot, y0: y0,
        x0: 835 - (y0 + 220) * 0.07 + (Math.random() - 0.5) * (50 + (y0 + 220) * 0.08),
        speed: 6 + depth * 14, sway: 6 + Math.random() * 14,
        phase: Math.random() * 6.28, tw: 0.5 + Math.random() * 1.5
      });
    }

    // Easing helpers
    function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
    function span(t, a, b) { return clamp((t - a) / (b - a)); }
    function inOutSine(x) { return -(Math.cos(Math.PI * x) - 1) / 2; }
    function inOutCubic(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function outCubic(x) { return 1 - Math.pow(1 - x, 3); }
    function inQuad(x) { return x * x; }
    // Uniform scale + translate as [s, e, f]: x' = s*x + e, y' = s*y + f
    function about(s, px, py) { return [s, px * (1 - s), py * (1 - s)]; }
    function move(dx, dy) { return [1, dx, dy || 0]; }
    function then(a, b) { return [b[0] * a[0], b[0] * a[1] + b[1], b[0] * a[2] + b[2]]; } // a, then b
    function set(el, mat) {
      var s = mat[0].toFixed(4);
      el.setAttribute('transform', 'matrix(' + s + ' 0 0 ' + s + ' ' + mat[1].toFixed(2) + ' ' + mat[2].toFixed(2) + ')');
    }
    function fade(el, v) { el.style.opacity = v.toFixed(3); }

    var lastCaption = '';
    function setCaption(text) {
      if (caption && text !== lastCaption) { caption.textContent = text; lastCaption = text; }
    }

    function render(t) {
      // Shot 1a (0–3 s): sweep over the ridges, then dive toward the shadowed valley
      // (after the rock covers the frame at 11.3 s, shot 1 is already back at its first frame)
      var t1 = t > 11.3 ? t - LOOP : t;
      var p = inOutSine(span(t1, 0, 2.4));
      var cam1 = then(move(-1278 * p, -80 * p), about(1 + 1.2 * inQuad(span(t1, 1.9, 2.9)), 1150, 720));
      set(L.ridgesFar, cam1);
      // the nearer rock is larger and slides faster, settling onto the panorama
      set(L.ridgesNear, then(cam1, then(about(1 + 0.25 * (1 - p), 800, 900), move(160 * (1 - p)))));

      // Shot 1b (2.2–3.7 s): descend toward the entrance of the Siq
      var e = span(t, 2.2, 3.7);
      set(L.entrance, then(move(0, -40 * (1 - e)), about(1 + 0.5 * inQuad(e), 766, 451)));
      fade(shot.entrance, t < 4.2 ? span(t, 2.45, 2.8) : 0);

      // Shot 2 (3–7 s): fast low flight, then a sharp slow-down before the bend
      var u = t - 3;
      var f = u < 2.6 ? 0.85 * clamp(u / 2.6) : 0.85 + 0.15 * outCubic(span(u, 2.6, 4.6));
      var cam2 = about(1 + 0.2 * f, 735, 858);
      set(L.siqFar, cam2);
      set(L.siqAir, cam2);
      var k = 1 + 0.12 * (1 - f), d = 70 * (1 - f);
      set(L.siqLeft, then(cam2, then(about(k, 735, 858), move(d))));
      set(L.siqRight, then(cam2, then(about(k, 735, 858), move(-d))));
      var light = span(t, 5.2, 6.2);
      fade(shaft, 0.25 + 0.75 * light);
      for (var i = 0; i < motes.length; i++) {
        var o = motes[i];
        o.el.setAttribute('cx', (o.x0 + Math.sin(t * 0.6 + o.phase) * o.sway).toFixed(1));
        o.el.setAttribute('cy', (o.y0 + ((t * o.speed) % 80) - 40).toFixed(1));
        o.el.style.opacity = (light * (0.35 + 0.65 * Math.abs(Math.sin(t * o.tw + o.phase)))).toFixed(3);
      }
      fade(shot.siq, t < 8 ? span(t, 3.0, 3.6) : 0);

      // Shot 3 (7–12 s): slide sideways until one column catches the light, then hold
      var s = inOutCubic(span(t, 7.0, 9.0));
      var cam3 = then(move(-90 * (1 - s)), about(1 + 0.04 * span(t, 9.0, 11.3), 800, 520));
      set(L.colFar, cam3);
      set(L.colRight, then(cam3, then(about(1 + 0.25 * (1 - s), 800, 520), move(-230 * (1 - s)))));
      var lit = inOutSine(span(t, 8.4, 9.6));
      fade(dim, 0.55 * (1 - lit));
      fade(glow, 0.6 * lit);
      fade(shot.column, t < 11.3 ? span(t, 6.8, 7.4) : 0);

      // Loop (10.6–12 s): a foreground rock crosses the frame and hides the cut back to shot 1
      var w = span(t, 10.6, 12.0);
      wipe.style.transform = 'translateX(' + (-100 + (100 + 100 / 1.9) * w).toFixed(2) + '%)';

      setCaption(t < 2.5 ? 'The ridges above Petra'
        : t < 3.6 ? 'Entrance to the Siq'
        : t < 7.2 ? 'Inside the Siq'
        : t < 11.3 ? 'Al-Khazneh, the Treasury'
        : 'The ridges above Petra');
    }

    var running = false, userPaused = reduceMotion.matches, heroVisible = true, ready = false;
    var elapsed = 0, lastNow = 0, rafId = 0;
    function frame(now) {
      elapsed = (elapsed + Math.min(now - lastNow, 100) / 1000) % LOOP;
      lastNow = now;
      render(elapsed);
      rafId = requestAnimationFrame(frame);
    }
    function play() {
      if (running || !ready || userPaused || !heroVisible || document.hidden) return;
      running = true;
      render(elapsed);
      media.classList.add('is-cine');
      media.classList.remove('is-still');
      lastNow = performance.now();
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(rafId);
    }
    function setToggle(paused) {
      heroToggle.setAttribute('aria-pressed', String(paused));
      label.textContent = paused ? 'Play animation' : 'Pause animation';
    }

    heroToggle.addEventListener('click', function () {
      userPaused = !userPaused;
      setToggle(userPaused);
      if (userPaused) stop(); else play();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else play();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        if (heroVisible) play(); else stop();
      }, { threshold: 0.1 }).observe(media);
    }

    // The layers wait in data-href / data-src until the page has loaded, so they never compete with the
    // still photo. Then wait for every layer image. If any fails, keep the still photo and hide the control.
    function loadLayers() {
    var urls = [];
    Array.prototype.forEach.call(cine.querySelectorAll('image'), function (img) {
      var src = img.getAttribute('data-href') || img.getAttribute('href');
      img.setAttribute('href', src);
      img.removeAttribute('data-href');
      urls.push(src);
    });
    if (wipe.hasAttribute('data-src')) { wipe.src = wipe.getAttribute('data-src'); wipe.removeAttribute('data-src'); }
    urls.push(wipe.getAttribute('src'));
    Promise.all(urls.map(function (src) {
      return new Promise(function (resolve, reject) {
        var im = new Image();
        im.onload = function () {
          if (im.decode) im.decode().then(resolve, resolve); else resolve();
        };
        im.onerror = reject;
        im.src = src;
      });
    })).then(function () {
      ready = true;
      heroToggle.hidden = false;
      setToggle(userPaused);
      play();
    }, function () {
      cine.parentNode.removeChild(cine);
      if (caption) caption.textContent = stillCaption;
    });
    }
    var idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 200); };
    if (document.readyState === 'complete') idle(loadLayers);
    else window.addEventListener('load', function () { idle(loadLayers); }, { once: true });
  }

  /* Discover map: pins, the mobile destination buttons and Previous/Next stop share one selection.
     Controls update at once; the background photo crossfades (about 400 ms). Visitors set the pace. */
  // Own scope, so these names never collide with the rest of this file
  (function () {
    var explorer = document.querySelector('[data-explorer]');
    if (!explorer) return;
    var placeButtons = explorer.querySelectorAll('button[data-place]');
    var stepButtons = explorer.querySelectorAll('button[data-step]');
    var order = [];   // north to south, as the pins appear in the HTML
    Array.prototype.forEach.call(explorer.querySelectorAll('.map-pin[data-place]'), function (b) {
      order.push(b.getAttribute('data-place'));
    });
    var bgs = {}, stories = {};
    Array.prototype.forEach.call(explorer.querySelectorAll('[data-place-bg]'), function (el) { bgs[el.getAttribute('data-place-bg')] = el; });
    Array.prototype.forEach.call(explorer.querySelectorAll('[data-place-panel]'), function (el) { stories[el.getAttribute('data-place-panel')] = el; });
    var status = explorer.querySelector('[data-discover-status]');
    var panel = explorer.querySelector('[data-map]');
    var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    var selected = 'petra';   // what the controls show
    var shown = 'petra';      // what the photo and story show
    var ticket = 0;
    var leaveTimer = 0;

    // Load a background photo on demand (only Petra's is in the HTML from the start)
    var loadPhoto = function (id) {
      var img = bgs[id];
      // a <picture> background: its AVIF/WebP sources wait in data-srcset until the place is chosen
      if (img && img.tagName !== 'IMG') {
        Array.prototype.forEach.call(img.querySelectorAll('source[data-srcset]'), function (s) {
          s.setAttribute('srcset', s.getAttribute('data-srcset'));
          s.removeAttribute('data-srcset');
        });
        img = img.querySelector('img');
      }
      if (!img) return Promise.resolve();
      if (img.hasAttribute('data-src')) {
        // responsive sizes from the build, when present
        if (img.hasAttribute('data-srcset')) {
          if (img.hasAttribute('data-sizes') || !img.getAttribute('sizes')) img.sizes = img.getAttribute('data-sizes') || '100vw';
          img.srcset = img.getAttribute('data-srcset');
          img.removeAttribute('data-srcset');
        }
        img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src');
      }
      if (img.complete && img.naturalWidth) return Promise.resolve();
      var ready = img.decode ? img.decode().catch(function () {}) : new Promise(function (r) { img.onload = img.onerror = r; });
      // never hold the change for long, even on a slow connection
      return Promise.race([ready, new Promise(function (r) { setTimeout(r, 700); })]);
    };

    var swap = function (map, from, to) {
      var prev = map[from], next = map[to];
      if (prev) {
        prev.classList.remove('is-active');
        if (!calm.matches) prev.classList.add('is-leaving');
      }
      next.classList.add('is-active');
    };

    var show = function (id) {
      if (id === shown) return;
      clearTimeout(leaveTimer);
      Array.prototype.forEach.call(explorer.querySelectorAll('.is-leaving'), function (el) { el.classList.remove('is-leaving'); });
      swap(bgs, shown, id);
      swap(stories, shown, id);
      shown = id;
      if (!calm.matches) {
        leaveTimer = setTimeout(function () {
          Array.prototype.forEach.call(explorer.querySelectorAll('.is-leaving'), function (el) { el.classList.remove('is-leaving'); });
        }, 420);
      }
      var story = stories[id];
      if (status) status.textContent = story.querySelector('.discover-place-name').textContent;
    };

    // Route on the map: one highlight path per leg, in north-to-south order
    var legs = explorer.querySelectorAll('.discover-route-hi path');
    var placeName = function (id) {
      var label = explorer.querySelector('.map-pin[data-place="' + id + '"] .map-pin-label');
      return label ? label.textContent : id;
    };
    var routeTimer = 0;
    var clearRoute = function () {
      clearTimeout(routeTimer);
      Array.prototype.forEach.call(legs, function (p) { p.classList.remove('is-travelled', 'is-backward'); });
      Array.prototype.forEach.call(explorer.querySelectorAll('.map-pin.is-arrived'), function (b) { b.classList.remove('is-arrived'); });
    };
    // Previous/Next: light up the leg just travelled, then let it fade; the new pin pulses once
    var travel = function (from, to) {
      clearRoute();
      var a = order.indexOf(from), b = order.indexOf(to);
      var leg = legs[Math.min(a, b)];
      var pin = explorer.querySelector('.map-pin[data-place="' + to + '"]');
      if (!leg || Math.abs(a - b) !== 1) return;
      void leg.getBoundingClientRect();   // restart the animation if the same leg is used again
      if (b < a) leg.classList.add('is-backward');
      leg.classList.add('is-travelled');
      if (pin) pin.classList.add('is-arrived');
      routeTimer = setTimeout(clearRoute, 1600);
    };

    var select = function (id, how) {
      if (order.indexOf(id) < 0) return;
      var from = selected;
      selected = id;
      if (how === 'step') travel(from, id); else clearRoute();
      // Every control reflects the choice immediately
      Array.prototype.forEach.call(placeButtons, function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-place') === id));
      });
      var i = order.indexOf(id);
      // Previous/Next show the neighbouring stop's name; the missing direction is disabled at either end
      Array.prototype.forEach.call(stepButtons, function (b) {
        var step = Number(b.getAttribute('data-step'));
        var target = order[i + step];
        var name = b.querySelector('[data-step-name]');
        var word = step < 0 ? 'Previous stop' : 'Next stop';
        b.disabled = !target;
        if (name) name.textContent = target ? placeName(target) : word;
        b.setAttribute('aria-label', target ? word + ': ' + placeName(target) : word);
      });
      var mine = ++ticket;
      loadPhoto(id).then(function () {
        if (mine === ticket) show(id);   // a newer choice wins over a slow photo
      });
    };

    Array.prototype.forEach.call(placeButtons, function (b) {
      var id = b.getAttribute('data-place');
      b.addEventListener('click', function () { select(id); });
      // start loading a photo as soon as a visitor points at or focuses its place
      b.addEventListener('pointerenter', function () { loadPhoto(id); });
      b.addEventListener('focus', function () { loadPhoto(id); });
    });
    Array.prototype.forEach.call(stepButtons, function (b) {
      b.addEventListener('click', function () {
        var next = order[order.indexOf(selected) + Number(b.getAttribute('data-step'))];
        if (next) select(next, 'step');
      });
    });

    // Arrow keys move between the mobile destination buttons, like a toolbar
    var chipGroup = explorer.querySelector('.discover-chips');
    if (chipGroup) {
      chipGroup.addEventListener('keydown', function (e) {
        var chips = Array.prototype.slice.call(chipGroup.querySelectorAll('button'));
        var i = chips.indexOf(document.activeElement);
        if (i < 0) return;
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        chips[(i + step + chips.length) % chips.length].focus();
      });
    }

    select(selected);   // sets the Previous/Next state for the starting place

    // First entry: the map settles in and the pins drop in one by one
    if (panel && 'IntersectionObserver' in window) {
      if (!calm.matches) panel.setAttribute('data-enter', '');
      var entry = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        panel.classList.add('is-entered');
        entry.disconnect();
        // once the section is in view, quietly fetch the other photos so later changes are instant
        setTimeout(function () { order.forEach(loadPhoto); }, 1500);
      }, { threshold: 0.2 });
      entry.observe(panel);
    }
  })();

  /* Programs: pick a tour to show it in the featured panel (no automatic rotation) */
  (function () {
    var panel = document.querySelector('[data-tour-feature]');
    var list = document.querySelector('[data-tour-picks]');
    if (!panel || !list) return;
    var picks = Array.prototype.slice.call(list.querySelectorAll('[data-tour]'));
    var img = panel.querySelector('[data-feature-img]');
    var status = document.querySelector('[data-feature-status]');
    var field = function (name) { return panel.querySelector('[data-feature-' + name + ']'); };
    var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    var swap = 0;

    // Without this script the choices stay plain links to each itinerary.
    // With it, they work as tabs that control the featured panel.
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-label', 'Choose a tour');
    panel.setAttribute('role', 'tabpanel');
    picks.forEach(function (a) {
      a.parentNode.setAttribute('role', 'presentation');
      a.setAttribute('role', 'tab');
      a.setAttribute('aria-controls', panel.id);
    });

    function show(pick, announce) {
      var d = pick.dataset;
      picks.forEach(function (a) {
        var on = a === pick;
        a.setAttribute('aria-selected', String(on));
        a.tabIndex = on ? 0 : -1;
      });
      if (field('name').textContent === d.name && !announce) return;
      field('name').textContent = d.name;
      field('desc').textContent = d.desc;
      field('days').textContent = d.days + ' days · ' + d.nights + ' nights';
      field('price').textContent = d.price;
      field('link').href = pick.getAttribute('href');
      field('enquire').href = 'enquire.html?program=' + d.tour;
      if (status && announce) status.textContent = d.name + ', ' + d.days + ' days, from ' + d.price + ' per person';

      if (img.getAttribute('src') === d.img) return;
      var ticket = ++swap;
      var next = new Image();
      // responsive sizes from the build, when present
      if (d.srcset) { next.sizes = img.sizes; next.srcset = d.srcset; }
      next.src = d.img;
      var put = function () {
        if (ticket !== swap) return;
        if (d.srcset) img.srcset = d.srcset; else img.removeAttribute('srcset');
        img.src = d.img;
        img.width = +d.w; img.height = +d.h;
        img.alt = d.alt;
        img.style.objectPosition = d.pos;
        img.classList.remove('is-changing');
      };
      if (calm.matches) { put(); return; }
      img.classList.add('is-changing');
      var ready = next.decode ? next.decode().catch(function () {}) : Promise.resolve();
      Promise.all([ready, new Promise(function (r) { setTimeout(r, 200); })]).then(put);
    }

    list.addEventListener('click', function (e) {
      var a = e.target.closest('[data-tour]');
      if (!a) return;
      e.preventDefault();
      show(a, true);
      // on phones the panel sits above the choices: bring it back into view if it has scrolled away
      var hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
      if (panel.getBoundingClientRect().top < hdr) panel.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
    });
    list.addEventListener('keydown', function (e) {
      var i = picks.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(picks[i], true); return; }
      var next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: picks.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      var to = picks[(next + picks.length) % picks.length];
      to.focus();
      show(to, true);
    });

    var start = list.querySelector('[data-tour="' + panel.getAttribute('data-start') + '"]') || picks[0];
    show(start, false);
  })();

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
