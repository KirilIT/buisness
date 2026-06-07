import { getStore } from '@netlify/blobs';

const STORE = 'form-media-analytics';
const KEY = 'events';
const PIN = process.env.ADMIN_PIN || 'form2026';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
};

function auth(request) {
  return request.headers.get('x-admin-pin') === PIN;
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

  if (request.method === 'DELETE') {
    await store.setJSON(KEY, { updated: new Date().toISOString(), events: [], meta: { site: 'form-media' } });
    return new Response(JSON.stringify({ cleared: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const data = (await store.get(KEY, { type: 'json' })) || { events: [], updated: null };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
};
