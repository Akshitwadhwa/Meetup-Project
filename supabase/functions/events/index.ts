const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_ORIGIN = 'https://sidequest-meetup.vercel.app';
const CORS = {
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigin = origin === SITE_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : SITE_ORIGIN;
  const cors = { ...CORS, 'Access-Control-Allow-Origin': allowedOrigin };
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);
  try {
    const userId = await authenticatedUser(request);
    const body = await request.json();
    if (body.action !== 'create') return json({ error: 'Unknown event admin action.' }, 400, cors);
    if (!constantTimeEqual(String(body.adminCode || ''), Deno.env.get('EVENT_ADMIN_CODE') || '')) {
      return json({ error: 'That host dashboard code is not valid.' }, 403, cors);
    }
    const result = await createHostedEvent(userId, body.event || {});
    return json({ event: result }, 200, cors);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not create this event.' }, 400, cors);
  }
});

async function authenticatedUser(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in to SideQuest before opening the host dashboard.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: authorization }
  });
  if (!response.ok) throw new Error('Your SideQuest session expired. Refresh the page and try again.');
  const user = await response.json();
  if (!user?.id) throw new Error('Could not verify your SideQuest account.');
  return user.id;
}

async function createHostedEvent(userId: string, input: Record<string, unknown>) {
  const eventName = cleanText(input.eventName, 180);
  const location = cleanText(input.location, 180);
  const hostName = cleanText(input.hostName, 80);
  const hostBio = cleanText(input.hostBio, 800);
  const lumaUrl = normalizeLumaUrl(input.lumaUrl);
  const hostXUrl = normalizeSocialUrl(input.hostX, 'x');
  const hostLinkedInUrl = normalizeSocialUrl(input.hostLinkedIn, 'linkedin');
  const startsAt = input.startsAt ? new Date(String(input.startsAt)) : null;
  if (!eventName || eventName.length < 2) throw new Error('Enter the event name.');
  if (!location || location.length < 2) throw new Error('Enter where the event is happening.');
  if (!hostName || !hostBio) throw new Error('Add the host name and host introduction.');
  if (!lumaUrl) throw new Error('Enter a public HTTPS Luma event link.');
  if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error('Enter a valid event date and time.');

  const anakinKey = Deno.env.get('ANAKIN_API_KEY');
  if (!anakinKey) throw new Error('Anakin is not configured. Add ANAKIN_API_KEY to Supabase Edge Function secrets.');
  const scraped = await scrapeAnakin(lumaUrl, anakinKey);
  const roomCode = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const room = await dbOne('rooms', 'POST', { code: roomCode, name: eventName, created_by: userId }, 'return=representation');
  if (!room?.id) throw new Error('Could not create the event space. Try again.');
  try {
    const event = await dbOne('hosted_events', 'POST', {
      room_id: room.id,
      event_name: eventName,
      event_location: location,
      starts_at: startsAt?.toISOString() || null,
      luma_url: lumaUrl,
      event_summary: scraped.summary || 'Anakin could not find a clear event summary on this page. See the Luma event for details.',
      organizer_name: scraped.organizer,
      host_name: hostName,
      host_bio: hostBio,
      host_x_url: hostXUrl,
      host_linkedin_url: hostLinkedInUrl,
      created_by: userId,
      is_published: true
    }, 'return=representation');
    if (!event?.id) throw new Error('The event record was not returned by the database.');
    return event;
  } catch (error) {
    await dbOne(`rooms?id=eq.${encodeURIComponent(room.id)}`, 'DELETE');
    throw error;
  }
}

async function scrapeAnakin(url: string, apiKey: string) {
  const response = await fetch('https://api.anakin.io/v1/url-scraper', {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      url,
      country: 'in',
      useBrowser: true,
      formats: ['summary'],
      outputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'The event title shown on the Luma page.' },
          organizer: { type: 'string', description: 'The event host or organizer shown on the page.' },
          summary: { type: 'string', description: 'What the event is about, who it is for, and any schedule or program details.' }
        },
        required: ['title', 'organizer', 'summary']
      }
    })
  });
  const submitted = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403
    ? 'Anakin rejected its API key. Check ANAKIN_API_KEY in Supabase Function secrets.'
    : `Anakin could not start scraping this event (HTTP ${response.status}).`);
  const jobId = submitted.jobId || submitted.id;
  if (!jobId) throw new Error('Anakin did not return a scrape job ID.');
  let job: any = submitted;
  for (let attempt = 0; attempt < 20 && job.status !== 'completed'; attempt += 1) {
    if (job.status === 'failed') throw new Error('Anakin could not read this Luma page. Check that it is public.');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const poll = await fetch(`https://api.anakin.io/v1/url-scraper/${encodeURIComponent(jobId)}`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' }
    });
    job = await poll.json().catch(() => ({}));
    if (!poll.ok) throw new Error(`Anakin could not return the scrape results (HTTP ${poll.status}).`);
  }
  if (job.status !== 'completed') throw new Error('Anakin is still reading the page. Wait a moment and try again.');
  if (job.error) throw new Error('Anakin could not read this Luma event page.');
  let generated = job.generatedJson;
  if (typeof generated === 'string') { try { generated = JSON.parse(generated); } catch { generated = {}; } }
  const data = generated?.data || generated || {};
  return {
    title: firstString(data, ['title', 'event_title', 'eventName', 'name']),
    organizer: firstString(data, ['organizer', 'organizer_name', 'host', 'host_name']),
    summary: firstString(data, ['summary', 'event_summary', 'description', 'about']) || cleanText(job.summary, 1000) || markdownSummary(job.markdown)
  };
}

function firstString(value: any, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase()) && typeof item === 'string' && item.trim()) return cleanText(item, 1000);
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = firstString(child, keys);
      if (found) return found;
    }
  }
  return null;
}

function markdownSummary(markdown: unknown): string | null {
  if (typeof markdown !== 'string') return null;
  return cleanText(markdown.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, '').trim()).filter(Boolean).slice(1, 8).join(' '), 1000);
}

function normalizeLumaUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['luma.com', 'lu.ma'].includes(host) || !segments.length || url.username || url.password) return null;
    return `https://${host}/${segments[0]}`;
  } catch { return null; }
}

function normalizeSocialUrl(input: unknown, network: 'x' | 'linkedin'): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  const urlText = network === 'x' && /^[\w.-]+$/.test(raw.replace(/^@/, ''))
    ? `https://x.com/${raw.replace(/^@/, '')}`
    : (/^https:\/\//i.test(raw) ? raw : `https://${raw}`);
  try {
    const url = new URL(urlText);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || (network === 'x' ? !['x.com', 'twitter.com'].includes(host) : host !== 'linkedin.com')) {
      throw new Error(`Enter a valid ${network === 'x' ? 'X' : 'LinkedIn'} profile link.`);
    }
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Enter a valid')) throw error;
    throw new Error(`Enter a valid ${network === 'x' ? 'X' : 'LinkedIn'} profile link.`);
  }
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] || 0) ^ (right[index] || 0);
  }
  return difference === 0;
}

async function dbOne(path: string, method = 'GET', body?: unknown, prefer?: string) {
  const headers = new Headers({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' });
  if (prefer) headers.set('Prefer', prefer);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SideQuest database request failed (${response.status}): ${text.slice(0, 350)}`);
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function json(body: unknown, status = 200, cors = CORS) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
