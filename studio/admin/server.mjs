#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3947;
const PIN = process.env.ADMIN_PIN || 'form2026';
const DATA = path.join(__dirname, 'data', 'stats.json');
const LEADS_DATA = path.join(__dirname, 'data', 'leads.json');
const ROOT = path.join(__dirname, '..');

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ы: 'y', ъ: '', э: 'e', ю: 'iu', я: 'ia', ё: 'e'
};

function slugify(name) {
  let out = '';
  const s = String(name || '').trim().toLowerCase();
  for (const ch of s) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s/.test(ch) || ch === '_' || ch === '.') out += '-';
  }
  return out.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'lead';
}

function uniqueSlug(base, leads) {
  const taken = new Set(leads.map((l) => l.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function auth(req) {
  return req.headers['x-admin-pin'] === PIN;
}

function readStats() {
  try {
    return JSON.parse(fs.readFileSync(DATA, 'utf8'));
  } catch {
    return { updated: null, events: [], meta: { site: 'form-media' } };
  }
}

function writeStats(data) {
  data.updated = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_DATA, 'utf8')).leads || [];
  } catch {
    return [];
  }
}

function writeLeads(leads) {
  fs.mkdirSync(path.dirname(LEADS_DATA), { recursive: true });
  fs.writeFileSync(LEADS_DATA, JSON.stringify({ updated: new Date().toISOString(), leads }, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('bad json')); }
    });
  });
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Pin');
}

function aggregate(events) {
  const clicks = {};
  const sections = {};
  const days = {};
  const sessions = new Set();
  let views = 0;

  events.forEach((e) => {
    const day = (e.ts || '').slice(0, 10);
    if (day) days[day] = (days[day] || 0) + 1;
    if (e.session) sessions.add(e.session);
    if (e.type === 'pageview') views++;
    if (e.type === 'click' && e.data?.label) {
      clicks[e.data.label] = (clicks[e.data.label] || 0) + 1;
    }
    if (e.type === 'section' && e.data?.id) {
      sections[e.data.id] = (sections[e.data.id] || 0) + 1;
    }
  });

  const topClicks = Object.entries(clicks).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const topSections = Object.entries(sections).sort((a, b) => b[1] - a[1]);

  return {
    totalEvents: events.length,
    pageviews: views,
    uniqueSessions: sessions.size,
    topClicks,
    topSections,
    byDay: Object.entries(days).sort((a, b) => a[0].localeCompare(b[0])),
    recent: events.slice(-40).reverse()
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/collect' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const ev = JSON.parse(body);
        const stats = readStats();
        stats.events.push(ev);
        if (stats.events.length > 5000) stats.events = stats.events.slice(-5000);
        writeStats(stats);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400); res.end('{"error":"bad json"}');
      }
    });
    return;
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    if (!auth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    const stats = readStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  if (url.pathname === '/api/stats' && req.method === 'DELETE') {
    if (!auth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    writeStats({ updated: new Date().toISOString(), events: [], meta: { site: 'form-media' } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"cleared":true}');
    return;
  }

  if (url.pathname === '/api/leads' && req.method === 'GET') {
    if (!auth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ leads: readLeads() }));
    return;
  }

  if (url.pathname === '/api/leads' && req.method === 'POST') {
    if (!auth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    readBody(req).then((body) => {
      const name = String(body.name || '').trim();
      const note = String(body.note || '').trim();
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"name required"}');
        return;
      }
      const leads = readLeads();
      const slug = uniqueSlug(slugify(name), leads);
      const lead = { slug, name, note, created: new Date().toISOString() };
      leads.push(lead);
      writeLeads(leads);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lead));
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":"bad json"}');
    });
    return;
  }

  if (url.pathname === '/api/leads' && req.method === 'DELETE') {
    if (!auth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    readBody(req).then((body) => {
      const slug = String(body.slug || '').trim();
      writeLeads(readLeads().filter((l) => l.slug !== slug));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end('{"error":"bad json"}');
    });
    return;
  }

  let rel = url.pathname.replace(/^\//, '') || 'index.html';
  if (rel === 'admin' || rel === 'admin/') rel = 'admin/index.html';
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

function tryListen(port, left = 8) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && left > 0) {
      console.warn(`Port ${port} зайнятий, пробуємо ${port + 1}…`);
      tryListen(port + 1, left - 1);
      return;
    }
    if (err.code === 'EADDRINUSE') {
      console.error(`Порт ${port} зайнятий. Зупини старий процес:`);
      console.error(`  lsof -ti :${PORT} | xargs kill -9`);
      console.error(`Або: PORT=3950 node admin/server.mjs`);
    }
    throw err;
  });
  server.listen(port, () => {
    console.log(`FORM MEDIA analytics: http://localhost:${port}/admin/`);
    console.log(`Site: http://localhost:${port}/index.html`);
    console.log(`API:  POST /api/collect  GET /api/stats  GET/POST/DELETE /api/leads (PIN: ${PIN})`);
  });
}
tryListen(Number(PORT));
