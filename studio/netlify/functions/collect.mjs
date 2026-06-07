import { getStore } from '@netlify/blobs';

const STORE = 'form-media-analytics';
const KEY = 'events';
const MAX = 8000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function readEvents(store) {
  const data = await store.get(KEY, { type: 'json' });
  return data?.events || [];
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }
  try {
    const event = await request.json();
    const store = getStore(STORE);
    const events = await readEvents(store);
    events.push({ ...event, received: new Date().toISOString() });
    const trimmed = events.length > MAX ? events.slice(-MAX) : events;
    await store.setJSON(KEY, {
      updated: new Date().toISOString(),
      events: trimmed,
      meta: { site: 'form-media' }
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'bad request' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
};
