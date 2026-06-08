import { getStore } from '@netlify/blobs';

const STORE = 'form-media-analytics';
const KEY = 'leads';
const PIN = process.env.ADMIN_PIN || 'form2026';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
};

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z',
  и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', ы: 'y', ъ: '', э: 'e', ю: 'iu', я: 'ia', ё: 'e'
};

function auth(request) {
  return request.headers.get('x-admin-pin') === PIN;
}

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

async function readLeads(store) {
  const data = await store.get(KEY, { type: 'json' });
  return data?.leads || [];
}

async function writeLeads(store, leads) {
  await store.setJSON(KEY, { updated: new Date().toISOString(), leads });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (!auth(request)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  const store = getStore(STORE);

  if (request.method === 'GET') {
    const leads = await readLeads(store);
    return new Response(JSON.stringify({ leads }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const name = String(body.name || '').trim();
      const note = String(body.note || '').trim();
      if (!name) {
        return new Response(JSON.stringify({ error: 'name required' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
      const leads = await readLeads(store);
      const slug = uniqueSlug(slugify(name), leads);
      const lead = { slug, name, note, created: new Date().toISOString() };
      leads.push(lead);
      await writeLeads(store, leads);
      return new Response(JSON.stringify(lead), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'bad request' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const body = await request.json();
      const slug = String(body.slug || '').trim();
      const leads = (await readLeads(store)).filter((l) => l.slug !== slug);
      await writeLeads(store, leads);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify({ error: 'bad request' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405, headers: cors });
};
