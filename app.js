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
  let activeRoom = null;
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

  function showProfileSetup(roomCode = null) {
    const draft = readDraft() || {};
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="mono modal-kicker">FIRST, A LITTLE INTRO ✳</div>
      <h2 id="modal-title">Make your<br>very-you profile.</h2>
      <p>Say it like you’d say it to a new friend. Your intro stays on this device until you join the room.</p>
      <form id="profile-form">
        <label class="field"><span>WHAT SHOULD WE CALL YOU?</span><input id="profile-name" maxlength="32" placeholder="Name or nickname" autocomplete="nickname" required value="${escapeHtml(draft.name || '')}" /></label>
        <label class="field"><span>YOUR INTRO</span><textarea id="profile-bio" maxlength="260" placeholder="I’m into… lately I can’t stop thinking about…" required>${escapeHtml(draft.bio || '')}</textarea></label>
        <div class="voice-tip"><span>🎙️</span><div><b>Want to speak it?</b><small>Tap the intro box, activate Wispr Flow, and talk. Flow types your words right here.</small></div></div>
        <label class="field"><span>THINGS YOU’RE INTO <small style="font-weight:400;color:#85899a">(comma separated)</small></span><input id="profile-interests" maxlength="100" placeholder="AI, sci-fi, making things" value="${escapeHtml(draft.interestsText || '')}" /></label>
        <div class="error" id="profile-error"></div>
        <button class="button button-lime" type="submit">Next: enter the room ↗</button>
        <p class="fine">No email or Google login. You choose what to share.</p>
      </form>`;
    bindClose();
    content.querySelector('#profile-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const profile = {
        name: content.querySelector('#profile-name').value.trim(),
        bio: content.querySelector('#profile-bio').value.trim(),
        interestsText: content.querySelector('#profile-interests').value.trim()
      };
      if (!profile.name || !profile.bio) {
        content.querySelector('#profile-error').textContent = 'Add a name and a quick intro to continue.';
        return;
      }
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(profile));
      showRoomEntry(profile, roomCode);
    });
  }

  function showRoomEntry(profile = readDraft() || {}, roomCode = null) {
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="joined"><div class="big-emoji">🪩</div>
      <div class="mono modal-kicker">PROFILE READY · STEP 2 OF 2</div>
      <h2 id="modal-title">Nice to meet you, ${escapeHtml(profile.name || 'friend')}.</h2>
      <p>Your intro is ready. Enter the code on the big screen and we’ll add you to the room.</p>
      <div class="profile-preview"><b>${escapeHtml(profile.name || '')}</b><span>${escapeHtml(profile.bio || '')}</span></div>
      <button class="edit-profile" type="button">← Edit my intro</button>
      <form id="join-form">
        <label class="field"><span>ROOM CODE</span><input id="code" autocomplete="off" placeholder="e.g. FLOW26" maxlength="12" required value="${escapeHtml(roomCode || '')}" /></label>
        <div class="error" id="room-error"></div>
        <button class="button button-lime" type="submit">Join the room ↗</button>
        <p class="fine">Your profile is saved to the shared room after you join.</p>
      </form></div>`;
    bindClose();
    content.querySelector('.edit-profile').addEventListener('click', showProfileSetup);
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
        const interests = profile.interestsText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
        const next = { name: profile.name, bio: profile.bio, interests, at: Date.now() };
        members.push(next);
        localStorage.setItem('sidequest-members', JSON.stringify(members));
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
    const interests = profile.interestsText.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
    const { error } = await client.from('profiles').upsert({
      room_id: activeRoom.id,
      user_id: userData.user.id,
      display_name: profile.name,
      bio: profile.bio,
      interests,
      updated_at: new Date().toISOString()
    }, { onConflict: 'room_id,user_id' });
    if (error) throw error;
    await showRoomBoard(profile.name);
  }

  async function showRoomBoard(yourName, localMembers) {
    let profiles = localMembers;
    if (client) {
      const { data, error } = await client.from('profiles')
        .select('user_id,display_name,bio,interests,updated_at')
        .eq('room_id', activeRoom.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      profiles = data || [];
    }
    renderRoomBoard(yourName, profiles);
    if (client) scheduleBoardRefresh(yourName);
  }

  function scheduleBoardRefresh(yourName) {
    if (refreshTimer) clearTimeout(refreshTimer);
    // Stagger refreshes across clients so a crowd joining together doesn't create a request spike.
    refreshTimer = setTimeout(async () => {
      if (!modal.classList.contains('open') || !activeRoom) return;
      try {
        const { data } = await client.from('profiles')
          .select('user_id,display_name,bio,interests,updated_at')
          .eq('room_id', activeRoom.id)
          .order('updated_at', { ascending: false });
        if (data && modal.classList.contains('open')) updateRoomBoard(yourName, data);
      } finally {
        if (modal.classList.contains('open')) scheduleBoardRefresh(yourName);
      }
    }, 12000 + Math.floor(Math.random() * 6000));
  }

  function renderRoomBoard(yourName, profiles) {
    const cards = profileCards(yourName, profiles);
    content.innerHTML = `<button class="close" aria-label="Close">×</button>
      <div class="joined"><div class="big-emoji">✨</div>
      <div class="mono modal-kicker">${client ? 'LIVE ROOM · SUPABASE' : 'LOCAL PREVIEW'}</div>
      <h2 id="modal-title">You’re on the board, ${escapeHtml(yourName)}.</h2>
      <p>Find someone who shares your interests. Start with the thing you have in common.</p>
      <div class="room-code" id="room-count">${escapeHtml(activeRoom.code)} · ${profiles.length} ${profiles.length === 1 ? 'HUMAN' : 'HUMANS'}</div>
      <div class="member-list">${cards || '<p class="fine">You’re the first one here. Invite someone in!</p>'}</div>
      <p class="fine">${client ? 'Profiles refresh as people join the room.' : 'Local preview only: this browser stores the profiles.'}</p>
      <button class="button button-lime" id="start-game">Start the voice game 🎙️</button>
      <button class="button button-lime" id="done">Back to the vibe ↗</button></div>`;
    bindClose();
    content.querySelector('#start-game').addEventListener('click', () => startGame(yourName));
    content.querySelector('#done').addEventListener('click', closeModal);
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
    content.querySelector('#back-board').addEventListener('click', async () => { const { data } = await client.from('profiles').select('user_id,display_name,bio,interests,updated_at').eq('room_id', activeRoom.id).order('updated_at', { ascending: false }); renderRoomBoard(yourName, data || []); });
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

  function profileCards(yourName, profiles) {
    const cards = profiles.map((profile) => {
      const isSelf = (profile.name || profile.display_name) === yourName;
      const interests = Array.isArray(profile.interests) ? profile.interests : (profile.interests || '').split(',').map((item) => item.trim()).filter(Boolean);
      return `<article class="member-card ${isSelf ? 'is-self' : ''}">
        <div class="member-avatar">${isSelf ? '✳' : '✦'}</div>
        <div class="member-info"><div class="member-name">${escapeHtml(profile.name || profile.display_name)} ${isSelf ? '<span>YOU</span>' : ''}</div>
        <div class="member-bio">${escapeHtml(profile.bio)}</div>
        <div class="taglist">${interests.map((interest) => `<span class="tag">${escapeHtml(interest)}</span>`).join('')}</div></div>
      </article>`;
    }).join('');
    return cards;
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
