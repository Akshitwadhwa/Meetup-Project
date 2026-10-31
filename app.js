(() => {
  const modal = document.querySelector('#modal');
  const content = document.querySelector('#modal-content');
  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.publishableKey) : null;
  const BIO_MAX_LENGTH = 800;
  const DRAFT_KEY = 'sidequest-profile-draft';
  const GAME_TITLES = [
    { id: 'interstellar', title: 'Interstellar', year: 2014, art: '🌌', note: 'A love letter across the stars.' },
    { id: 'inception', title: 'Inception', year: 2010, art: '🌀', note: 'Dreams inside dreams. Follow the spinning top.' },
    { id: 'the-office', title: 'The Office', year: 2005, art: '📎', note: 'The most chaotic workplace on TV.' },
    { id: 'stranger-things', title: 'Stranger Things', year: 2016, art: '🚲', note: 'Small town. Big supernatural trouble.' },
    { id: 'breaking-bad', title: 'Breaking Bad', year: 2008, art: '🧪', note: 'One chemistry teacher. A very bad idea.' },
    { id: 'the-bear', title: 'The Bear', year: 2022, art: '🍽️', note: 'Kitchen pressure, family, and a lot of shouting.' },
    { id: 'black-mirror', title: 'Black Mirror', year: 2011, art: '📺', note: 'Technology, with a side of existential dread.' },
    { id: 'sacred-games', title: 'Sacred Games', year: 2018, art: '🌃', note: 'Mumbai, a ticking clock, and a cryptic warning.' },
    { id: 'succession', title: 'Succession', year: 2018, art: '🏢', note: 'Rich family. Zero chill.' },
    { id: 'dune-part-two', title: 'Dune: Part Two', year: 2024, art: '🏜️', note: 'Destiny looks good in the desert.' }
  ];
  const AI_TOOLS = ['Wispr Flow', 'Claude', 'Cursor', 'Codex', 'ChatGPT', 'Gemini', 'GitHub Copilot', 'ElevenLabs / TTS', 'Ollama / local models', 'LangChain', 'n8n'];
  const TOPIC_TAGS = ['AI agents', 'Voice AI', 'TTS', 'Model inference', 'Quantization', 'Open source', 'Developer tools', 'Robotics', 'Startups', 'Design'];
  const LOOKING_FOR = ['Build collaborators', 'Co-founders', 'Mentors', 'People to learn from', 'Hiring opportunities', 'People to help'];
  const LOOKING_FOR_ALIASES = {
    'Build collaborators': ['collaborator', 'collaborators', 'co-build', 'build together', 'build with someone', 'people to build with', 'teammate', 'teammates'],
    'Co-founders': ['co-founder', 'cofounder', 'co founder', 'founding partner'],
    'Mentors': ['mentor', 'mentorship', 'guidance'],
    'People to learn from': ['learn from', 'learn alongside', 'people to learn from'],
    'Hiring opportunities': ['hiring', 'job opportunity', 'job opportunities', 'looking for a job', 'looking to hire'],
    'People to help': ['help others', 'help people', 'people to help', 'support others', 'contribute back']
  };
  const TOOL_ALIASES = {
    'Wispr Flow': ['wispr flow', 'whisper flow'],
    'Claude': ['claude'],
    'Cursor': ['cursor'],
    'Codex': ['codex'],
    'ChatGPT': ['chatgpt', 'chat gpt'],
    'Gemini': ['gemini'],
    'GitHub Copilot': ['github copilot', 'copilot'],
    'ElevenLabs / TTS': ['elevenlabs', 'text to speech', 'tts'],
    'Ollama / local models': ['ollama', 'local model', 'local models'],
    'LangChain': ['langchain'],
    'n8n': ['n8n']
  };
  const TOPIC_ALIASES = {
    'AI agents': ['agent', 'agents', 'tool calling'],
    'Voice AI': ['voice ai', 'speech ai', 'voice assistant'],
    'TTS': ['tts', 'text to speech', 'speech synthesis'],
    'Model inference': ['inference', 'serving models'],
    'Quantization': ['quantization', 'quantisation', 'quantized', 'quantised'],
    'Open source': ['open source', 'open-source'],
    'Developer tools': ['developer tools', 'devtools', 'coding tools'],
    'Robotics': ['robotics', 'robot'],
    'Startups': ['startup', 'startups', 'founding a company'],
    'Design': ['design', 'designer', 'product design']
  };
  let activeRoom = null;
  let activeEvent = null;
  let activeProfile = null;
  let activeGameName = '';
  let gameIndex = 0;
  let gameVotes = {};
  let refreshTimer = null;

  document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', openModal));
  document.querySelectorAll('[data-host-admin]').forEach((button) => button.addEventListener('click', openHostDashboard));
  const questTabs = [...document.querySelectorAll('.quest-tab')];
  questTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setQuest(index));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? questTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : questTabs.length - 1)) % questTabs.length;
      setQuest(next);
      questTabs[next].focus();
    });
  });
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
  function openModal() {
    showEventDirectory();
    modal.classList.add('open');
    setTimeout(() => content.querySelector('#event-search')?.focus(), 100);
  }

  function setQuest(index) {
    const main = index === 0;
    questTabs.forEach((tab, tabIndex) => {
      tab.setAttribute('aria-selected', String(tabIndex === index));
      tab.tabIndex = tabIndex === index ? 0 : -1;
    });
    document.querySelector('#quest-title').innerHTML = main
      ? 'Show up for<br>the <span class="h-script">Main Quest.</span>'
      : 'Meet your<br>next favorite <span class="h-script">person.</span>';
    document.querySelector('#quest-copy').textContent = main
      ? 'Build something real at the hackathon. Find the people who make it better.'
      : 'Find builders who share your AI tools, curious rabbit holes, and things you want to build.';
    document.querySelector('#quest-caption').textContent = main
      ? 'The event host publishes the Luma event and host profile. Anakin adds public event context; attendees choose the event by name.'
      : 'Make a voice-built profile, discover shared tools and interests, then start a conversation or play the group game.';
    document.querySelector('#quest-caption').setAttribute('aria-labelledby', main ? 'main-quest-tab' : 'side-quest-tab');
    document.querySelector('#quest-note').textContent = main
      ? 'Your event history is private. People who join the same event can discover your builder profile.'
      : 'No email needed. Your builder profile is tied to an anonymous account.';
  }

  async function showEventDirectory(message = '') {
    modal.classList.add('open');
    if (!client) {
      renderEventDirectory([], 'Connect SideQuest to Supabase to load the host-created event list.');
      return;
    }
    renderEventDirectory([], message || 'Loading events…');
    try {
      await ensureAnonymousUser();
      const { data, error } = await client.from('hosted_events')
        .select('id,event_name,event_location,starts_at,luma_url,event_summary,organizer_name,host_name,host_bio,host_x_url,host_linkedin_url')
        .eq('is_published', true)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      renderEventDirectory(data || [], '');
      const inviteId = new URLSearchParams(location.search).get('event');
      const invited = (data || []).find((event) => event.id === inviteId);
      if (invited) selectHostedEvent(invited);
    } catch (error) {
      renderEventDirectory([], friendlyError(error));
    }
  }

  function renderEventDirectory(events, message = '') {
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="mono modal-kicker">THE EVENT BOARD · PICK YOUR QUEST</div><h2 id="modal-title">Which event are you at?</h2><p>Choose the event by name. Its host and Luma details are set by the event host.</p>
      <label class="match-search"><span class="sr-only">Search events</span><input id="event-search" type="search" placeholder="Search event name or venue" autocomplete="off"></label>
      <div class="error" id="event-error">${escapeHtml(message)}</div>
      <div class="event-directory">${events.map((event) => `<article class="event-option" data-event-search="${escapeHtml(`${event.event_name} ${event.event_location} ${event.host_name}`.toLowerCase())}"><div class="mono">${event.starts_at ? escapeHtml(new Date(event.starts_at).toLocaleString()) : 'UPCOMING EVENT'}</div><h3>${escapeHtml(event.event_name)}</h3><p class="event-location">📍 ${escapeHtml(event.event_location)}</p>${event.event_summary ? `<p>${escapeHtml(event.event_summary)}</p>` : ''}<p class="fine event-host">Hosted by ${escapeHtml(event.host_name)}${event.organizer_name ? ` · ${escapeHtml(event.organizer_name)}` : ''}</p><button class="button button-lime" type="button" data-join-event="${escapeHtml(event.id)}">Join this event ↗</button></article>`).join('') || (!message || message === 'Loading events…' ? '<p class="fine">No events are open yet. The host dashboard can publish the first one.</p>' : '')}</div>
      <button type="button" class="edit-profile" data-host-admin>Host dashboard</button>`;
    bindClose();
    content.querySelector('[data-host-admin]')?.addEventListener('click', openHostDashboard);
    content.querySelectorAll('[data-join-event]').forEach((button) => button.addEventListener('click', () => {
      const selected = events.find((event) => event.id === button.dataset.joinEvent);
      if (selected) selectHostedEvent(selected);
    }));
    content.querySelector('#event-search')?.addEventListener('input', (event) => {
      const term = event.currentTarget.value.trim().toLowerCase();
      content.querySelectorAll('.event-option').forEach((card) => { card.hidden = !card.dataset.eventSearch.includes(term); });
    });
  }

  function selectHostedEvent(event) {
    activeEvent = event;
    showProfileSetup(null, readDraft() || {});
    modal.classList.add('open');
  }

  function openHostDashboard() {
    if (!client) {
      content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="mono modal-kicker">HOST ADMIN</div><h2 id="modal-title">Connect Supabase first.</h2><p>The host dashboard needs Supabase for event records, plus the Anakin and host access secrets in Edge Function settings.</p><button class="button button-lime" id="host-back">Back to the event list</button>`;
      bindClose();
      content.querySelector('#host-back').addEventListener('click', () => showEventDirectory());
      return;
    }
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="mono modal-kicker">HOST ADMIN · CREATE AN OFFICIAL EVENT</div><h2 id="modal-title">Put your event on the map.</h2><p>Add the Luma event link and the host details. Anakin will read the public event page and fill in the event brief before it appears in the attendee event list.</p>
      <form id="host-event-form"><label class="field"><span>HOST DASHBOARD CODE</span><input id="host-code" type="password" autocomplete="off" required placeholder="Admin access code"></label><label class="field"><span>EVENT NAME</span><input id="host-event-name" maxlength="180" required placeholder="Speed of Thought" /></label><label class="field"><span>VENUE / LOCATION</span><input id="host-event-location" maxlength="180" required placeholder="91Springboard, Gurugram" /></label><label class="field"><span>DATE & TIME</span><input id="host-event-start" type="datetime-local" /></label><label class="field"><span>PUBLIC LUMA EVENT LINK</span><input id="host-event-luma" type="url" required placeholder="https://lu.ma/your-event" /></label><fieldset class="profile-fieldset"><legend>HOST PROFILE · MANAGED HERE BY THE HOST</legend><label class="field"><span>HOST NAME</span><input id="host-name" maxlength="80" required placeholder="Your name" /></label><label class="field"><span>HOST INTRO</span><textarea id="host-bio" maxlength="800" required placeholder="Who are you, and what should attendees know about you?"></textarea></label><label class="field"><span>HOST X · OPTIONAL</span><input id="host-x" maxlength="180" placeholder="@handle or X profile URL" /></label><label class="field"><span>HOST LINKEDIN · OPTIONAL</span><input id="host-linkedin" maxlength="220" placeholder="LinkedIn profile URL" /></label></fieldset><div id="host-event-status" class="error" aria-live="polite"></div><button class="button button-lime" type="submit">Scrape with Anakin & publish event ✨</button><button class="edit-profile" type="button" id="back-to-events">Back to event list</button></form>`;
    bindClose();
    content.querySelector('#back-to-events').addEventListener('click', () => showEventDirectory());
    content.querySelector('#host-event-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      const status = content.querySelector('#host-event-status');
      button.disabled = true; button.textContent = 'Anakin is reading the Luma page…';
      status.textContent = '';
      try {
        await ensureAnonymousUser();
        const eventDetails = {
          eventName: content.querySelector('#host-event-name').value.trim(),
          location: content.querySelector('#host-event-location').value.trim(),
          startsAt: content.querySelector('#host-event-start').value ? new Date(content.querySelector('#host-event-start').value).toISOString() : null,
          lumaUrl: content.querySelector('#host-event-luma').value.trim(),
          hostName: content.querySelector('#host-name').value.trim(),
          hostBio: content.querySelector('#host-bio').value.trim(),
          hostX: content.querySelector('#host-x').value.trim(),
          hostLinkedIn: content.querySelector('#host-linkedin').value.trim()
        };
        const { data, error } = await client.functions.invoke('events', { body: { action: 'create', adminCode: content.querySelector('#host-code').value, event: eventDetails } });
        if (error) throw new Error(data?.error || error.message || 'Could not publish this event.');
        if (data?.error) throw new Error(data.error);
        activeEvent = data.event;
        renderPublishedEvent(data.event);
      } catch (error) {
        status.textContent = friendlyError(error);
        button.disabled = false; button.textContent = 'Scrape with Anakin & publish event ✨';
      }
    });
  }

  function renderPublishedEvent(event) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="joined"><div class="big-emoji">✨</div><div class="mono modal-kicker">EVENT PUBLISHED</div><h2 id="modal-title">${escapeHtml(event.event_name)}</h2><p>${escapeHtml(event.event_location)}${event.starts_at ? ` · ${escapeHtml(new Date(event.starts_at).toLocaleString())}` : ''}</p><div class="event-brief"><b>${escapeHtml(event.organizer_name || event.host_name)}</b><p>${escapeHtml(event.event_summary || 'Open the Luma event page for details.')}</p></div><p>Your event is now available by name in the attendee event list. Event joiners will see the host profile and discover one another in this event.</p><button class="button button-lime" id="admin-new-event">Create another event</button><button class="edit-profile" id="admin-event-list">View attendee event list</button></div>`;
    bindClose();
    content.querySelector('#admin-new-event').addEventListener('click', openHostDashboard);
    content.querySelector('#admin-event-list').addEventListener('click', () => showEventDirectory());
  }

  function closeModal() {
    modal.classList.remove('open');
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  function bindClose() {
    content.querySelector('.close')?.addEventListener('click', closeModal);
  }

  function readDraft() {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* Continue with the session copy when persistent storage is unavailable. */ }
    try {
      const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
      if (saved) saveDraft(saved);
      return saved;
    } catch { return null; }
  }

  function saveDraft(profile) {
    const saved = JSON.stringify(profile);
    try { localStorage.setItem(DRAFT_KEY, saved); } catch { /* Browser storage can be unavailable in private mode. */ }
    try { sessionStorage.setItem(DRAFT_KEY, saved); } catch { /* Keep the local copy when possible. */ }
  }

  function profileChoiceButtons(group, options, selected = []) {
    return `<div class="choice-chips">${options.map((value) => `<button type="button" class="choice-chip" data-choice-group="${group}" data-value="${escapeHtml(value)}" aria-pressed="${selected.includes(value)}">${escapeHtml(value)}</button>`).join('')}</div>`;
  }

  function selectedChoices(group) {
    return [...content.querySelectorAll(`[data-choice-group="${group}"][aria-pressed="true"]`)].map((button) => button.dataset.value);
  }

  function uniqueTags(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
  }

  function asTags(values) {
    if (Array.isArray(values)) return values;
    if (typeof values === 'string') return values.split(',').map((value) => value.trim()).filter(Boolean);
    return [];
  }

  function profileSignals(text) {
    const normalized = text.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
    const tools = AI_TOOLS.flatMap((tool) => {
      const alias = TOOL_ALIASES[tool].find((candidate) => normalized.includes(candidate.replace(/[’']/g, '').toLowerCase()));
      if (!alias) return [];
      const term = alias.replace(/[’']/g, '').toLowerCase();
      const position = normalized.indexOf(term);
      const context = normalized.slice(Math.max(0, position - 64), position);
      const group = /(want to try|curious about|interested in|like to try|learn about|exploring|hoping to try)/.test(context) ? 'tools_curious' : 'tools_used';
      return [{ value: tool, group }];
    });
    const includesAlias = (alias) => normalized.includes(alias.replace(/[’']/g, '').toLowerCase());
    const sentences = normalized.split(/[.!?;\n]+/).filter(Boolean);
    return {
      tools,
      topics: TOPIC_TAGS.filter((topic) => TOPIC_ALIASES[topic].some(includesAlias)),
      goals: LOOKING_FOR.filter((goal) => sentences.some((sentence) =>
        LOOKING_FOR_ALIASES[goal].some((alias) => sentence.includes(alias))
        && /\b(looking|want|would love|hope|hoping|need|find|seeking|searching|open to|happy to)\b/.test(sentence)
      ))
    };
  }

  function showProfileSetup(_unused, profile = readDraft() || {}) {
    if (!activeEvent) { showEventDirectory('Choose an event before making your builder profile.'); return; }
    const source = profile || {};
    const draft = source;
    const autoSelectedSignals = new Set();
    const selectedTools = asTags(draft.tools_used).filter((tool) => AI_TOOLS.includes(tool));
    const customTools = asTags(draft.tools_used).filter((tool) => !AI_TOOLS.includes(tool)).join(', ');
    const selectedTopics = draft.interests || [];
    const selectedGoals = draft.looking_for || [];
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="mono modal-kicker">JOIN EVENT · BUILDER PROFILE</div>
      <h2 id="modal-title">Meet the people at<br>${escapeHtml(activeEvent.event_name)}.</h2>
      <div class="selected-event-summary"><b>${escapeHtml(activeEvent.event_location)}</b>${activeEvent.starts_at ? `<span>${escapeHtml(new Date(activeEvent.starts_at).toLocaleString())}</span>` : ''}<p>${escapeHtml(activeEvent.event_summary || 'Your event host will share more about this event.')}</p><button type="button" class="edit-profile" id="change-event">Choose a different event</button></div>
      <p>Tell the people at this event what you build, what you’re curious about, and who you’d like to meet.</p>
      <form id="profile-form">
        <label class="field"><span>DISPLAY NAME</span><input id="profile-name" maxlength="32" placeholder="Name or nickname" autocomplete="nickname" required value="${escapeHtml(draft.name || '')}" /></label>
        <label class="field"><span>YOUR BUILDER INTRO · UP TO ${BIO_MAX_LENGTH} CHARACTERS</span><textarea id="profile-bio" maxlength="${BIO_MAX_LENGTH}" placeholder="I’m building… I’m curious about… I’d love to meet…" required>${escapeHtml(draft.bio || '')}</textarea></label>
        <div class="voice-tip"><span>🎙️</span><div><b>Speak with Wispr Flow</b><small>Focus the intro box, start Flow, and speak naturally. SideQuest will suggest tool, interest, and “who to meet” tags from what you say.</small></div></div>
        <div class="detected-note" id="detected-note" aria-live="polite">Your name stays a separate field so you can choose exactly how it appears.</div>
        <fieldset class="profile-fieldset"><legend>AI TOOLS I USE</legend>${profileChoiceButtons('tools_used', AI_TOOLS, selectedTools)}<label class="field compact-field"><span>OTHER TOOLS I USE</span><input id="profile-custom-tools" maxlength="180" placeholder="Comma-separated tool names" value="${escapeHtml(customTools)}" /></label></fieldset>
        <fieldset class="profile-fieldset"><legend>TOOLS I’M CURIOUS ABOUT · SAY IT IN YOUR INTRO</legend><div class="voice-curious-preview" id="voice-curious-preview" aria-live="polite">Say “I’m curious about Cursor and Claude” in your intro and they’ll appear here.</div></fieldset>
        <fieldset class="profile-fieldset"><legend>INTERESTS</legend>${profileChoiceButtons('interests', TOPIC_TAGS, selectedTopics)}<label class="field compact-field"><span>ADD YOUR OWN</span><input id="profile-interests" maxlength="180" placeholder="Comma-separated, e.g. film, climate tech" value="${escapeHtml(draft.interestsText || '')}" /></label></fieldset>
        <fieldset class="profile-fieldset"><legend>WHO WOULD YOU LIKE TO MEET?</legend>${profileChoiceButtons('looking_for', LOOKING_FOR, selectedGoals)}</fieldset>
        <details class="social-details"><summary>Optional links</summary><label class="field"><span>X PROFILE</span><input id="profile-x" maxlength="180" placeholder="https://x.com/yourhandle" value="${escapeHtml(draft.x_url || '')}" /></label><label class="field"><span>LINKEDIN PROFILE</span><input id="profile-linkedin" maxlength="220" placeholder="https://linkedin.com/in/yourname" value="${escapeHtml(draft.linkedin_url || '')}" /></label><label class="share-toggle"><input id="share-socials" type="checkbox" ${draft.share_with_room ? 'checked' : ''}><span>Show these links to people at this event</span></label><small class="privacy-note">Links stay private unless you turn this on.</small></details>
        <div class="error" id="profile-error"></div>
        <button class="button button-lime" type="submit">Join this event ↗</button>
        <p class="fine">Your profile is remembered on this browser. No email login needed.</p>
      </form>`;
    bindClose();
    content.querySelector('#change-event').addEventListener('click', () => showEventDirectory());
    content.querySelectorAll('[data-choice-group]').forEach((button) => button.addEventListener('click', () => {
      button.setAttribute('aria-pressed', button.getAttribute('aria-pressed') !== 'true');
    }));
    const bioField = content.querySelector('#profile-bio');
    const detectedNote = content.querySelector('#detected-note');
    const curiousPreview = content.querySelector('#voice-curious-preview');
    bioField.addEventListener('input', () => {
      const signals = profileSignals(bioField.value);
      const suggestions = [
        ...signals.tools.map(({ value, group }) => [group, value]),
        ...signals.topics.map((value) => ['interests', value]),
        ...signals.goals.map((value) => ['looking_for', value])
      ];
      const currentKeys = new Set(suggestions.map(([group, value]) => `${group}:${value}`));
      autoSelectedSignals.forEach((key) => {
        if (currentKeys.has(key)) return;
        const [group, value] = key.split(':');
        const chip = content.querySelector(`[data-choice-group="${group}"][data-value="${CSS.escape(value)}"]`);
        chip?.setAttribute('aria-pressed', 'false');
        autoSelectedSignals.delete(key);
      });
      suggestions.forEach(([group, value]) => {
        const key = `${group}:${value}`;
        if (autoSelectedSignals.has(key)) return;
        const chip = content.querySelector(`[data-choice-group="${group}"][data-value="${CSS.escape(value)}"]`);
        if (chip && chip.getAttribute('aria-pressed') !== 'true') {
          chip.setAttribute('aria-pressed', 'true');
          autoSelectedSignals.add(key);
        }
      });
      const detected = [...signals.tools.map(({ value }) => value), ...signals.topics, ...signals.goals];
      const curiousToolsFromVoice = signals.tools.filter(({ group }) => group === 'tools_curious').map(({ value }) => value);
      curiousPreview.innerHTML = curiousToolsFromVoice.length
        ? curiousToolsFromVoice.map((tool) => `<span class="voice-curious-tag">${escapeHtml(tool)}</span>`).join('')
        : 'Say “I’m curious about Cursor and Claude” in your intro and they’ll appear here.';
      detectedNote.textContent = detected.length
        ? `Picked up ${detected.join(', ')} from your intro. Review your selections below.`
        : 'Your name stays a separate field so you can choose exactly how it appears.';
    });
    bioField.dispatchEvent(new Event('input'));
    content.querySelector('#profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const errorBox = content.querySelector('#profile-error');
      const profile = {
        name: content.querySelector('#profile-name').value.trim(),
        bio: bioField.value.trim(),
        interests: uniqueTags([...selectedChoices('interests'), ...content.querySelector('#profile-interests').value.split(',')]),
        interestsText: content.querySelector('#profile-interests').value.trim(),
        tools_used: uniqueTags([...selectedChoices('tools_used'), ...content.querySelector('#profile-custom-tools').value.split(',')]),
        tools_curious: uniqueTags(profileSignals(bioField.value).tools.filter(({ group }) => group === 'tools_curious').map(({ value }) => value)),
        looking_for: selectedChoices('looking_for'),
        x_url: content.querySelector('#profile-x').value.trim(),
        linkedin_url: content.querySelector('#profile-linkedin').value.trim(),
        share_with_room: content.querySelector('#share-socials').checked
      };
      if (!profile.name || !profile.bio) {
        errorBox.textContent = 'Add a display name and a quick builder intro to continue.';
        return;
      }
      try {
        profile.x_url = normalizeSocialUrl(profile.x_url, 'x');
        profile.linkedin_url = normalizeSocialUrl(profile.linkedin_url, 'linkedin');
      } catch (error) {
        errorBox.textContent = error.message;
        return;
      }
      saveDraft(profile);
      joinSelectedEvent(profile);
    });
  }

  function normalizeSocialUrl(value, network) {
    if (!value) return null;
    const base = network === 'x' ? 'https://x.com/' : 'https://www.linkedin.com/in/';
    const raw = /^[\w.-]+$/.test(value.replace(/^@/, ''))
      ? `${base}${value.replace(/^@/, '')}`
      : (/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const label = network === 'x' ? 'X' : 'LinkedIn';
    let url;
    try { url = new URL(raw); } catch { throw new Error(`Enter a valid ${label} link.`); }
    if (url.username || url.password) throw new Error('Remove login details from the link.');
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const allowed = network === 'x' ? ['x.com', 'twitter.com'] : ['linkedin.com'];
    if (url.protocol !== 'https:' || !allowed.includes(host)) {
      throw new Error(`Use a valid HTTPS ${label} link.`);
    }
    return url.toString();
  }

  async function ensureAnonymousUser() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session) return sessionData.session.user;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async function joinSelectedEvent(profile) {
    const submit = content.querySelector('#profile-form [type="submit"]');
    const errorBox = content.querySelector('#profile-error');
    if (!activeEvent || !client) {
      showMessage(errorBox, 'Choose a published event and connect Supabase to join it.');
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Joining the event…';
    try {
      await ensureAnonymousUser();
      const { data, error } = await client.rpc('join_hosted_event', { p_event_id: activeEvent.id });
      if (error) throw error;
      const joinedEvent = data?.[0];
      if (!joinedEvent) throw new Error('That event is no longer open. Choose another event.');
      const { data: roomData, error: roomError } = await client.from('rooms').select('id,name').eq('id', joinedEvent.room_id).single();
      if (roomError) throw roomError;
      activeRoom = { ...roomData, name: joinedEvent.event_name };
      saveDraft(profile);
      await saveProfile(profile);
    } catch (error) {
      showMessage(errorBox, friendlyError(error));
      submit.disabled = false;
      submit.textContent = 'Join this event ↗';
    }
  }

  async function saveProfile(profile) {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    const { error } = await client.from('profiles').upsert({
      room_id: activeRoom.id,
      user_id: userData.user.id,
      display_name: profile.name,
      bio: profile.bio,
      interests: profile.interests || [],
      tools_used: profile.tools_used || [],
      tools_curious: profile.tools_curious || [],
      looking_for: profile.looking_for || [],
      updated_at: new Date().toISOString()
    }, { onConflict: 'room_id,user_id' });
    if (error) throw error;
    saveDraft(profile);
    activeProfile = { ...profile, display_name: profile.name, user_id: userData.user.id };
    await saveProfileSocialLinks(profile, userData.user.id);
    await showRoomBoard(profile.name);
  }

  async function saveProfileSocialLinks(profile, userId) {
    const links = {
      room_id: activeRoom.id,
      user_id: userId,
      x_url: profile.x_url || null,
      linkedin_url: profile.linkedin_url || null,
      share_with_room: Boolean(profile.share_with_room),
      updated_at: new Date().toISOString()
    };
    if (!links.x_url && !links.linkedin_url && !links.share_with_room) {
      const { error } = await client.from('profile_social_links').delete().eq('room_id', activeRoom.id).eq('user_id', userId);
      if (error) throw error;
      return;
    }
    const { error } = await client.from('profile_social_links').upsert(links, { onConflict: 'room_id,user_id' });
    if (error) throw error;
  }

  async function showRoomBoard(yourName, localMembers) {
    let profiles = localMembers;
    if (client) profiles = await loadRoomProfiles();
    else if (!profiles) {
      try { profiles = JSON.parse(localStorage.getItem('sidequest-members') || '[]').reverse(); }
      catch { profiles = []; }
    }
    renderRoomBoard(yourName, profiles);
    if (client) scheduleBoardRefresh(yourName);
  }

  async function showPrivateEventHistory() {
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const { data, error } = await client.from('profile_event_history')
        .select('event_id,event_name,event_location,joined_at')
        .eq('user_id', userData.user.id)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="mono modal-kicker">PRIVATE TO YOUR PROFILE</div><h2 id="modal-title">My event history.</h2><p>Only you can see this list. Joining an event connects your builder profile to that event’s people.</p><div class="history-list">${(data || []).map((item) => `<article class="event-option"><h3>${escapeHtml(item.event_name)}</h3><p class="event-location">📍 ${escapeHtml(item.event_location)}</p><small>Joined ${escapeHtml(new Date(item.joined_at).toLocaleString())}</small></article>`).join('') || '<p class="fine">Your event history is empty. Choose an event to add your first one.</p>'}</div><button class="button button-lime" id="history-back">Back to people ↗</button>`;
      bindClose();
      content.querySelector('#history-back').addEventListener('click', () => showRoomBoard(activeProfile.name));
    } catch (error) {
      const issue = friendlyError(error);
      renderRoomBoard(activeProfile.name, await loadRoomProfiles());
      const target = content.querySelector('#discover-error');
      if (target) target.textContent = `Could not load your private history. ${issue}`;
    }
  }

  async function loadRoomProfiles() {
    const [{ data: profiles, error }, { data: socialLinks, error: socialError }, { data: memberships, error: memberError }, { data: events, error: eventsError }] = await Promise.all([
      client.from('profiles')
        .select('user_id,display_name,bio,interests,tools_used,tools_curious,looking_for,updated_at')
        .eq('room_id', activeRoom.id)
        .order('updated_at', { ascending: false }),
      client.from('profile_social_links')
        .select('user_id,x_url,linkedin_url,share_with_room')
        .eq('room_id', activeRoom.id),
      client.from('room_members')
        .select('user_id,joined_at')
        .eq('room_id', activeRoom.id),
      client.from('profile_events')
        .select('user_id,luma_event_id,event_name,event_url,starts_at,organizer_name,event_summary,share_with_room')
        .eq('room_id', activeRoom.id)
    ]);
    if (error) throw error;
    if (socialError) throw socialError;
    if (memberError) throw memberError;
    if (eventsError) throw eventsError;
    const linksByUser = Object.fromEntries((socialLinks || []).map((link) => [link.user_id, link]));
    const joinedByUser = Object.fromEntries((memberships || []).map((member) => [member.user_id, member.joined_at]));
    const eventsByUser = (events || []).filter((item) => item.share_with_room).reduce((groups, item) => { (groups[item.user_id] ||= []).push(item); return groups; }, {});
    return (profiles || []).map((profile) => ({ ...profile, joined_at: joinedByUser[profile.user_id], social_links: linksByUser[profile.user_id] || null, shared_events: eventsByUser[profile.user_id] || [] }))
      .sort((a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0));
  }

  function scheduleBoardRefresh(yourName) {
    if (refreshTimer) clearTimeout(refreshTimer);
    // Stagger refreshes across clients so a crowd joining together doesn't create a request spike.
    refreshTimer = setTimeout(async () => {
      if (!modal.classList.contains('open') || !activeRoom || !content.querySelector('#room-count')) return;
      try {
        const data = await loadRoomProfiles();
        if (data && modal.classList.contains('open')) updateRoomBoard(yourName, data);
      } finally {
        if (modal.classList.contains('open')) scheduleBoardRefresh(yourName);
      }
    }, 12000 + Math.floor(Math.random() * 6000));
  }

  function renderRoomBoard(yourName, profiles) {
    const cards = profileCards(yourName, profiles);
    const myInterests = activeProfile?.interests || [];
    const myTools = [...(activeProfile?.tools_used || []), ...(activeProfile?.tools_curious || [])];
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="joined"><div class="big-emoji">✨</div>
      <div class="mono modal-kicker">${client ? 'EVENT COMMUNITY · LIVE' : 'EVENT COMMUNITY · LOCAL PREVIEW'}</div>
      <h2 id="modal-title">You’re at ${escapeHtml(activeEvent?.event_name || activeRoom.name)}, ${escapeHtml(yourName)}.</h2>
      <p>${escapeHtml(activeEvent?.event_location || '')} · Meet the people who joined this event. The newest arrivals appear first.</p>
      <div class="event-brief"><b>${escapeHtml(activeEvent?.organizer_name || activeEvent?.host_name || 'Event host')}</b><p>${escapeHtml(activeEvent?.event_summary || '')}</p>${activeEvent?.luma_url ? `<a href="${escapeHtml(activeEvent.luma_url)}" target="_blank" rel="noopener noreferrer">Open the Luma event ↗</a>` : ''}<div class="host-profile"><strong>${escapeHtml(activeEvent?.host_name || '')}</strong><span>${escapeHtml(activeEvent?.host_bio || '')}</span>${activeEvent?.host_x_url ? `<a href="${escapeHtml(activeEvent.host_x_url)}" target="_blank" rel="noopener noreferrer">Host X ↗</a>` : ''}${activeEvent?.host_linkedin_url ? `<a href="${escapeHtml(activeEvent.host_linkedin_url)}" target="_blank" rel="noopener noreferrer">Host LinkedIn ↗</a>` : ''}</div></div>
      <div class="event-attendee-count" id="room-count">${profiles.length} ${profiles.length === 1 ? 'PERSON' : 'PEOPLE'} CONNECTED TO THIS EVENT</div>
      <div class="my-builder-tags">${[...myTools.map((tool) => `🛠 ${tool}`), ...myInterests].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="discover-heading"><div><div class="mono">PEOPLE AT THIS EVENT</div><p>Shared tools, interests, and goals help you find the right people to meet.</p></div><button type="button" class="edit-profile" id="edit-builder">Edit profile</button></div><label class="match-search"><span class="sr-only">Search builders</span><input id="builder-search" type="search" placeholder="Search people, tools, or interests" autocomplete="off"></label><div class="error" id="discover-error"></div>
      <div class="member-list">${cards || '<p class="fine">You are the first person here so far.</p>'}</div>
      <button class="button button-lime" id="main-quest-events">Main Quest · Explore your Luma events ↗</button><p class="fine">Luma is optional. Event details stay private unless you choose to share each one.</p>
      <button class="edit-profile" id="my-event-history">My private event history</button><button class="button button-lime" id="share-room">Share this event ↗</button>
      <button class="edit-profile" id="start-game">Play the event icebreaker 🎙️</button>
      <button class="button button-lime" id="done">Done ↗</button></div>`;
    bindClose();
    content.querySelector('#edit-builder').addEventListener('click', () => showProfileSetup(null, activeProfile));
    content.querySelector('#share-room').addEventListener('click', copyEventInvite);
    content.querySelector('#my-event-history').addEventListener('click', showPrivateEventHistory);
    content.querySelector('#main-quest-events').addEventListener('click', () => openLumaEvents());
    content.querySelector('#builder-search').addEventListener('input', (event) => {
      const term = event.currentTarget.value.trim().toLowerCase();
      content.querySelectorAll('.match-card').forEach((card) => { card.hidden = !card.dataset.search.includes(term); });
    });
    content.querySelector('#start-game').addEventListener('click', () => startGame(yourName));
    content.querySelector('#done').addEventListener('click', closeModal);
  }

  function profileSignalsForMatch(profile) {
    const tools = uniqueTags([...asTags(profile.tools_used), ...asTags(profile.tools_curious)]);
    const interests = uniqueTags(asTags(profile.interests));
    const goals = uniqueTags(asTags(profile.looking_for));
    return { tools, interests, goals };
  }

  function matchDetails(viewer, candidate) {
    const mine = profileSignalsForMatch(viewer || {});
    const theirs = profileSignalsForMatch(candidate || {});
    const overlap = (left, right) => left.filter((value) => right.some((other) => other.toLowerCase() === value.toLowerCase()));
    const sharedTools = overlap(mine.tools, theirs.tools);
    const sharedInterests = overlap(mine.interests, theirs.interests);
    const sharedGoals = overlap(mine.goals, theirs.goals);
    return {
      sharedTools,
      sharedInterests,
      sharedGoals,
      score: sharedTools.length * 2 + sharedInterests.length * 3 + sharedGoals.length
    };
  }

  function profileCards(yourName, profiles) {
    const own = profiles.find((profile) => activeProfile?.user_id && profile.user_id === activeProfile.user_id)
      || profiles.find((profile) => (profile.display_name || profile.name) === yourName)
      || activeProfile || {};
    const candidates = profiles
      .filter((profile) => activeProfile?.user_id && profile.user_id
        ? profile.user_id !== activeProfile.user_id
        : (profile.display_name || profile.name) !== yourName)
      .map((profile) => ({ profile, match: matchDetails(own, profile) }))
      .sort((a, b) => b.match.score - a.match.score || (a.profile.display_name || a.profile.name || '').localeCompare(b.profile.display_name || b.profile.name || ''));
    return candidates.map(({ profile, match }) => {
      const interests = asTags(profile.interests);
      const tools = uniqueTags([...asTags(profile.tools_used), ...asTags(profile.tools_curious)]);
      const sharedEvents = (profile.shared_events || []).filter((item) => (own.shared_events || []).some((mine) => mine.luma_event_id === item.luma_event_id));
      const socials = profile.social_links?.share_with_room ? profile.social_links : null;
      const xUrl = socials && safeSocialHref(socials.x_url, 'x');
      const linkedinUrl = socials && safeSocialHref(socials.linkedin_url, 'linkedin');
      const reasons = [
        ...match.sharedTools.map((tool) => `🛠 ${tool}`),
        ...match.sharedInterests.map((interest) => `✳ ${interest}`),
        ...match.sharedGoals.map((goal) => `🤝 ${goal}`),
        ...sharedEvents.map((item) => `📍 You both listed ${item.event_name}`)
      ];
      const fit = (match.score || sharedEvents.length) ? `${reasons.length} SHARED SIGNAL${reasons.length === 1 ? '' : 'S'}` : 'AT THIS EVENT';
      const socialMarkup = [xUrl ? `<a href="${escapeHtml(xUrl)}" target="_blank" rel="noopener noreferrer">X ↗</a>` : '', linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ''].filter(Boolean).join('');
      const searchable = [profile.display_name || profile.name, profile.bio, ...tools, ...interests, ...asTags(profile.looking_for)].join(' ').toLowerCase();
      return `<article class="member-card match-card" data-search="${escapeHtml(searchable)}">
        <div class="member-avatar">✦</div>
        <div class="member-info"><div class="match-fit">${fit}</div><div class="member-name">${escapeHtml(profile.display_name || profile.name)}</div>
        <div class="event-joined-at">Joined ${profile.joined_at ? escapeHtml(new Date(profile.joined_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : 'this event'}</div>
        <div class="member-bio">${escapeHtml(profile.bio)}</div>
        ${reasons.length ? `<div class="match-reasons">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>` : ''}
        ${sharedEvents.filter((item) => item.event_summary).map((item) => `<div class="shared-event-note">${escapeHtml(item.event_name)} · ${escapeHtml(item.event_summary)}</div>`).join('')}
        <div class="taglist">${[...tools.map((tool) => `🛠 ${tool}`), ...interests].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        ${asTags(profile.looking_for).length ? `<div class="looking-for">HOPING TO MEET: ${asTags(profile.looking_for).map(escapeHtml).join(' · ')}</div>` : ''}
        ${socialMarkup ? `<div class="social-links">${socialMarkup}</div>` : ''}
        </div>
      </article>`;
    }).join('');
  }

  function safeSocialHref(value, network) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      const allowed = network === 'x' ? ['x.com', 'twitter.com'] : ['linkedin.com'];
      return url.protocol === 'https:' && allowed.includes(host) ? url.toString() : null;
    } catch { return null; }
  }

  async function copyEventInvite(event) {
    const invite = new URL(location.href);
    invite.search = '';
    invite.searchParams.set('event', activeEvent.id);
    invite.hash = 'join';
    try {
      await navigator.clipboard.writeText(invite.toString());
      event.currentTarget.textContent = 'Event link copied ✓';
    } catch {
      event.currentTarget.textContent = 'Copy this page URL to invite people';
    }
  }

  async function startGame(yourName) {
    activeGameName = yourName;
    gameVotes = {};
    gameIndex = 0;
    if (client) {
      const { data, error } = await client.from('game_votes').select('title_id,vote').eq('room_id', activeRoom.id);
      if (error) { renderGameError(yourName, error); return; }
      (data || []).forEach((row) => { gameVotes[row.title_id] ||= {}; gameVotes[row.title_id][row.vote] = (gameVotes[row.title_id][row.vote] || 0) + 1; });
      const { data: ownVotes, error: ownError } = await client.from('game_votes').select('title_id,vote').eq('room_id', activeRoom.id).eq('user_id', (await client.auth.getUser()).data.user.id);
      if (ownError) { renderGameError(yourName, ownError); return; }
      gameVotes.own = Object.fromEntries((ownVotes || []).map((row) => [row.title_id, row.vote]));
      gameIndex = GAME_TITLES.findIndex((title) => !gameVotes.own[title.id]);
    } else {
      try { gameVotes.own = JSON.parse(localStorage.getItem(`sidequest-votes-${activeEvent?.id}`) || '{}'); } catch { gameVotes.own = {}; }
      gameIndex = GAME_TITLES.findIndex((title) => !gameVotes.own[title.id]);
    }
    if (gameIndex < 0) showGameResults(yourName);
    else renderGameCard();
  }

  function renderGameCard() {
    const title = GAME_TITLES[gameIndex];
    const done = Object.keys(gameVotes.own || {}).length;
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="joined game-screen"><div class="mono modal-kicker">SIDEQUEST WATCHLIST · ${done + 1} / ${GAME_TITLES.length}</div><div class="game-art">${title.art}</div><div class="mono">${title.year} · MOVIE / SERIES</div><h2 id="modal-title">${escapeHtml(title.title)}</h2><p>${escapeHtml(title.note)}</p><div class="game-meter"><i style="width:${Math.round(done / GAME_TITLES.length * 100)}%"></i></div><section class="game-voice" aria-label="Vote with Wispr Flow"><div class="game-voice-title"><span>🎙️</span><div><b>Say your vote</b><small>Focus this field, start Wispr Flow, and say one choice.</small></div></div><input id="game-command" type="text" autocomplete="off" autocapitalize="off" placeholder="Like, dislike, or not seen" aria-label="Say like, dislike, or not seen"><p class="game-voice-status" id="game-voice-status" role="status" aria-live="polite">Your vote saves and the next title appears.</p></section><p class="fine game-fallback-label">Prefer tapping?</p><div class="game-actions"><button class="game-nope" data-vote="nope">👎<small>DISLIKE</small></button><button class="game-unseen" data-vote="unseen">🤷<small>NOT SEEN</small></button><button class="game-like" data-vote="like">💚<small>LIKE</small></button></div><p class="fine">Your picks stay hidden until you finish the round.</p></div>`;
    bindClose();
    content.querySelectorAll('[data-vote]').forEach((button) => button.addEventListener('click', () => saveGameVote(title, button.dataset.vote)));
    const command = content.querySelector('#game-command');
    const status = content.querySelector('#game-voice-status');
    let commandTimer;
    let isSaving = false;
    command.addEventListener('input', () => {
      clearTimeout(commandTimer);
      commandTimer = setTimeout(async () => {
        if (isSaving) return;
        const vote = parseGameVote(command.value);
        if (!vote) {
          status.textContent = 'Try one short command: “like”, “dislike”, or “not seen”.';
          status.dataset.state = 'error';
          return;
        }
        isSaving = true;
        status.dataset.state = 'saving';
        status.textContent = `Got it — ${vote === 'like' ? 'like' : vote === 'nope' ? 'dislike' : 'not seen'}. Saving…`;
        command.disabled = true;
        await saveGameVote(title, vote);
      }, 350);
    });
    setTimeout(() => command.isConnected && command.focus({ preventScroll: true }), 120);
  }

  function parseGameVote(value) {
    const phrase = value.toLowerCase().trim().replace(/[’']/g, '').replace(/[.!?,]/g, '').replace(/\s+/g, ' ');
    const likes = ['like', 'liked', 'liked it', 'love it', 'loved it', 'into it', 'yes', 'thumbs up', 'i like it', 'i liked it', 'i love it'];
    const dislikes = ['dislike', 'disliked', 'dislike it', 'dont like it', 'i dont like it', 'didnt like it', 'i didnt like it', 'not for me', 'pass', 'no', 'thumbs down'];
    const unseen = ['not seen', 'not seen it', 'havent seen it', 'i havent seen it', 'havent seen this', 'have not seen it', 'unseen', 'not watched', 'havent watched it', 'never seen it'];
    if (likes.includes(phrase)) return 'like';
    if (dislikes.includes(phrase)) return 'nope';
    if (unseen.includes(phrase)) return 'unseen';
    return null;
  }

  async function saveGameVote(title, vote) {
    const button = content.querySelector(`[data-vote="${vote}"]`);
    if (button) button.disabled = true;
    gameVotes.own[title.id] = vote;
    try {
      if (client) {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError) throw userError;
        const { error } = await client.from('game_votes').upsert({ room_id: activeRoom.id, user_id: userData.user.id, title_id: title.id, vote, updated_at: new Date().toISOString() }, { onConflict: 'room_id,user_id,title_id' });
        if (error) throw error;
      } else localStorage.setItem(`sidequest-votes-${activeEvent?.id}`, JSON.stringify(gameVotes.own));
      gameIndex += 1;
      if (gameIndex >= GAME_TITLES.length) showGameResults(activeGameName);
      else renderGameCard();
    } catch (error) {
      delete gameVotes.own[title.id];
      const status = content.querySelector('#game-voice-status');
      if (status) {
        status.textContent = `${friendlyError(error)} Dictate the vote again or use a button.`;
        status.dataset.state = 'error';
      } else showMessage(content.querySelector('.fine:last-child'), friendlyError(error));
      const command = content.querySelector('#game-command');
      if (command) { command.disabled = false; command.value = ''; command.focus({ preventScroll: true }); }
      if (button) button.disabled = false;
    }
  }

  async function showGameResults(yourName) {
    let data = [];
    if (client) {
      const { data: votes, error } = await client.from('game_votes').select('user_id,title_id,vote').eq('room_id', activeRoom.id);
      if (error) { renderGameError(yourName, error); return; }
      data = votes || [];
    } else data = Object.entries(gameVotes.own).map(([title_id, vote]) => ({ user_id: 'local', title_id, vote }));
    const humans = new Set(data.map((vote) => vote.user_id)).size;
    const counts = new Map();
    data.filter((vote) => vote.vote === 'like').forEach((vote) => counts.set(vote.title_id, (counts.get(vote.title_id) || 0) + 1));
    const playerIds = [...new Set(data.map((vote) => vote.user_id))];
    const allDone = playerIds.length > 0 && playerIds.every((userId) => GAME_TITLES.every((title) => data.some((vote) => vote.user_id === userId && vote.title_id === title.id)));
    const matches = GAME_TITLES.filter((title) => counts.get(title.id) >= Math.max(2, Math.ceil(humans * 0.5))).sort((a,b) => counts.get(b.id) - counts.get(a.id));
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="joined game-screen"><div class="big-emoji">🍿</div><div class="mono modal-kicker">THE GROUP WATCHLIST</div><h2 id="modal-title">${allDone ? 'Your room has taste.' : 'Your picks are in!'}</h2><p>${allDone ? 'These titles got the most love from the room.' : `${humans} ${humans === 1 ? 'person has' : 'people have'} played so far. More shared picks will appear as everyone finishes.`}</p><div class="game-results">${matches.length ? matches.map((title) => `<article class="game-result"><span>${title.art}</span><div><b>${escapeHtml(title.title)}</b><small>${counts.get(title.id)} ${counts.get(title.id) === 1 ? 'fan' : 'fans'} in this room</small></div></article>`).join('') : '<p class="fine">No shared likes yet. Get another person to play and check back!</p>'}</div><button class="button button-lime" id="play-again">Play again ↗</button><button class="edit-profile" id="back-board">Back to the room board</button></div>`;
    bindClose();
    content.querySelector('#play-again').addEventListener('click', () => startGame(yourName));
    content.querySelector('#back-board').addEventListener('click', () => showRoomBoard(yourName));
  }

  function renderGameError(yourName, error) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="joined"><div class="mono modal-kicker">GAME SETUP</div><h2 id="modal-title">One quick database step.</h2><p>${escapeHtml(friendlyError(error))}</p><p>Install the game-voting SQL from <code>supabase/game.sql</code>, then refresh the room.</p><button class="button button-lime" id="game-back">Back to room</button></div>`;
    bindClose();
    content.querySelector('#game-back').addEventListener('click', () => showRoomBoard(yourName));
  }

  function updateRoomBoard(yourName, profiles) {
    const list = content.querySelector('.member-list');
    const count = content.querySelector('#room-count');
    if (!list || !count) return;
    list.innerHTML = profileCards(yourName, profiles) || '<p class="fine">You are the first person here so far.</p>';
    count.textContent = `${profiles.length} ${profiles.length === 1 ? 'PERSON' : 'PEOPLE'} CONNECTED TO THIS EVENT`;
  }

  function showMessage(error, message) { error.textContent = message; }

  function friendlyError(error) {
    const message = error?.message || 'Something went wrong. Try again.';
    if (/anonymous_provider_disabled/i.test(message)) return 'Anonymous sign-in is off in this Supabase project. Turn on “Allow anonymous sign-ins” in Auth settings, then try again.';
    if (/Invalid API key|Failed to fetch|NetworkError/i.test(message)) return 'Could not reach Supabase. Check the project URL and publishable key in supabase-config.js.';
    if (/Room creation limit reached/i.test(message)) return 'You have made three rooms in the last hour. Try again later.';
    if (/event is not available|hosted event|join_hosted_event/i.test(message)) return 'That event is no longer available. Return to the event list and choose another one.';
    if (/schema cache/i.test(message)) return 'The SideQuest event database migration is not installed yet. Apply the hosted event migration and try again.';
    return message;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
})();
