(() => {
  const modal = document.querySelector('#modal');
  const content = document.querySelector('#modal-content');
  const config = window.SUPABASE_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey && window.supabase?.createClient);
  const client = configured ? window.supabase.createClient(config.url, config.publishableKey) : null;
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
    'Startups': ['startup', 'startups', 'founder'],
    'Design': ['design', 'designer', 'product design']
  };
  let activeRoom = null;
  let activeProfile = null;
  let returnRoom = null;
  let activeGameName = '';
  let gameIndex = 0;
  let gameVotes = {};
  let refreshTimer = null;

  document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', openModal));
  document.querySelectorAll('[data-create-room]').forEach((button) => button.addEventListener('click', openCreateRoom));
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

  function openModal() {
    showProfileSetup();
    modal.classList.add('open');
    setTimeout(() => document.querySelector('#profile-name')?.focus(), 100);
  }

  function closeModal() {
    modal.classList.remove('open');
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  async function openCreateRoom(event) {
    event?.preventDefault();
    modal.classList.add('open');
    if (!client) {
      showCreateRoomNotice('Room creation needs Supabase', 'Connect the Supabase project and enable anonymous sign-ins to create a shared room code.');
      return;
    }
    showCreateRoomForm();
  }

  function showCreateRoomNotice(title, message) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="mono modal-kicker">MAKE A ROOM ✳</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><button class="button button-lime" id="try-room-again">Got it</button>`;
    bindClose();
    content.querySelector('#try-room-again').addEventListener('click', closeModal);
  }

  function showCreateRoomForm() {
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="mono modal-kicker">MAKE A ROOM · OPEN TO EVERYONE</div>
      <h2>Start a room.</h2><p>Choose a name and get a shareable code. Anyone can make a room; share the code with your people.</p>
      <form id="create-room-form"><label class="field"><span>ROOM NAME</span><input id="room-name" maxlength="60" placeholder="Gurugram AI Builders" required /></label>
        <div class="error" id="create-error"></div><button class="button button-lime" type="submit">Generate room code ✳</button></form><p class="fine">Room creation is limited to 3 per account each hour to prevent spam.</p>`;
    bindClose();
    content.querySelector('#create-room-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const errorBox = content.querySelector('#create-error');
      const roomName = content.querySelector('#room-name').value.trim();
      button.disabled = true;
      button.textContent = 'Making your room…';
      try {
        await ensureAnonymousUser();
        const { data, error } = await client.rpc('create_room', { p_name: roomName });
        if (error) throw error;
        const room = data?.[0];
        if (!room) throw new Error('Could not create the room. Try again.');
        showCreatedRoom(room);
      } catch (error) {
        showMessage(errorBox, friendlyError(error));
        button.disabled = false;
        button.textContent = 'Try again ↗';
      }
    });
  }

  function showCreatedRoom(room) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="joined"><div class="big-emoji">🔑</div><div class="mono modal-kicker">ROOM READY TO SHARE</div>
      <h2 id="modal-title">${escapeHtml(room.name)}</h2><p>Share this code with everyone you want in the room.</p>
      <div class="room-code host-code">${escapeHtml(room.code)}</div>
      <button class="button button-lime" id="copy-room-code">Copy room code ↗</button>
      <button class="edit-profile" id="join-created-room">Join this room and make my profile</button></div>`;
    bindClose();
    content.querySelector('#copy-room-code').addEventListener('click', async (event) => {
      try { await navigator.clipboard.writeText(room.code); event.currentTarget.textContent = 'Copied ✓'; }
      catch { event.currentTarget.textContent = `Room code: ${room.code}`; }
    });
    content.querySelector('#join-created-room').addEventListener('click', () => showProfileSetup(room.code));
  }

  function bindClose() {
    content.querySelector('.close')?.addEventListener('click', closeModal);
  }

  function readDraft() {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); }
    catch { return null; }
  }

  function invitedRoomCode() {
    return new URLSearchParams(location.search).get('room');
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
    return {
      tools,
      topics: TOPIC_TAGS.filter((topic) => TOPIC_ALIASES[topic].some(includesAlias))
    };
  }

  function showProfileSetup(roomCode = invitedRoomCode(), profile = readDraft() || {}) {
    const source = profile || {};
    const draft = roomCode && roomCode !== activeRoom?.code ? { ...source, share_with_room: false } : source;
    const appliedSignals = new Set();
    const selectedTools = asTags(draft.tools_used).filter((tool) => AI_TOOLS.includes(tool));
    const customTools = asTags(draft.tools_used).filter((tool) => !AI_TOOLS.includes(tool)).join(', ');
    const selectedTopics = draft.interests || [];
    const selectedGoals = draft.looking_for || [];
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="mono modal-kicker">YOUR BUILDER CARD · STEP 1</div>
      <h2 id="modal-title">Make your<br>builder profile.</h2>
      <p>Tell the room what you build, what you’re curious about, and who you’d like to meet.</p>
      <form id="profile-form">
        <label class="field"><span>DISPLAY NAME</span><input id="profile-name" maxlength="32" placeholder="Name or nickname" autocomplete="nickname" required value="${escapeHtml(draft.name || '')}" /></label>
        <label class="field"><span>YOUR BUILDER INTRO</span><textarea id="profile-bio" maxlength="260" placeholder="I’m building… I’m curious about… I’d love to meet…" required>${escapeHtml(draft.bio || '')}</textarea></label>
        <div class="voice-tip"><span>🎙️</span><div><b>Speak with Wispr Flow</b><small>Focus the intro box, start Flow, and speak naturally. SideQuest will suggest tool and topic tags from the text for you to review.</small></div></div>
        <div class="detected-note" id="detected-note" aria-live="polite">Your name stays a separate field so you can choose exactly how it appears.</div>
        <fieldset class="profile-fieldset"><legend>AI TOOLS I USE</legend>${profileChoiceButtons('tools_used', AI_TOOLS, selectedTools)}<label class="field compact-field"><span>OTHER TOOLS I USE</span><input id="profile-custom-tools" maxlength="180" placeholder="Comma-separated tool names" value="${escapeHtml(customTools)}" /></label></fieldset>
        <fieldset class="profile-fieldset"><legend>TOOLS I’M CURIOUS ABOUT · SAY IT IN YOUR INTRO</legend><div class="voice-curious-preview" id="voice-curious-preview" aria-live="polite">Say “I’m curious about Cursor and Claude” in your intro and they’ll appear here.</div></fieldset>
        <fieldset class="profile-fieldset"><legend>INTERESTS</legend>${profileChoiceButtons('interests', TOPIC_TAGS, selectedTopics)}<label class="field compact-field"><span>ADD YOUR OWN</span><input id="profile-interests" maxlength="180" placeholder="Comma-separated, e.g. film, climate tech" value="${escapeHtml(draft.interestsText || '')}" /></label></fieldset>
        <fieldset class="profile-fieldset"><legend>WHO WOULD YOU LIKE TO MEET?</legend>${profileChoiceButtons('looking_for', LOOKING_FOR, selectedGoals)}</fieldset>
        <details class="social-details"><summary>Optional social links</summary><label class="field"><span>X PROFILE</span><input id="profile-x" maxlength="180" placeholder="https://x.com/yourhandle" value="${escapeHtml(draft.x_url || '')}" /></label><label class="field"><span>LINKEDIN PROFILE</span><input id="profile-linkedin" maxlength="220" placeholder="https://linkedin.com/in/yourname" value="${escapeHtml(draft.linkedin_url || '')}" /></label><label class="share-toggle"><input id="share-socials" type="checkbox" ${draft.share_with_room ? 'checked' : ''}><span>Show these links to people in this room</span></label><small class="privacy-note">Links stay private unless you turn this on.</small></details>
        <div class="error" id="profile-error"></div>
        <button class="button button-lime" type="submit">Continue to the room ↗</button>
        <p class="fine">No email or Google login required.</p>
      </form>`;
    bindClose();
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
        ...signals.topics.map((value) => ['interests', value])
      ];
      suggestions.forEach(([group, value]) => {
        const key = `${group}:${value}`;
        if (appliedSignals.has(key)) return;
        const chip = content.querySelector(`[data-choice-group="${group}"][data-value="${CSS.escape(value)}"]`);
        if (chip) chip.setAttribute('aria-pressed', 'true');
        appliedSignals.add(key);
      });
      const detected = [...signals.tools.map(({ value }) => value), ...signals.topics];
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
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(profile));
      showRoomEntry(profile, roomCode);
    });
  }

  function normalizeSocialUrl(value, network) {
    if (!value) return null;
    const base = network === 'x' ? 'https://x.com/' : 'https://www.linkedin.com/in/';
    const raw = /^[\w.-]+$/.test(value.replace(/^@/, ''))
      ? `${base}${value.replace(/^@/, '')}`
      : (/^https?:\/\//i.test(value) ? value : `https://${value}`);
    let url;
    try { url = new URL(raw); } catch { throw new Error(`Enter a valid ${network === 'x' ? 'X' : 'LinkedIn'} profile URL.`); }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const allowed = network === 'x' ? ['x.com', 'twitter.com'] : ['linkedin.com'];
    if (url.protocol !== 'https:' || !allowed.includes(host)) throw new Error(`Use a valid HTTPS ${network === 'x' ? 'X' : 'LinkedIn'} profile link.`);
    return url.toString();
  }

  function showRoomEntry(profile = readDraft() || {}, roomCode = null) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="joined"><div class="big-emoji">🪩</div>
      <div class="mono modal-kicker">PROFILE READY · STEP 2 OF 2</div>
      <h2 id="modal-title">Nice to meet you, ${escapeHtml(profile.name || 'friend')}.</h2>
      <p>Your builder card is ready. Enter the room code to find people with shared interests and tools.</p>
      <div class="profile-preview"><b>${escapeHtml(profile.name || '')}</b><span>${escapeHtml(profile.bio || '')}</span><div class="taglist">${[...(profile.tools_used || []), ...(profile.interests || [])].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div></div>
      <button class="edit-profile" type="button">← Edit my intro</button>
      <form id="join-form">
        <label class="field"><span>ROOM CODE</span><input id="code" autocomplete="off" placeholder="e.g. FLOW26" maxlength="12" required value="${escapeHtml(roomCode || '')}" /></label>
        <div class="error" id="room-error"></div>
        <button class="button button-lime" type="submit">Join the room ↗</button>
        <p class="fine">Your profile is saved to the shared room after you join.</p>
      </form></div>`;
    bindClose();
    content.querySelector('.edit-profile').addEventListener('click', () => showProfileSetup(roomCode, profile));
    content.querySelector('#join-form').addEventListener('submit', joinRoom);
    setTimeout(() => content.querySelector('#code')?.focus(), 50);
  }

  async function ensureAnonymousUser() {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session) return sessionData.session.user;
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return data.user;
  }

  async function joinRoom(event) {
    event.preventDefault();
    const code = content.querySelector('#code').value.trim().toUpperCase();
    const errorBox = content.querySelector('#room-error');
    const profile = readDraft();
    if (!profile?.name || !profile?.bio) {
      showProfileSetup();
      return;
    }
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Finding your room…';
    try {
      if (client) {
        await ensureAnonymousUser();
        const { data, error } = await client.rpc('join_room', { p_code: code });
        if (error) throw error;
        activeRoom = data?.[0];
        if (!activeRoom) throw new Error('Room code not found or the room is closed.');
        await saveProfile(profile);
      } else {
        if (code !== 'FLOW26') throw new Error('That code didn’t open this demo room. Try FLOW26.');
        activeRoom = { id: 'local-demo', code: 'FLOW26', name: 'Gurugram AI Builders' };
        const members = JSON.parse(localStorage.getItem('sidequest-members') || '[]');
        const next = { ...profile, display_name: profile.name, at: Date.now() };
        members.push(next);
        localStorage.setItem('sidequest-members', JSON.stringify(members));
        activeProfile = next;
        await showRoomBoard(profile.name, [...members].reverse());
      }
    } catch (error) {
      showMessage(errorBox, friendlyError(error));
      submit.disabled = false;
      submit.textContent = 'Join the room ↗';
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

  async function loadRoomProfiles() {
    const [{ data: profiles, error }, { data: socialLinks, error: socialError }] = await Promise.all([
      client.from('profiles')
        .select('user_id,display_name,bio,interests,tools_used,tools_curious,looking_for,updated_at')
        .eq('room_id', activeRoom.id)
        .order('updated_at', { ascending: false }),
      client.from('profile_social_links')
        .select('user_id,x_url,linkedin_url,share_with_room')
        .eq('room_id', activeRoom.id)
    ]);
    if (error) throw error;
    if (socialError) throw socialError;
    const linksByUser = Object.fromEntries((socialLinks || []).map((link) => [link.user_id, link]));
    return (profiles || []).map((profile) => ({ ...profile, social_links: linksByUser[profile.user_id] || null }));
  }

  function scheduleBoardRefresh(yourName) {
    if (refreshTimer) clearTimeout(refreshTimer);
    // Stagger refreshes across clients so a crowd joining together doesn't create a request spike.
    refreshTimer = setTimeout(async () => {
      if (!modal.classList.contains('open') || !activeRoom) return;
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
      <div class="mono modal-kicker">${client ? 'BUILDER COMMUNITY · LIVE ROOM' : 'BUILDER COMMUNITY · LOCAL PREVIEW'}</div>
      <h2 id="modal-title">Your people are in here, ${escapeHtml(yourName)}.</h2>
      <p>Meet builders through shared interests, tools, and goals. Matches are based on profile tags, not location tracking.</p>
      <div class="room-code" id="room-count">${escapeHtml(activeRoom.code)} · ${profiles.length} ${profiles.length === 1 ? 'HUMAN' : 'HUMANS'}</div>
      <div class="my-builder-tags">${[...myTools.map((tool) => `🛠 ${tool}`), ...myInterests].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="discover-heading"><div><div class="mono">YOUR MATCHES</div><p>Shared signals show why someone may be a good person to meet.</p></div><button type="button" class="edit-profile" id="edit-builder">Edit profile</button></div><label class="match-search"><span class="sr-only">Search builders</span><input id="builder-search" type="search" placeholder="Search people, tools, or interests" autocomplete="off"></label><div class="error" id="discover-error"></div>
      <div class="member-list">${cards || '<p class="fine">You’re first in this room. Share the invite link and let other builders join.</p>'}</div>
      <p class="fine">${client ? 'Profiles refresh as people join. Social links appear only when someone chooses to share them with this room.' : 'Local preview only: profiles and matches stay in this browser.'}</p>
      <button class="button button-lime" id="share-room">Copy room invite link ↗</button>
      ${returnRoom && returnRoom.id !== activeRoom.id ? '<button class="button button-lime" id="back-event">Back to the main event room</button>' : ''}
      <button class="edit-profile" id="start-game">Optional: play the room voice game 🎙️</button>
      <button class="button button-lime" id="done">Back to the vibe ↗</button></div>`;
    bindClose();
    content.querySelector('#edit-builder').addEventListener('click', () => showProfileSetup(activeRoom.code, activeProfile));
    content.querySelector('#share-room').addEventListener('click', copyRoomInvite);
    content.querySelector('#builder-search').addEventListener('input', (event) => {
      const term = event.currentTarget.value.trim().toLowerCase();
      content.querySelectorAll('.match-card').forEach((card) => { card.hidden = !card.dataset.search.includes(term); });
    });
    content.querySelector('#back-event')?.addEventListener('click', async () => {
      activeRoom = returnRoom;
      returnRoom = null;
      await showRoomBoard(yourName);
    });
    content.querySelectorAll('[data-mini-game]').forEach((button) => button.addEventListener('click', () => {
      const match = profiles.find((profile) => profile.user_id === button.dataset.miniGame);
      if (match) createMiniGameRoom(match, button);
    }));
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
      const socials = profile.social_links?.share_with_room ? profile.social_links : null;
      const xUrl = socials && safeSocialHref(socials.x_url, 'x');
      const linkedinUrl = socials && safeSocialHref(socials.linkedin_url, 'linkedin');
      const reasons = [
        ...match.sharedTools.map((tool) => `🛠 ${tool}`),
        ...match.sharedInterests.map((interest) => `✳ ${interest}`),
        ...match.sharedGoals.map((goal) => `🤝 ${goal}`)
      ];
      const fit = match.score ? `${reasons.length} SHARED SIGNAL${reasons.length === 1 ? '' : 'S'}` : 'IN YOUR ROOM';
      const socialMarkup = [xUrl ? `<a href="${escapeHtml(xUrl)}" target="_blank" rel="noopener noreferrer">X ↗</a>` : '', linkedinUrl ? `<a href="${escapeHtml(linkedinUrl)}" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a>` : ''].filter(Boolean).join('');
      const searchable = [profile.display_name || profile.name, profile.bio, ...tools, ...interests, ...asTags(profile.looking_for)].join(' ').toLowerCase();
      return `<article class="member-card match-card" data-search="${escapeHtml(searchable)}">
        <div class="member-avatar">✦</div>
        <div class="member-info"><div class="match-fit">${fit}</div><div class="member-name">${escapeHtml(profile.display_name || profile.name)}</div>
        <div class="member-bio">${escapeHtml(profile.bio)}</div>
        ${reasons.length ? `<div class="match-reasons">${reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>` : ''}
        <div class="taglist">${[...tools.map((tool) => `🛠 ${tool}`), ...interests].map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
        ${asTags(profile.looking_for).length ? `<div class="looking-for">HOPING TO MEET: ${asTags(profile.looking_for).map(escapeHtml).join(' · ')}</div>` : ''}
        ${socialMarkup ? `<div class="social-links">${socialMarkup}</div>` : ''}
        ${client && profile.user_id !== activeProfile?.user_id ? `<button type="button" class="match-game-button" data-mini-game="${escapeHtml(profile.user_id)}">Start a game room together ↗</button>` : ''}</div>
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

  async function copyRoomInvite(event) {
    const invite = new URL(location.href);
    invite.searchParams.set('room', activeRoom.code);
    invite.hash = 'join';
    try {
      await navigator.clipboard.writeText(invite.toString());
      event.currentTarget.textContent = 'Invite link copied ✓';
    } catch {
      event.currentTarget.textContent = `Room code: ${activeRoom.code}`;
    }
  }

  async function createMiniGameRoom(match, button) {
    const eventRoom = activeRoom;
    const profile = activeProfile;
    if (!client || !profile) return;
    button.disabled = true;
    button.textContent = 'Making your game room…';
    try {
      await ensureAnonymousUser();
      const roomName = `${profile.name} + ${match.display_name} game`.slice(0, 60);
      const { data: created, error: createError } = await client.rpc('create_room', { p_name: roomName });
      if (createError) throw createError;
      const gameRoom = created?.[0];
      if (!gameRoom) throw new Error('Could not create the mini-room. Try again.');
      const { data: joined, error: joinError } = await client.rpc('join_room', { p_code: gameRoom.code });
      if (joinError) throw joinError;
      const memberRoom = joined?.[0];
      if (!memberRoom) throw new Error('The game room was created, but could not be joined.');
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      const { error: profileError } = await client.from('profiles').upsert({
        room_id: memberRoom.id,
        user_id: userData.user.id,
        display_name: profile.name,
        bio: profile.bio,
        interests: profile.interests || [],
        tools_used: profile.tools_used || [],
        tools_curious: profile.tools_curious || [],
        looking_for: profile.looking_for || [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'room_id,user_id' });
      if (profileError) throw profileError;
      activeRoom = memberRoom;
      await saveProfileSocialLinks({ ...profile, share_with_room: false }, userData.user.id);
      activeRoom = eventRoom;
      const invite = new URL(location.href);
      invite.searchParams.set('room', gameRoom.code);
      invite.hash = 'join';
      showMiniGameInvite(gameRoom, invite.toString(), match, eventRoom);
    } catch (error) {
      activeRoom = eventRoom;
      button.disabled = false;
      button.textContent = 'Start a game room together ↗';
      const message = content.querySelector('#discover-error');
      if (message) message.textContent = friendlyError(error);
    }
  }

  function showMiniGameInvite(room, inviteUrl, match, eventRoom) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button><div class="joined"><div class="big-emoji">🎮</div><div class="mono modal-kicker">YOUR MINI COMMUNITY IS READY</div><h2 id="modal-title">A room for ${escapeHtml(match.display_name || 'your match')} and you.</h2><p>Share the invite link. They can join this room, then you can play the voice game together.</p><div class="room-code host-code">${escapeHtml(room.code)}</div><button class="button button-lime" id="copy-mini-invite">Copy game invite link ↗</button><button class="button button-lime" id="open-mini-room">Open the mini-room</button><button class="edit-profile" id="return-to-discovery">Back to builder matches</button></div>`;
    bindClose();
    content.querySelector('#copy-mini-invite').addEventListener('click', async (event) => {
      try { await navigator.clipboard.writeText(inviteUrl); event.currentTarget.textContent = 'Game link copied ✓'; }
      catch { event.currentTarget.textContent = `Room code: ${room.code}`; }
    });
    content.querySelector('#open-mini-room').addEventListener('click', async () => {
      returnRoom = eventRoom;
      activeRoom = room;
      await showRoomBoard(activeProfile.name);
    });
    content.querySelector('#return-to-discovery').addEventListener('click', async () => {
      activeRoom = eventRoom;
      await showRoomBoard(activeProfile.name);
    });
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
      try { gameVotes.own = JSON.parse(localStorage.getItem(`sidequest-votes-${activeRoom.code}`) || '{}'); } catch { gameVotes.own = {}; }
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
      } else localStorage.setItem(`sidequest-votes-${activeRoom.code}`, JSON.stringify(gameVotes.own));
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
    list.innerHTML = profileCards(yourName, profiles) || '<p class="fine">You’re the first one here. Invite someone in!</p>';
    count.textContent = `${activeRoom.code} · ${profiles.length} ${profiles.length === 1 ? 'HUMAN' : 'HUMANS'}`;
  }

  function showMessage(error, message) { error.textContent = message; }

  function friendlyError(error) {
    const message = error?.message || 'Something went wrong. Try again.';
    if (/anonymous_provider_disabled/i.test(message)) return 'Anonymous sign-in is off in this Supabase project. Turn on “Allow anonymous sign-ins” in Auth settings, then try again.';
    if (/Invalid API key|Failed to fetch|NetworkError/i.test(message)) return 'Could not reach Supabase. Check the project URL and publishable key in supabase-config.js.';
    if (/Room creation limit reached/i.test(message)) return 'You have made three rooms in the last hour. Try again later.';
    if (/Room code not found|room code/i.test(message)) return 'That room code didn’t work. Check the big screen and try again.';
    if (/function .*create_room|function .*join_room|schema cache/i.test(message)) return 'The SideQuest database setup is not installed yet. Run supabase/schema.sql in the project SQL editor.';
    return message;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }
})();
