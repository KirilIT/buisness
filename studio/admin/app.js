const PIN_KEY = 'fm_admin_pin';
const DEFAULT_PIN = 'form2026';

const CAT_LABELS = {
  booking: 'Запис на зустріч',
  telegram: 'Telegram',
  phone: 'Телефон',
  portfolio: 'Портфоліо',
  whatsapp: 'WhatsApp',
  other: 'Інше'
};

const EVENT_LABELS = {
  'nav-booking': 'Навігація → Запис',
  'hero-booking': 'Головний CTA → Зустріч',
  'hero-portfolio': 'Головний CTA → Роботи',
  'booking-calendar': 'Календар → Відкрити',
  'cta-booking': 'Контакти → Запис',
  'cta-telegram': 'Контакти → Telegram',
  'cta-phone': 'Контакти → Телефон'
};

function getPin() {
  return localStorage.getItem(PIN_KEY) || DEFAULT_PIN;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function fmtTime(ts) {
  if (!ts) return '—';
  return ts.slice(0, 19).replace('T', ' ');
}

function fmtPct(n, total) {
  if (!total) return '0%';
  return Math.round((n / total) * 100) + '%';
}

function refDomain(ref) {
  if (!ref) return 'Прямий захід';
  try {
    const u = new URL(ref);
    const h = u.hostname.replace(/^www\./, '');
    if (h.includes('instagram')) return 'Instagram';
    if (h.includes('google')) return 'Google';
    if (h.includes('facebook') || h.includes('fb.')) return 'Facebook';
    if (h.includes('t.me') || h.includes('telegram')) return 'Telegram';
    return h;
  } catch {
    return ref.slice(0, 40);
  }
}

function inPeriod(ts, days) {
  if (!days || days === 'all') return true;
  const d = new Date(ts);
  const cut = Date.now() - Number(days) * 86400000;
  return d.getTime() >= cut;
}

function humanLabel(e) {
  if (e.type === 'click') {
    const l = e.data?.label || '';
    if (EVENT_LABELS[l]) return EVENT_LABELS[l];
    if (l.startsWith('portfolio:')) return 'Портфоліо: ' + l.slice(10);
    return l || 'Клік';
  }
  if (e.type === 'pageview') return 'Зайшов на сайт';
  if (e.type === 'engagement' && e.data?.kind === 'time_on_page') return 'Час на сайті: ' + e.data.seconds + 'с';
  if (e.type === 'engagement' && e.data?.depth) return 'Прокрутка ' + e.data.depth + '%';
  return e.type;
}

function computeStats(events, periodDays) {
  const filtered = events.filter((e) => inPeriod(e.ts, periodDays));
  const sessions = new Map();
  const clicksByCat = {};
  const clicksByLabel = {};
  const portfolio = {};
  const referrers = {};
  const utm = {};
  const devices = { mobile: 0, desktop: 0 };
  const days = {};
  const hours = Array(24).fill(0);
  let pageviews = 0;
  let bookingClicks = 0;
  let contactClicks = 0;
  let portfolioClicks = 0;
  let totalTime = 0;
  let timeCount = 0;
  let scroll50 = 0;
  let scroll100 = 0;

  filtered.forEach((e) => {
    const sid = e.session || e.id;
    if (!sessions.has(sid)) {
      sessions.set(sid, { id: sid, events: [], first: e.ts, device: e.device, ref: e.ref, utm: e.utm });
    }
    const s = sessions.get(sid);
    s.events.push(e);
    if (e.ts && (!s.first || e.ts < s.first)) s.first = e.ts;

    const day = (e.ts || '').slice(0, 10);
    if (day) days[day] = (days[day] || 0) + 1;
    if (e.ts) {
      const h = new Date(e.ts).getHours();
      hours[h]++;
    }

    if (e.type === 'pageview') {
      pageviews++;
      const r = refDomain(e.ref);
      referrers[r] = (referrers[r] || 0) + 1;
      if (e.device) devices[e.device] = (devices[e.device] || 0) + 1;
      const u = e.utm || {};
      if (u.source || u.medium || u.campaign) {
        const key = [u.source || '—', u.medium || '—', u.campaign || '—'].join(' / ');
        utm[key] = (utm[key] || 0) + 1;
      }
    }

    if (e.type === 'click') {
      const cat = e.data?.category || 'other';
      clicksByCat[cat] = (clicksByCat[cat] || 0) + 1;
      const lbl = e.data?.label || 'click';
      clicksByLabel[lbl] = (clicksByLabel[lbl] || 0) + 1;
      if (cat === 'booking') bookingClicks++;
      if (cat === 'telegram' || cat === 'phone' || cat === 'whatsapp') contactClicks++;
      if (cat === 'portfolio') {
        portfolioClicks++;
        const name = lbl.startsWith('portfolio:') ? lbl.slice(10) : (e.data?.href || lbl);
        portfolio[name] = (portfolio[name] || 0) + 1;
      }
    }

    if (e.type === 'engagement') {
      if (e.data?.kind === 'time_on_page' && e.data.seconds) {
        totalTime += e.data.seconds;
        timeCount++;
      }
      if (e.data?.depth === 50) scroll50++;
      if (e.data?.depth === 100) scroll100++;
    }
  });

  const uniqueSessions = sessions.size;
  const avgTime = timeCount ? Math.round(totalTime / timeCount) : 0;
  const convBooking = uniqueSessions ? Math.round((bookingClicks / uniqueSessions) * 100) : 0;
  const convContact = uniqueSessions ? Math.round((contactClicks / uniqueSessions) * 100) : 0;

  const sessionList = [...sessions.values()]
    .map((s) => {
      s.events.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
      const steps = s.events
        .filter((ev) => ev.type === 'pageview' || ev.type === 'click' || (ev.type === 'engagement' && ev.data?.kind === 'time_on_page'))
        .map(humanLabel);
      const hasBooking = s.events.some((ev) => ev.type === 'click' && ev.data?.category === 'booking');
      const hasContact = s.events.some((ev) => ev.type === 'click' && ['telegram', 'phone', 'whatsapp'].includes(ev.data?.category));
      return { ...s, steps, hasBooking, hasContact, last: s.events[s.events.length - 1]?.ts };
    })
    .sort((a, b) => (b.last || '').localeCompare(a.last || ''))
    .slice(0, 40);

  return {
    totalEvents: filtered.length,
    pageviews,
    uniqueSessions,
    avgTime,
    bookingClicks,
    contactClicks,
    portfolioClicks,
    convBooking,
    convContact,
    scroll50,
    scroll100,
    clicksByCat: Object.entries(clicksByCat).sort((a, b) => b[1] - a[1]),
    clicksByLabel: Object.entries(clicksByLabel).sort((a, b) => b[1] - a[1]).slice(0, 20),
    portfolio: Object.entries(portfolio).sort((a, b) => b[1] - a[1]),
    referrers: Object.entries(referrers).sort((a, b) => b[1] - a[1]).slice(0, 12),
    utm: Object.entries(utm).sort((a, b) => b[1] - a[1]),
    devices,
    byDay: Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])),
    hours,
    sessionList,
    recent: filtered.slice(-50).reverse(),
    funnel: {
      visits: uniqueSessions,
      scroll50,
      scroll100,
      booking: bookingClicks,
      contact: contactClicks
    }
  };
}

let lastRaw = null;
let currentView = 'overview';
let period = '30';

function $(id) {
  return document.getElementById(id);
}

function setView(name) {
  currentView = name;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
}

async function api(path, opts = {}) {
  const headers = { ...opts.headers, 'X-Admin-Pin': getPin() };
  return fetch(path, { ...opts, headers });
}

async function load() {
  const status = $('status');
  status.textContent = 'Завантаження…';
  status.className = 'status';

  let events = [];
  let fromServer = false;

  try {
    const r = await api('/api/stats');
    if (r.status === 401) {
      status.textContent = 'Невірний PIN на сервері';
      return;
    }
    if (r.ok) {
      const j = await r.json();
      events = j.events || [];
      lastRaw = j;
      fromServer = true;
      status.textContent = (location.hostname.includes('netlify') ? 'Netlify · ' : 'Сервер · ') + (j.updated ? fmtTime(j.updated) : 'оновлено');
      status.className = 'status ok';
    }
  } catch (e) {}

  if (!fromServer) {
    try {
      const buf = JSON.parse(localStorage.getItem('fm_analytics_buffer_v1') || '[]');
      events = events.concat(buf);
      lastRaw = { events, updated: null };
      status.textContent = 'Локально — npm run dev або Netlify для повної статистики';
    } catch (e) {
      status.textContent = 'Немає даних';
    }
  }

  const agg = computeStats(events, period);
  renderAll(agg);
}

function renderAll(agg) {
  renderOverview(agg);
  renderFunnel(agg);
  renderSources(agg);
  renderActions(agg);
  renderSessions(agg);
  renderLive(agg);
}

function renderOverview(agg) {
  $('kpi-grid').innerHTML = [
    { val: agg.uniqueSessions, lbl: 'Унікальні візити', sub: 'сесії', highlight: true },
    { val: agg.pageviews, lbl: 'Перегляди сторінки', sub: '' },
    { val: agg.avgTime + 'с', lbl: 'Середній час', sub: 'на сайті' },
    { val: agg.bookingClicks, lbl: 'Кліки «Запис»', sub: 'конверсія ' + agg.convBooking + '%', highlight: true, badge: 'CTA' },
    { val: agg.contactClicks, lbl: 'Контакти', sub: 'TG + телефон ' + agg.convContact + '%' },
    { val: agg.portfolioClicks, lbl: 'Портфоліо', sub: 'відкриття робіт' },
    { val: agg.scroll100, lbl: 'Дочитали до кінця', sub: 'прокрутка 100%' },
    { val: agg.totalEvents, lbl: 'Усі події', sub: 'за період' }
  ].map((k) => `
    <div class="kpi${k.highlight ? ' highlight' : ''}">
      ${k.badge ? `<span class="badge">${k.badge}</span>` : ''}
      <div class="val">${esc(k.val)}</div>
      <div class="lbl">${esc(k.lbl)}</div>
      ${k.sub ? `<div class="sub">${esc(k.sub)}</div>` : ''}
    </div>
  `).join('');

  const max = Math.max(...agg.byDay.map(([, n]) => n), 1);
  $('chart-days').innerHTML = agg.byDay.length
    ? agg.byDay.slice(-14).map(([d, n]) => {
        const lbl = d.slice(5);
        return `<div class="bar-wrap"><div class="bar" style="height:${Math.round((n / max) * 100)}%"></div><div class="bar-lbl">${lbl}</div></div>`;
      }).join('')
    : '<p class="empty">Ще немає даних за обраний період</p>';

  const maxH = Math.max(...agg.hours, 1);
  $('chart-hours').innerHTML = agg.hours.map((n, i) =>
    `<div class="hour-cell" style="height:${Math.max(4, Math.round((n / maxH) * 100))}%;opacity:${n ? 0.35 + (n / maxH) * 0.65 : 0.15}" title="${i}:00 — ${n}"></div>`
  ).join('');
}

function renderFunnel(agg) {
  const f = agg.funnel;
  const base = f.visits || 1;
  const steps = [
    ['Зайшли на сайт', f.visits],
    ['Прокрутили 50%', f.scroll50],
    ['Прокрутили 100%', f.scroll100],
    ['Клік «Запис»', f.booking],
    ['Контакт (TG/тел)', f.contact]
  ];
  $('funnel').innerHTML = steps.map(([label, n]) => `
    <div class="funnel-step">
      <span>${esc(label)}</span>
      <div class="funnel-bar"><div class="funnel-fill" style="width:${Math.round((n / base) * 100)}%"></div></div>
      <span class="funnel-n">${n} <small style="color:var(--dim);font-weight:600">${fmtPct(n, base)}</small></span>
    </div>
  `).join('');
}

function renderSources(agg) {
  const totalDev = (agg.devices.mobile || 0) + (agg.devices.desktop || 0) || 1;
  const mobPct = Math.round(((agg.devices.mobile || 0) / totalDev) * 100);
  $('device-donut').style.background = `conic-gradient(var(--accent) 0 ${mobPct}%, var(--card2) ${mobPct}% 100%)`;
  $('device-center').innerHTML = `${mobPct}%<br><span style="font-size:.55rem;color:var(--muted)">mobile</span>`;
  $('device-legend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:var(--accent)"></span>Мобільні — ${agg.devices.mobile || 0} (${mobPct}%)</div>
    <div class="legend-item"><span class="legend-dot" style="background:var(--card2);border:1px solid var(--line)"></span>Десктоп — ${agg.devices.desktop || 0} (${100 - mobPct}%)</div>
  `;

  $('table-referrers').innerHTML = agg.referrers.length
    ? agg.referrers.map(([k, n]) => `<tr><td><strong>${esc(k)}</strong></td><td>${n}</td><td>${fmtPct(n, agg.pageviews)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Поки без зовнішніх джерел</td></tr>';

  $('table-utm').innerHTML = agg.utm.length
    ? agg.utm.map(([k, n]) => `<tr><td><strong>${esc(k)}</strong></td><td>${n}</td></tr>`).join('')
    : '<tr><td colspan="2">Додайте ?utm_source=… до посилань у рекламі</td></tr>';
}

function pillClass(cat) {
  return 'pill pill-' + (cat || 'other');
}

function renderActions(agg) {
  $('table-actions').innerHTML = agg.clicksByLabel.length
    ? agg.clicksByLabel.map(([k, n]) => {
        const human = EVENT_LABELS[k] || (k.startsWith('portfolio:') ? 'Портфоліо: ' + k.slice(10) : k);
        const cat = k.includes('booking') || k.includes('calendar') ? 'booking'
          : k.includes('telegram') ? 'telegram'
          : k.includes('phone') ? 'phone'
          : k.startsWith('portfolio') ? 'portfolio' : 'other';
        return `<tr><td><span class="${pillClass(cat)}">${esc(CAT_LABELS[cat] || cat)}</span></td><td><strong>${esc(human)}</strong></td><td>${n}</td></tr>`;
      }).join('')
    : '<tr><td colspan="3" class="empty">Кліків ще немає</td></tr>';

  $('table-portfolio').innerHTML = agg.portfolio.length
    ? agg.portfolio.map(([k, n]) => `<tr><td><strong>${esc(k)}</strong></td><td>${n}</td></tr>`).join('')
    : '<tr><td colspan="2">Ще ніхто не відкривав роботи</td></tr>';

  $('table-categories').innerHTML = agg.clicksByCat.length
    ? agg.clicksByCat.map(([k, n]) => `<tr><td><span class="${pillClass(k)}">${esc(CAT_LABELS[k] || k)}</span></td><td>${n}</td><td>${fmtPct(n, agg.bookingClicks + agg.contactClicks + agg.portfolioClicks || 1)}</td></tr>`).join('')
    : '<tr><td colspan="3">—</td></tr>';
}

function renderSessions(agg) {
  $('sessions').innerHTML = agg.sessionList.length
    ? agg.sessionList.map((s) => {
        const flags = [
          s.hasBooking ? '<span class="pill pill-booking">запис</span>' : '',
          s.hasContact ? '<span class="pill pill-telegram">контакт</span>' : ''
        ].filter(Boolean).join(' ');
        return `
          <div class="session-card">
            <div class="session-head">
              <strong>${fmtTime(s.first)}</strong>
              <span>${esc(s.device || '—')} · ${esc(refDomain(s.ref))} ${flags}</span>
            </div>
            <div class="session-steps">${s.steps.map((st) => `<span>${esc(st)}</span>`).join(' → ')}</div>
          </div>`;
      }).join('')
    : '<p class="empty">Сесій поки немає</p>';
}

function renderLive(agg) {
  $('table-live').innerHTML = agg.recent.length
    ? agg.recent.map((e) => {
        const cat = e.data?.category;
        const pill = e.type === 'click' ? `<span class="${pillClass(cat)}">${esc(CAT_LABELS[cat] || e.type)}</span>` : e.type;
        return `<tr><td>${fmtTime(e.ts)}</td><td>${pill}</td><td>${esc(humanLabel(e))}</td><td>${esc(e.device || '—')}</td></tr>`;
      }).join('')
    : '<tr><td colspan="4" class="empty">—</td></tr>';
}

function init() {
  $('login-btn').onclick = () => {
    const ok = $('pin').value === getPin();
    $('err').style.display = ok ? 'none' : 'block';
    if (ok) showApp();
  };
  $('pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('login-btn').click(); });

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.onclick = () => setView(b.dataset.view);
  });

  $('refresh').onclick = load;
  $('period').onchange = (e) => { period = e.target.value; load(); };
  $('logout').onclick = () => location.reload();

  $('save-pin').onclick = () => {
    const p = $('new-pin').value;
    if (p.length >= 4) {
      localStorage.setItem(PIN_KEY, p);
      alert('PIN збережено локально. На Netlify встановіть ADMIN_PIN у змінних середовища.');
    }
  };

  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(lastRaw, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'form-media-stats.json';
    a.click();
  };

  $('clear').onclick = async () => {
    if (!confirm('Очистити всю статистику? Це незворотно.')) return;
    try { await api('/api/stats', { method: 'DELETE' }); } catch (e) {}
    localStorage.removeItem('fm_analytics_buffer_v1');
    load();
  };

  setInterval(load, 45000);
}

function showApp() {
  $('login').style.display = 'none';
  $('app').classList.add('active');
  load();
}

init();
