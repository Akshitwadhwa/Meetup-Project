const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = 'https://sidequest-meetup.vercel.app/';
const CLIENT_ID = 'https://sidequest-meetup.vercel.app/luma-client-metadata.json';
const MCP_URL = 'https://mcp.luma.com';
const AUTH_URL = 'https://luma.com/oauth/consent?credential_type=personal';
const TOKEN_URL = 'https://api.luma.com/oauth/token';
const REVOKE_URL = 'https://api.luma.com/oauth/revoke';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/luma?callback=1`;
const CORS = {
  'Access-Control-Allow-Origin': SITE_URL.slice(0, -1),
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(request.url);
  if (url.searchParams.has('callback')) return oauthCallback(url);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const userId = await authenticatedUser(request);
    const body = await request.json();
    const { action, roomCode } = body;
    if (action === 'start') return json(await startConnection(userId, roomCode));
    if (action === 'events') return json({ events: await listLumaEvents(userId, roomCode) });
    if (action === 'enrich') return json({ events: await enrichSelectedEvents(userId, roomCode, body.events) });
    if (action === 'disconnect') return json(await disconnect(userId));
    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Luma request failed.' }, 400);
  }
});

async function authenticatedUser(request: Request): Promise<string> {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in to SideQuest before connecting Luma.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: authorization }
  });
  if (!response.ok) throw new Error('Your SideQuest session expired. Refresh the page and try again.');
  const user = await response.json();
  if (!user?.id) throw new Error('Could not verify your SideQuest account.');
  return user.id;
}

async function startConnection(userId: string, roomCodeInput: string) {
  const roomCode = String(roomCodeInput || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,16}$/.test(roomCode)) throw new Error('Join a room before connecting Luma.');
  const room = await dbOne(`rooms?code=eq.${encodeURIComponent(roomCode)}&is_active=eq.true&select=id,code`);
  if (!room) throw new Error('That room is no longer available. Join it again and retry.');
  const membership = await dbOne(`room_members?room_id=eq.${room.id}&user_id=eq.${userId}&select=user_id`);
  if (!membership) throw new Error('Join this SideQuest room before connecting Luma.');

  const state = randomToken(32);
  const verifier = randomToken(64);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const stateHash = await sha256Hex(state);
  await dbWrite(`luma_oauth_states?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, 'DELETE');
  await dbWrite(`luma_oauth_states?user_id=eq.${userId}`, 'DELETE');
  await dbWrite('luma_oauth_states', 'POST', {
    state_hash: stateHash,
    user_id: userId,
    room_id: room.id,
    room_code: room.code,
    code_verifier: verifier,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
  });

  const auth = new URL(AUTH_URL);
  auth.searchParams.set('client_id', CLIENT_ID);
  auth.searchParams.set('redirect_uri', REDIRECT_URI);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('state', state);
  auth.searchParams.set('resource', MCP_URL);
  return { authorizationUrl: auth.toString() };
}

async function oauthCallback(url: URL): Promise<Response> {
  try {
    const providerError = url.searchParams.get('error');
    if (providerError) return redirectWithError('Luma connection was cancelled.');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) throw new Error('Luma returned an incomplete authorization response.');

    const stateHash = await sha256Hex(state);
    const rows = await dbWrite(`luma_oauth_states?state_hash=eq.${stateHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`, 'DELETE');
    const pending = Array.isArray(rows) ? rows[0] : null;
    if (!pending) throw new Error('This Luma sign-in link expired or was already used.');

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID, code_verifier: pending.code_verifier, resource: MCP_URL
      })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || !token.access_token) throw new Error('Luma could not complete authorization. Please try connecting again.');
    await saveConnection(pending.user_id, token);
    return Response.redirect(`${SITE_URL}?luma=connected&room=${encodeURIComponent(pending.room_code)}`, 302);
  } catch (error) {
    return redirectWithError(error instanceof Error ? error.message : 'Luma could not connect.');
  }
}

function redirectWithError(message: string) {
  const target = new URL(SITE_URL);
  target.searchParams.set('luma', 'error');
  target.searchParams.set('message', message.slice(0, 180));
  return Response.redirect(target.toString(), 302);
}

async function listLumaEvents(userId: string, roomCodeInput: string) {
  const roomCode = String(roomCodeInput || '').trim().toUpperCase();
  const room = await dbOne(`rooms?code=eq.${encodeURIComponent(roomCode)}&select=id`);
  if (!room || !await dbOne(`room_members?room_id=eq.${room.id}&user_id=eq.${userId}&select=user_id`)) {
    throw new Error('You are not in this room. Rejoin and try again.');
  }
  const connection = await dbOne(`luma_connections?user_id=eq.${userId}&select=*`);
  if (!connection) throw new Error('Connect your Luma account first.');
  const accessToken = await usableAccessToken(userId, connection);
  const session = { id: '', protocolVersion: '' };
  const initialized = await mcpRequest(accessToken, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'SideQuest', version: '1.0.0' }
  }, session);
  session.protocolVersion = initialized?.protocolVersion || '2025-03-26';
  await mcpNotify(accessToken, 'notifications/initialized', session);
  const tools = await mcpRequest(accessToken, 'tools/list', {}, session);
  const candidates = tools?.tools || [];
  const eventTool = candidates.find((tool: any) => /your events|my events/i.test(tool.name))
    || candidates.find((tool: any) => /your events|my events|events attending|attending events/i.test(`${tool.name} ${tool.description || ''}`));
  if (!eventTool) throw new Error('Luma is connected, but its account event-list tool was not available.');
  const args = makeEventArgs(eventTool.inputSchema);
  const result = await mcpRequest(accessToken, 'tools/call', { name: eventTool.name, arguments: args }, session);
  return normalizeEvents(result);
}

async function enrichSelectedEvents(userId: string, roomCodeInput: string, input: unknown) {
  const roomCode = String(roomCodeInput || '').trim().toUpperCase();
  const room = await dbOne(`rooms?code=eq.${encodeURIComponent(roomCode)}&select=id`);
  if (!room || !await dbOne(`room_members?room_id=eq.${room.id}&user_id=eq.${userId}&select=user_id`)) {
    throw new Error('Join this room before enriching event pages.');
  }
  const apiKey = Deno.env.get('ANAKIN_API_KEY');
  if (!apiKey) throw new Error('Anakin is not configured yet. Add ANAKIN_API_KEY to Supabase Edge Function secrets, then retry.');
  if (!Array.isArray(input) || input.length < 1 || input.length > 10) throw new Error('Select between 1 and 10 public Luma event pages at a time.');

  const availableEvents = await listLumaEvents(userId, roomCode);
  const availableById = new Map(availableEvents.map((event: any) => [String(event.id), event]));
  const events = input.map((raw: any) => {
    const url = normalizePublicLumaEventUrl(raw?.url);
    const id = String(raw?.id || '').slice(0, 180);
    const available = availableById.get(id);
    if (!url || !id || !available || normalizePublicLumaEventUrl(available.url) !== url) {
      throw new Error('Anakin can only read event pages returned by your connected Luma account.');
    }
    return { id, url, name: String(available.name || raw?.name || 'Luma event').slice(0, 180), startsAt: available.startsAt || null };
  });

  const now = Date.now();
  const byUrl = new Map<string, any>();
  for (const event of events) {
    const cached = await dbOne(`anakin_event_cache?event_url=eq.${encodeURIComponent(event.url)}&select=event_title,organizer_name,event_summary,scraped_at`);
    if (cached && now - new Date(cached.scraped_at).getTime() < 30 * 24 * 60 * 60 * 1000) byUrl.set(event.url, cached);
  }
  const uncached = [...new Map(events.filter((event) => !byUrl.has(event.url)).map((event) => [event.url, event])).values()];
  if (uncached.length) {
    const resultRows = await scrapeAnakin(uncached.map((event) => event.url), apiKey);
    const cacheRows = uncached.map((event) => {
      const row = resultRows.find((item: any) => normalizePublicLumaEventUrl(item.url || item.sourceUrl || item.result?.url || item.data?.url) === event.url);
      const result = row?.result || row?.data || row;
      if (!result || row?.status === 'failed' || result.status === 'failed' || row?.error || result.error) throw new Error(`Anakin could not read ${event.name}. Try another public event link.`);
      const extracted = anakinFields(result);
      const cache = {
        event_url: event.url,
        event_title: extracted.title,
        organizer_name: extracted.organizer,
        event_summary: extracted.summary,
        scraped_at: new Date().toISOString()
      };
      byUrl.set(event.url, cache);
      return cache;
    });
    if (cacheRows.length) await dbWrite('anakin_event_cache?on_conflict=event_url', 'POST', cacheRows, 'resolution=merge-duplicates');
  }
  return events.map((event) => {
    const cached = byUrl.get(event.url);
    return {
      ...event,
      name: cached?.event_title || event.name,
      organizer: cached?.organizer_name || null,
      summary: cached?.event_summary || null,
      enrichmentSource: 'anakin_url_scraper'
    };
  });
}

async function scrapeAnakin(urls: string[], apiKey: string) {
  return await Promise.all(urls.map(async (url) => {
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
          title: { type: 'string', description: 'The event title as shown on the page.' },
          organizer: { type: 'string', description: 'The named host or organizer, or an empty string if not shown.' },
          summary: { type: 'string', description: 'A concise summary of the event purpose, activities, and any agenda or program details shown on the page.' }
        },
        required: ['title', 'organizer', 'summary']
      }
    })
    });
    const submitted = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'Anakin rejected its API key. Check ANAKIN_API_KEY in Supabase Function secrets.'
      : `Anakin could not start the scrape (HTTP ${response.status}).`);
    const jobId = submitted.jobId || submitted.id;
    if (!jobId) throw new Error('Anakin did not return a scrape job ID.');

    let job: any = submitted;
    for (let attempt = 0; attempt < 20 && job.status !== 'completed'; attempt += 1) {
      if (job.status === 'failed') throw new Error('Anakin’s scrape job failed. Try again later.');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const poll = await fetch(`https://api.anakin.io/v1/url-scraper/${encodeURIComponent(jobId)}`, {
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' }
      });
      job = await poll.json().catch(() => ({}));
      if (!poll.ok) throw new Error(`Anakin could not return scrape results (HTTP ${poll.status}).`);
    }
    if (job.status !== 'completed') throw new Error('Anakin is still scraping. Wait a moment, then try again.');
    if (job.error) throw new Error('Anakin could not read this event page. Try again later.');
    return { url, result: job };
  }));
}

function anakinFields(result: any) {
  let generated = result.generatedJson;
  if (typeof generated === 'string') { try { generated = JSON.parse(generated); } catch { generated = {}; } }
  const data = generated?.data || generated || {};
  const title = firstString(data, ['event_title', 'title', 'eventName', 'name']);
  const organizer = firstString(data, ['organizer', 'organizer_name', 'host', 'host_name']);
  const summary = firstString(data, ['summary', 'event_summary', 'description', 'about']) || result.summary || markdownSummary(result.markdown);
  return { title: cleanText(title, 180), organizer: cleanText(organizer, 120), summary: cleanText(summary, 500) };
}

function firstString(value: any, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [key, item] of Object.entries(value)) {
    if (keys.some((candidate) => candidate.toLowerCase() === key.toLowerCase()) && typeof item === 'string' && item.trim()) return item;
  }
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      const found = firstString(child, keys);
      if (found) return found;
    }
  }
  return null;
}

function markdownSummary(markdown: unknown) {
  if (typeof markdown !== 'string') return null;
  const lines = markdown.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = lines.filter((line) => !/^https?:\/\//i.test(line)).slice(1, 5).join(' ');
  return text || null;
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

function normalizePublicLumaEventUrl(input: unknown) {
  if (typeof input !== 'string') return null;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['luma.com', 'lu.ma'].includes(host)
      || url.username || url.password || url.port || segments.length !== 1) return null;
    url.search = '';
    url.hash = '';
    return `https://${host}/${segments[0]}`;
  } catch { return null; }
}

function makeEventArgs(schema: any) {
  const args: Record<string, unknown> = {};
  const properties = schema?.properties || {};
  // Let Luma apply its default event-list behavior. Guessing values for
  // optional filters can make a valid tool call fail on the MCP server.
  for (const key of schema?.required || []) {
    const property = properties[key] || {};
    const normalized = `${key} ${property.description || ''}`.toLowerCase();
    const enumValues = Array.isArray(property.enum) ? property.enum : [];
    const allValue = enumValues.find((value: unknown) => /^(all|any|both|all events)$/i.test(String(value)) || /upcoming.*past|past.*upcoming/i.test(String(value)));
    if (allValue !== undefined) args[key] = allValue;
    else if (/past|time|date|range|when|filter/.test(normalized)) {
      throw new Error(`Luma's event-list tool requires a time filter that does not include all available events: ${key}.`);
    }
    else if (/status/.test(normalized) && enumValues.includes('attending')) args[key] = 'attending';
    else if (/limit|size/.test(normalized)) args[key] = 100;
    else throw new Error(`Luma event-list tool requires an unsupported parameter: ${key}.`);
  }
  return args;
}

async function mcpRequest(token: string, method: string, params: Record<string, unknown>, session: { id: string; protocolVersion?: string }) {
  const id = crypto.randomUUID();
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  });
  if (session.id) headers.set('Mcp-Session-Id', session.id);
  if (session.protocolVersion) headers.set('MCP-Protocol-Version', session.protocolVersion);
  let response = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  const sessionId = response.headers.get('Mcp-Session-Id');
  if (sessionId) session.id = sessionId;
  if (response.status === 401) throw new Error('Luma authorization expired. Disconnect and connect your account again.');
  if (!response.ok && response.status !== 202) throw new Error(`Luma events could not be loaded (HTTP ${response.status}).`);
  if (response.status === 202 || method === 'notifications/initialized') return {};
  const text = await response.text();
  const payload = parseMcpResponse(text);
  if (payload?.error) throw new Error(payload.error.message || 'Luma event request failed.');
  if (payload?.result?.isError) {
    const detail = (payload.result.content || []).filter((part: any) => typeof part.text === 'string').map((part: any) => part.text).join(' ').replace(/\s+/g, ' ').slice(0, 220);
    throw new Error(detail || 'Luma could not return this account’s events. Try again.');
  }
  return payload?.result || {};
}

async function mcpNotify(token: string, method: string, session: { id: string; protocolVersion?: string }) {
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  });
  if (session.id) headers.set('Mcp-Session-Id', session.id);
  if (session.protocolVersion) headers.set('MCP-Protocol-Version', session.protocolVersion);
  const response = await fetch(MCP_URL, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, params: {} })
  });
  if (response.status !== 202 && !response.ok) throw new Error('Could not start the Luma events session.');
}

async function usableAccessToken(userId: string, connection: any) {
  if (!connection.expires_at || new Date(connection.expires_at).getTime() > Date.now() + 60_000) return connection.access_token;
  if (!connection.refresh_token) throw new Error('Luma authorization expired. Connect your account again.');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refresh_token, client_id: CLIENT_ID, resource: MCP_URL })
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error('Luma authorization expired. Connect your account again.');
  await saveConnection(userId, token, connection.refresh_token);
  return token.access_token;
}

async function saveConnection(userId: string, token: any, oldRefreshToken?: string) {
  await dbWrite('luma_connections?on_conflict=user_id', 'POST', {
    user_id: userId,
    access_token: token.access_token,
    refresh_token: token.refresh_token || oldRefreshToken || null,
    expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
    updated_at: new Date().toISOString()
  }, 'resolution=merge-duplicates');
}

async function disconnect(userId: string) {
  const connection = await dbOne(`luma_connections?user_id=eq.${userId}&select=*`);
  if (!connection) return { disconnected: true };
  const token = connection.refresh_token || connection.access_token;
  const revokeResponse = await fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, token_type_hint: connection.refresh_token ? 'refresh_token' : 'access_token', client_id: CLIENT_ID })
  }).catch(() => null);
  await dbWrite(`luma_connections?user_id=eq.${userId}`, 'DELETE');
  return { disconnected: true, lumaRevoked: Boolean(revokeResponse?.ok) };
}

function normalizeEvents(result: any) {
  let root: any = result?.structuredContent || result;
  if (Array.isArray(root?.content)) {
    for (const item of root.content) {
      if (typeof item?.text !== 'string') continue;
      try { root = JSON.parse(item.text); break; } catch { /* Other MCP tools may return readable prose. */ }
    }
  }
  const list = findEventList(root);
  const mapped = list.map((raw: any) => {
    const event = raw?.event || raw;
    const id = event?.event_id || event?.id || event?.api_id || event?.slug;
    const slug = event?.url_slug || event?.slug || event?.event_url?.split('/').filter(Boolean).pop();
    const eventUrl = event?.url || event?.event_url || (slug ? `https://lu.ma/${slug}` : '');
    const name = event?.name || event?.title || event?.event_name;
    if (!id || !name || !/^https:\/\/(www\.)?(luma\.com|lu\.ma)\//i.test(eventUrl)) return null;
    return {
      id: String(id), name: String(name).slice(0, 180), url: eventUrl,
      startsAt: event?.start_at || event?.starts_at || event?.start_time || null
    };
  }).filter(Boolean);
  const unique = new Map(mapped.map((event: any) => [event.id, event]));
  return [...unique.values()];
}

function findEventList(value: any, depth = 0): any[] {
  if (depth > 7 || value == null) return [];
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && (item.event || item.event_id || item.id || item.name || item.title))) return value;
    for (const item of value) { const found = findEventList(item, depth + 1); if (found.length) return found; }
    return [];
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (/events|attending|past/i.test(key) && Array.isArray(child)) return child;
    }
    for (const child of Object.values(value)) { const found = findEventList(child, depth + 1); if (found.length) return found; }
  }
  return [];
}

function parseMcpResponse(text: string) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { /* Streamable HTTP may reply with server-sent events. */ }
  const data = text.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).filter(Boolean).join('\n');
  try { return JSON.parse(data); } catch { return {}; }
}

async function dbOne(path: string) {
  const rows = await dbWrite(path, 'GET');
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function dbWrite(path: string, method: string, body?: unknown, prefer?: string) {
  const headers = new Headers({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' });
  if (prefer) headers.set('Prefer', prefer);
  if (method === 'DELETE') headers.set('Prefer', 'return=representation');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SideQuest database request failed (${response.status}).`);
  return text ? JSON.parse(text) : null;
}

function randomToken(bytes: number) {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return base64url(random);
}

function base64url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
