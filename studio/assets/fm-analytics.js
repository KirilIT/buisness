(function () {
  'use strict';
  var CFG = window.FM_ANALYTICS || {};
  var SITE = CFG.siteId || 'form-media';
  var LS_KEY = 'fm_analytics_buffer_v1';
  var SID_KEY = 'fm_sid_v1';
  var sent = {};

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function sid() {
    try {
      var s = sessionStorage.getItem(SID_KEY);
      if (!s) { s = uid(); sessionStorage.setItem(SID_KEY, s); }
      return s;
    } catch (e) { return uid(); }
  }

  function device() {
    var w = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    return w < 768 ? 'mobile' : 'desktop';
  }

  function utm() {
    var p = new URLSearchParams(location.search);
    return {
      source: p.get('utm_source') || '',
      medium: p.get('utm_medium') || '',
      campaign: p.get('utm_campaign') || ''
    };
  }

  function categorize(label, href) {
    var s = (label + ' ' + href).toLowerCase();
    if (/booking|запис|calendar|hero-booking|cta-booking|nav-booking/.test(s)) return 'booking';
    if (/telegram|cta-telegram|t\.me/.test(s)) return 'telegram';
    if (/phone|tel:|cta-phone/.test(s)) return 'phone';
    if (/portfolio|hero-portfolio|\.html|detailing|barber|smile|lumina|aqua|100bar/.test(s)) return 'portfolio';
    if (/whatsapp|wa\.me/.test(s)) return 'whatsapp';
    return 'other';
  }

  function payload(type, data) {
    var u = utm();
    return {
      id: uid(),
      type: type,
      site: SITE,
      session: sid(),
      ts: new Date().toISOString(),
      path: location.pathname + location.hash,
      ref: document.referrer || '',
      device: device(),
      utm: u,
      data: data || {}
    };
  }

  function buffer(ev) {
    try {
      var buf = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
      buf.push(ev);
      if (buf.length > 300) buf = buf.slice(-300);
      localStorage.setItem(LS_KEY, JSON.stringify(buf));
    } catch (e) {}
  }

  function endpoint() {
    if (CFG.endpoint) return CFG.endpoint;
    return '/api/collect';
  }

  function send(ev) {
    buffer(ev);
    var url = endpoint();
    try {
      var body = JSON.stringify(ev);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
      }
    } catch (e) {}
  }

  function track(type, data) {
    send(payload(type, data));
  }

  function once(key, type, data) {
    if (sent[key]) return;
    sent[key] = true;
    track(type, data);
  }

  track('pageview', { title: document.title, landing: location.href });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-fm-event], a.btn, a.cta-link, a.work, a.nav-cta, .btn, .cta-link, .work');
    if (!el) return;
    var label = el.getAttribute('data-fm-event') || '';
    if (!label && el.classList.contains('work')) {
      var h = el.querySelector('h4');
      label = h ? 'portfolio:' + h.textContent.trim() : 'portfolio';
    }
    if (!label) label = el.id || (el.textContent || '').trim().slice(0, 40) || 'click';
    var href = el.getAttribute('href') || '';
    var cat = categorize(label, href);
    track('click', { label: label, href: href, category: cat });
  }, true);

  var depths = [50, 100];
  function onScroll() {
    var doc = document.documentElement;
    var pct = Math.round((window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1) * 100);
    depths.forEach(function (d) {
      if (pct >= d) once('scroll_' + d, 'engagement', { depth: d });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  var start = Date.now();
  function sendTime() {
    var sec = Math.round((Date.now() - start) / 1000);
    if (sec >= 3) track('engagement', { kind: 'time_on_page', seconds: sec });
  }
  window.addEventListener('pagehide', sendTime);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') sendTime();
  });

  window.FMTrack = track;
})();
