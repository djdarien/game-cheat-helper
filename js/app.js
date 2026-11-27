import { askGuide, CHAT_MODELS, clearHistory, clearKey, loadHistory, loadSettings, mapGenieHostOk, probeServer, saveHistory, saveSettings } from './chat.js';
import { newCustomId, prepareCatalog, profileFromCatalog, profileFromCustom, rankGames, shouldAutoPick } from './resolve.js';
import { esc, normalize, renderMarkdown, safeUrl } from './util.js';

const VIEWS = [
  { id: 'map', label: 'Map' },
  { id: 'guides', label: 'Guides' },
  { id: 'tips', label: 'Tips' },
  { id: 'deals', label: 'Deals' },
  { id: 'chat', label: 'Chat' }
];

const state = {
  catalog: [],
  server: { available: false, configured: false },
  settings: loadSettings(),
  game: null,
  view: 'home',
  missing: false,
  suggest: [],
  suggestIndex: -1,
  suggestOpen: false,
  selectedUrl: '',
  guideFilter: '',
  pendingImage: '',
  sending: false,
  shownGameId: ''
};

const RECENT_KEY = 'gch-recent';
const CUSTOM_KEY = 'gch-custom';
const OVERRIDE_KEY = 'gch-overrides';

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function loadRecent() {
  const items = readJson(RECENT_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && item.id && item.name && (item.kind === 'g' || item.kind === 'c')) : [];
}

function loadCustom() {
  const items = readJson(CUSTOM_KEY, []);
  return Array.isArray(items) ? items.filter((item) => item && item.id && item.name) : [];
}

function loadOverrides() {
  const value = readJson(OVERRIDE_KEY, {});
  return value && typeof value === 'object' ? value : {};
}

function remember(game) {
  const recent = loadRecent().filter((item) => !(item.kind === game.kind && item.id === game.id));
  recent.unshift({ kind: game.kind, id: game.id, name: game.name });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
}

function saveCustom(entry) {
  const all = loadCustom().filter((item) => item.id !== entry.id);
  all.unshift(entry);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(all.slice(0, 40)));
}

function gameHref(view, game = state.game) {
  if (!game) return view === 'home' ? '#/' : `#/${view}`;
  return `#/${game.kind}/${encodeURIComponent(game.id)}/${view}`;
}

function resolveRoute(kind, id) {
  if (kind === 'g') {
    const game = state.catalog.find((item) => item.slug === id);
    return game ? profileFromCatalog(game, loadOverrides()[id]) : null;
  }
  const custom = loadCustom().find((item) => item.id === id);
  return custom ? profileFromCustom(custom) : null;
}

function openCatalog(game, view) {
  const profile = profileFromCatalog(game, loadOverrides()[game.slug]);
  const next = view || (state.view === 'home' || state.view === 'chat' ? 'map' : state.view);
  location.hash = gameHref(next === 'home' ? 'map' : next, profile);
  closeSuggest();
  const input = document.getElementById('gameSearch');
  if (input) input.value = '';
}

function openCustom(name, mapgenieUrl = '', view = 'guides') {
  const entry = { id: newCustomId(name), name: name.trim(), mapgenieUrl };
  saveCustom(entry);
  const profile = profileFromCustom(entry);
  location.hash = gameHref(mapgenieUrl ? 'map' : view, profile);
  closeSuggest();
  const input = document.getElementById('gameSearch');
  if (input) input.value = '';
}

function closeSuggest() {
  state.suggestOpen = false;
  state.suggestIndex = -1;
  const box = document.getElementById('suggest');
  if (box) box.hidden = true;
}

function renderSuggest() {
  const box = document.getElementById('suggest');
  const input = document.getElementById('gameSearch');
  if (!box || !input) return;
  const query = input.value.trim();
  if (!query || !state.suggestOpen) {
    box.hidden = true;
    return;
  }
  state.suggest = rankGames(state.catalog, query);
  const maxIndex = state.suggest.length;
  if (state.suggestIndex > maxIndex) state.suggestIndex = maxIndex;
  const rows = state.suggest.map((row, index) => {
    const maps = row.game.maps?.length || 0;
    const guides = row.game.guides?.length || 0;
    const meta = [
      maps ? `${maps} map${maps === 1 ? '' : 's'}` : 'No map yet',
      guides ? `${guides} guide${guides === 1 ? '' : 's'}` : ''
    ].filter(Boolean).join(' · ');
    return `<button type="button" class="suggest-row${index === state.suggestIndex ? ' active' : ''}" data-action="pick-catalog" data-slug="${esc(row.game.slug)}">
      <span>${esc(row.game.name)}</span><small>${esc(meta)}</small>
    </button>`;
  }).join('');
  const any = `<button type="button" class="suggest-row any${state.suggestIndex === maxIndex ? ' active' : ''}" data-action="pick-typed">
    <span>Use “${esc(query)}”</span><small>Works for any game. Add a Map Genie link later if you want.</small>
  </button>`;
  box.innerHTML = rows + any;
  box.hidden = false;
}

function safeImage(url) {
  const safe = safeUrl(url);
  if (!safe) return '';
  try {
    const host = new URL(safe).hostname;
    if (host === 'mapgenie.io' || host.endsWith('.mapgenie.io')) return safe;
  } catch {
    return '';
  }
  return '';
}

function navHtml() {
  const homeCurrent = state.view === 'home';
  const side = [`<a class="nav-link${homeCurrent ? ' current' : ''}" href="#/" ${homeCurrent ? 'aria-current="page"' : ''}>Home</a>`]
    .concat(VIEWS.map((view) => {
      const current = state.view === view.id;
      return `<a class="nav-link${current ? ' current' : ''}" href="${gameHref(view.id)}" ${current ? 'aria-current="page"' : ''}>${view.label}</a>`;
    })).join('');
  const tabs = [{ id: 'home', label: 'Home', href: '#/' }].concat(VIEWS.map((view) => ({
    id: view.id,
    label: view.label,
    href: gameHref(view.id)
  }))).map((view) => {
    const current = state.view === view.id;
    return `<a href="${view.href}" class="${current ? 'current' : ''}" ${current ? 'aria-current="page"' : ''}>${view.label}</a>`;
  }).join('');
  return { side, tabs };
}

function contextHtml() {
  if (!state.game || state.view === 'home') return '';
  const image = safeImage(state.game.image);
  const maps = state.game.maps.length;
  const guides = state.game.mapGuides.length;
  return `<div class="context">
    ${image ? `<img src="${image}" alt="">` : '<div class="context-mark" aria-hidden="true">▶</div>'}
    <div class="context-copy">
      <strong>${esc(state.game.name)}</strong>
      <span>${maps ? `${maps} Map Genie map${maps === 1 ? '' : 's'}` : 'No Map Genie map yet'} · ${guides} in-app guide${guides === 1 ? '' : 's'}</span>
    </div>
    <a class="btn btn-small" href="${gameHref('chat')}">Ask</a>
  </div>`;
}

function emptyGame(title, copy) {
  return `<section class="panel empty">
    <h2>${esc(title)}</h2>
    <p>${esc(copy)}</p>
    <a class="btn" href="#/">Find a game</a>
  </section>`;
}

function linkCards(items, action) {
  if (!items.length) return '<p class="fine">Nothing listed for this game yet.</p>';
  return `<div class="cards">${items.map((item) => {
    const url = safeUrl(item.url);
    if (!url) return '';
    return `<article class="card">
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.note || 'Opens the guide for this game.')}</p>
      <div class="card-actions">
        <a class="btn btn-small" href="${url}" target="_blank" rel="noopener noreferrer">Open</a>
        ${action ? `<button type="button" class="btn btn-small btn-ghost" data-action="${action}" data-url="${esc(url)}" data-label="${esc(item.name)}">Ask about this</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}

function stageHtml(url, title) {
  const safe = safeUrl(url);
  if (!safe) return '';
  return `<div class="stage">
    <div class="stage-bar">
      <strong>${esc(title)}</strong>
      <a href="${safe}" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>
    <iframe src="${safe}" title="${esc(title)}"></iframe>
    <p class="fine">If this stays blank, the site blocked embedding. Use Open in new tab.</p>
  </div>`;
}

function renderHome() {
  const recent = loadRecent();
  const featured = state.catalog.filter((game) => game.maps?.length).slice(0, 12);
  const recentHtml = recent.length
    ? `<div class="chip-row">${recent.map((item) => `<a class="chip" href="#/${item.kind}/${encodeURIComponent(item.id)}/map">${esc(item.name)}</a>`).join('')}</div>`
    : '<p class="fine">Games you open will show up here.</p>';
  const featuredHtml = featured.map((game) => {
    const image = safeImage(game.image);
    return `<a class="game-tile" href="#/g/${encodeURIComponent(game.slug)}/map">
      ${image ? `<img src="${image}" alt="">` : ''}
      <span>${esc(game.name)}</span>
    </a>`;
  }).join('');
  return `<section class="hero">
      <h1>Pick a game and stay in one place.</h1>
      <p>Search any title. Map Genie maps and guides open in the app. Chat uses your Groq key and the pages loaded for that game.</p>
    </section>
    <section class="panel">
      <h2>Recent</h2>
      ${recentHtml}
    </section>
    <section class="panel">
      <h2>Map Genie picks</h2>
      <div class="game-grid">${featuredHtml}</div>
      <details class="all-games">
        <summary>All ${state.catalog.length} Map Genie games</summary>
        <input id="browseFilter" type="search" placeholder="Filter the list" aria-label="Filter all games">
        <div id="browseList" class="browse-list"></div>
      </details>
    </section>
    <section class="panel">
      <h2>Add any game</h2>
      <p class="fine">Use this when the search does not know the game, or when you already have its Map Genie page.</p>
      <form id="addGame" class="stack-form">
        <input name="name" required placeholder="Game name" aria-label="Game name">
        <input name="url" placeholder="https://mapgenie.io/…" aria-label="Map Genie URL">
        <button class="btn" type="submit">Add game</button>
        <p id="addGameError" class="error" hidden></p>
      </form>
    </section>`;
}

function renderMap() {
  if (!state.game) return emptyGame('No game loaded', 'Search up top, then the map opens here.');
  const maps = state.game.maps;
  if (!maps.length && !state.game.mapgenie) {
    return `${contextHtml()}<section class="panel">
      <h2>No Map Genie map yet</h2>
      <p>Guides and chat still work. Paste a Map Genie URL when you have one.</p>
      <form id="pinMap" class="stack-form">
        <input name="url" required placeholder="https://mapgenie.io/…" aria-label="Map Genie URL">
        <button class="btn" type="submit">Pin map</button>
        <p id="pinError" class="error" hidden></p>
      </form>
      <p><a href="https://mapgenie.io/" target="_blank" rel="noopener noreferrer">Browse Map Genie</a></p>
    </section>`;
  }
  const selected = maps.find((item) => item.url === state.selectedUrl) || maps[0];
  const frameUrl = selected?.url || state.game.mapgenie;
  const frameTitle = selected?.name || `${state.game.name} on Map Genie`;
  const list = maps.map((item) => `<button type="button" class="list-btn${item.url === frameUrl ? ' active' : ''}" data-action="select-map" data-url="${esc(item.url)}">${esc(item.name)}</button>`).join('');
  const guideLinks = state.game.mapGuides.slice(0, 12).map((item) => `<button type="button" class="chip" data-action="select-guide" data-url="${esc(item.url)}">${esc(item.name)}</button>`).join('');
  return `${contextHtml()}<section class="split">
    <div class="list-col">
      <h2>Maps</h2>
      ${list || `<a class="list-btn active" href="${esc(safeUrl(state.game.mapgenie))}" target="_blank" rel="noopener noreferrer">Map Genie page</a>`}
      ${guideLinks ? `<h2>On this map</h2><div class="chip-row">${guideLinks}</div>` : ''}
      <details>
        <summary>Pin a different Map Genie URL</summary>
        <form id="pinMap" class="stack-form">
          <input name="url" required placeholder="https://mapgenie.io/…" aria-label="Map Genie URL">
          <button class="btn" type="submit">Save</button>
          <p id="pinError" class="error" hidden></p>
        </form>
      </details>
    </div>
    ${stageHtml(frameUrl, frameTitle)}
  </section>`;
}

function guideItems() {
  const filter = normalize(state.guideFilter);
  const mapGuides = state.game.mapGuides.filter((item) => !filter || normalize(item.name).includes(filter));
  const others = state.game.guides.filter((item) => !filter || normalize(item.name).includes(filter));
  return { mapGuides, others };
}

function renderGuides() {
  if (!state.game) return emptyGame('No game loaded', 'Search up top, then guides for that game open here.');
  const { mapGuides, others } = guideItems();
  const selected = [...state.game.mapGuides, ...state.game.guides].find((item) => item.url === state.selectedUrl);
  const buttons = (items) => items.map((item) => `<button type="button" class="list-btn${item.url === state.selectedUrl ? ' active' : ''}" data-action="select-guide" data-url="${esc(item.url)}">${esc(item.name)}</button>`).join('');
  return `${contextHtml()}<section class="split">
    <div class="list-col">
      <h2>Guides</h2>
      <input id="guideFilter" type="search" placeholder="Filter guides" value="${esc(state.guideFilter)}" aria-label="Filter guides">
      ${mapGuides.length ? `<h3>Map Genie</h3><div id="guideList">${buttons(mapGuides)}</div>` : '<p class="fine">Map Genie has no guide pages for this game.</p>'}
      <h3>More guides</h3>
      <div id="otherGuides">${buttons(others) || '<p class="fine">No matches.</p>'}</div>
    </div>
    <div>
      ${selected ? stageHtml(selected.url, selected.name) : '<section class="panel empty"><h2>Choose a guide</h2><p>Map Genie checklists and the usual wikis are listed on the left. Ask sends that page to chat.</p></section>'}
      ${selected ? `<button type="button" class="btn" data-action="ask-link" data-url="${esc(selected.url)}" data-label="${esc(selected.name)}">Ask about this guide</button>` : ''}
    </div>
  </section>`;
}

function renderTips() {
  if (!state.game) return emptyGame('No game loaded', 'Search up top for codes and strategies.');
  return `${contextHtml()}<section class="panel">
    <h2>Tips and codes</h2>
    <p class="fine">Published codes and single-player strategies. This is not a multiplayer cheat tool.</p>
    ${linkCards(state.game.tips, 'ask-link')}
    <div class="chip-row">
      <button type="button" class="chip" data-action="ask-text" data-text="Give me a strong early-game plan.">Early game</button>
      <button type="button" class="chip" data-action="ask-text" data-text="What are the published codes or console commands, if any?">Codes</button>
      <button type="button" class="chip" data-action="ask-text" data-text="How do I beat the next boss?">Boss</button>
    </div>
  </section>`;
}

function renderDeals() {
  if (!state.game) return emptyGame('No game loaded', 'Search up top, then compare store listings.');
  return `${contextHtml()}<section class="panel">
    <h2>Prices for ${esc(state.game.name)}</h2>
    <p class="fine">Each card searches that store. Prices move, and marketplace sellers need a rating check.</p>
    ${linkCards(state.game.deals)}
  </section>`;
}

function renderChat() {
  const ready = state.server.configured || state.settings.groqKey;
  const banner = ready
    ? ''
    : `<div class="banner">Add a Groq API key to chat. Maps and guides still work without it. <button type="button" class="btn btn-small" data-action="open-settings">Add key</button></div>`;
  const mode = state.settings.mode === 'fast'
    ? 'Fast answers from the loaded pages.'
    : (state.settings.liveLookup ? 'Live guide lookup is on. Answers can take a few seconds.' : 'Live guide lookup is off. Answers use the loaded pages.');
  return `${contextHtml()}<section class="chat-panel">
    ${banner}
    <div id="chatLog" class="chat-log" aria-live="polite"></div>
    <div class="chip-row">
      <button type="button" class="chip" data-action="ask-text" data-text="Where should I go next?">Where next?</button>
      <button type="button" class="chip" data-action="ask-text" data-text="I am stuck. Ask me one question, then tell me the next step.">I'm stuck</button>
      <button type="button" class="chip" data-action="ask-text" data-text="List the collectibles I should grab in this area.">Collectibles</button>
      <button type="button" class="btn btn-small btn-ghost" data-action="clear-chat">Clear chat</button>
    </div>
    <p class="fine">${esc(mode)}</p>
    ${state.pendingImage ? '<p class="fine" id="shotReady">Screenshot attached. It will send with your next message.</p>' : ''}
    <form id="composer" class="composer">
      <input id="chatInput" type="text" placeholder="${state.game ? `Ask about ${esc(state.game.name)}` : 'Ask about your game'}" autocomplete="off">
      <button type="button" class="btn btn-ghost" data-action="pick-shot">Shot</button>
      <button class="btn" type="submit" ${state.sending ? 'disabled' : ''}>Send</button>
    </form>
  </section>`;
}

function fillBrowse() {
  const list = document.getElementById('browseList');
  const filter = document.getElementById('browseFilter');
  if (!list) return;
  const q = normalize(filter?.value || '');
  const games = state.catalog.filter((game) => !q || normalize(game.name).includes(q) || game.slug.includes(q.replace(/ /g, '-')) || (game.aliases || []).some((alias) => normalize(alias).includes(q)));
  list.innerHTML = games.map((game) => `<a href="#/g/${encodeURIComponent(game.slug)}/map">${esc(game.name)}</a>`).join('') || '<p class="fine">No games match.</p>';
}

function fillChat() {
  const log = document.getElementById('chatLog');
  if (!log) return;
  const history = loadHistory(state.game?.id || 'none');
  log.replaceChildren();
  if (!history.length) {
    const intro = document.createElement('div');
    intro.className = 'bubble assistant';
    intro.textContent = state.game
      ? `${state.game.name} is loaded. Ask where to go, or attach a screenshot.`
      : 'Pick a game so answers can use its maps and guides. You can still ask a general question.';
    log.append(intro);
  }
  for (const message of history) {
    const bubble = document.createElement('div');
    bubble.className = `bubble ${message.role === 'user' ? 'user' : 'assistant'}`;
    if (message.role === 'assistant') bubble.innerHTML = renderMarkdown(message.content);
    else bubble.textContent = message.content;
    log.append(bubble);
  }
  if (state.sending) {
    const pending = document.createElement('div');
    pending.className = 'bubble assistant';
    const live = state.settings.liveLookup && state.settings.mode !== 'fast' && !state.pendingImage;
    pending.textContent = live ? 'Looking through guides…' : 'Thinking…';
    log.append(pending);
  }
  log.scrollTop = log.scrollHeight;
}

function render() {
  if (state.game?.id !== state.shownGameId) {
    state.shownGameId = state.game?.id || '';
    state.selectedUrl = state.game?.maps?.[0]?.url || '';
    state.guideFilter = '';
  }
  const view = document.getElementById('view');
  const pages = {
    home: renderHome,
    map: renderMap,
    guides: renderGuides,
    tips: renderTips,
    deals: renderDeals,
    chat: renderChat
  };
  if (state.missing) {
    view.innerHTML = emptyGame('Game not found', 'That link is not in this browser’s games. Search for it again.');
  } else {
    view.innerHTML = (pages[state.view] || renderHome)();
  }
  const nav = navHtml();
  document.getElementById('sidenav').innerHTML = nav.side;
  document.getElementById('tabbar').innerHTML = nav.tabs;
  document.title = state.game ? `${state.game.name} · Game Cheat` : 'Game Cheat';
  if (state.view === 'home') fillBrowse();
  if (state.view === 'chat') fillChat();
  const keyState = document.getElementById('keyState');
  if (keyState) {
    keyState.textContent = state.server.configured
      ? 'This site has a server Groq key. You can leave the box empty.'
      : (state.settings.groqKey ? 'A key is saved in this browser.' : 'No key saved yet.');
  }
}

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  state.missing = false;
  state.game = null;
  state.view = 'home';
  if (parts[0] === 'g' || parts[0] === 'c') {
    let id = parts[1] || '';
    try { id = decodeURIComponent(id); } catch { /* keep the raw segment */ }
    const view = VIEWS.some((item) => item.id === parts[2]) ? parts[2] : 'map';
    state.game = resolveRoute(parts[0], id);
    state.view = view;
    state.missing = !state.game;
    if (state.game) remember(state.game);
  } else if (VIEWS.some((item) => item.id === parts[0]) || parts[0] === 'home') {
    state.view = parts[0] === 'home' ? 'home' : parts[0];
  }
  render();
  const raw = sessionStorage.getItem('gch-prefill');
  if (!raw || state.view !== 'chat') return;
  sessionStorage.removeItem('gch-prefill');
  let prefill = null;
  try { prefill = JSON.parse(raw); } catch { prefill = null; }
  if (!prefill?.text) return;
  const input = document.getElementById('chatInput');
  if (input) input.value = prefill.text;
  if (prefill.send) sendChat(prefill.text);
  else input?.focus();
}

function pinMap(url) {
  const safe = mapGenieHostOk(url);
  const error = document.getElementById('pinError') || document.getElementById('addGameError');
  if (!safe) {
    if (error) {
      error.hidden = false;
      error.textContent = 'Use a mapgenie.io link.';
    }
    return;
  }
  if (!state.game || state.game.kind === 'c') {
    return;
  }
  const overrides = loadOverrides();
  const maps = /\/maps\//.test(safe) ? [{ name: 'Interactive map', url: safe }] : (overrides[state.game.id]?.maps || []);
  let hub = safe;
  try {
    const slug = new URL(safe).pathname.split('/').filter(Boolean)[0];
    if (slug) hub = `https://mapgenie.io/${slug}`;
  } catch { /* keep safe */ }
  overrides[state.game.id] = { mapgenie: hub, maps };
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  state.shownGameId = '';
  route();
}

async function sendChat(text) {
  const trimmed = String(text || '').trim();
  const image = state.pendingImage;
  if ((!trimmed && !image) || state.sending) return;
  const gameId = state.game?.id || 'none';
  const history = loadHistory(gameId);
  const userText = trimmed || 'What should I do in this screenshot?';
  history.push({ role: 'user', content: image ? `${userText} (screenshot attached)` : userText });
  saveHistory(gameId, history);
  state.pendingImage = '';
  state.sending = true;
  render();
  try {
    const answer = await askGuide({
      settings: state.settings,
      server: state.server,
      game: state.game,
      history: history.slice(0, -1),
      text: userText,
      imageDataUrl: image
    });
    history.push({ role: 'assistant', content: answer });
  } catch (err) {
    history.push({ role: 'assistant', content: err.message || 'Chat failed.' });
  }
  saveHistory(gameId, history);
  state.sending = false;
  if (state.view === 'chat') {
    render();
    document.getElementById('chatInput')?.focus();
  }
}

function askAbout(label, url) {
  const text = url
    ? `Help me with ${label}. Use this page: ${url}`
    : label;
  const dest = gameHref('chat');
  if (location.hash === dest) {
    const input = document.getElementById('chatInput');
    if (input) input.value = text;
    input?.focus();
    return;
  }
  sessionStorage.setItem('gch-prefill', JSON.stringify({ text, send: false }));
  location.hash = dest;
}

async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const max = 1280;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.82);
}

function openSettings() {
  const dialog = document.getElementById('settings');
  document.getElementById('liveLookup').checked = state.settings.liveLookup;
  document.getElementById('guideMode').value = state.settings.mode;
  const modelSelect = document.getElementById('modelSelect');
  modelSelect.innerHTML = CHAT_MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join('');
  modelSelect.value = state.settings.model;
  document.getElementById('groqKey').value = '';
  const serverLine = document.getElementById('serverState');
  serverLine.textContent = state.server.configured
    ? 'A Groq key is set on the server. Chat works without pasting one here.'
    : 'No server key detected. Paste your Groq key for this browser.';
  dialog.showModal();
}

function bind() {
  document.getElementById('searchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = document.getElementById('gameSearch').value.trim();
    if (!query) return;
    const ranked = rankGames(state.catalog, query);
    if (state.suggestOpen && state.suggestIndex === state.suggest.length) {
      openCustom(query);
      return;
    }
    const highlighted = state.suggestOpen && state.suggestIndex >= 0 && state.suggestIndex < state.suggest.length
      ? state.suggest[state.suggestIndex]
      : null;
    if (highlighted) {
      openCatalog(highlighted.game);
      return;
    }
    if (shouldAutoPick(ranked) || (ranked[0] && ranked[0].score >= 88 && (!ranked[1] || ranked[0].score > ranked[1].score))) {
      openCatalog(ranked[0].game);
      return;
    }
    if (ranked.length) {
      state.suggestOpen = true;
      state.suggestIndex = 0;
      renderSuggest();
      return;
    }
    openCustom(query);
  });

  document.getElementById('gameSearch').addEventListener('input', () => {
    state.suggestOpen = true;
    state.suggestIndex = -1;
    renderSuggest();
  });
  document.getElementById('gameSearch').addEventListener('focus', () => {
    state.suggestOpen = true;
    renderSuggest();
  });
  document.getElementById('gameSearch').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      state.suggestIndex = Math.min(state.suggest.length, state.suggestIndex + 1);
      renderSuggest();
      event.preventDefault();
    } else if (event.key === 'ArrowUp') {
      state.suggestIndex = Math.max(-1, state.suggestIndex - 1);
      renderSuggest();
      event.preventDefault();
    } else if (event.key === 'Escape') {
      closeSuggest();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search')) closeSuggest();
  });

  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'pick-catalog') {
      const game = state.catalog.find((item) => item.slug === target.dataset.slug);
      if (game) openCatalog(game);
    } else if (action === 'pick-typed') {
      const query = document.getElementById('gameSearch').value.trim();
      if (query) openCustom(query);
    } else if (action === 'select-map' || action === 'select-guide') {
      state.selectedUrl = target.dataset.url || '';
      if (action === 'select-guide' && state.view !== 'guides') {
        location.hash = gameHref('guides');
        return;
      }
      render();
    } else if (action === 'ask-link') {
      askAbout(target.dataset.label || 'this page', target.dataset.url || '');
    } else if (action === 'ask-text') {
      askAbout(target.dataset.text || '', '');
    } else if (action === 'open-settings') {
      openSettings();
    } else if (action === 'clear-chat') {
      clearHistory(state.game?.id || 'none');
      render();
    } else if (action === 'pick-shot') {
      document.getElementById('shotInput').click();
    } else if (action === 'clear-key') {
      state.settings = clearKey();
      render();
    }
  });

  document.body.addEventListener('input', (event) => {
    if (event.target.id === 'browseFilter') fillBrowse();
    if (event.target.id === 'guideFilter') {
      state.guideFilter = event.target.value;
      const guideList = document.getElementById('guideList');
      const otherGuides = document.getElementById('otherGuides');
      const { mapGuides, others } = guideItems();
      const buttons = (items) => items.map((item) => `<button type="button" class="list-btn${item.url === state.selectedUrl ? ' active' : ''}" data-action="select-guide" data-url="${esc(item.url)}">${esc(item.name)}</button>`).join('');
      if (guideList) guideList.innerHTML = buttons(mapGuides);
      if (otherGuides) otherGuides.innerHTML = buttons(others) || '<p class="fine">No matches.</p>';
    }
  });

  document.body.addEventListener('submit', (event) => {
    if (event.target.id === 'addGame') {
      event.preventDefault();
      const data = new FormData(event.target);
      const name = String(data.get('name') || '').trim();
      const url = String(data.get('url') || '').trim();
      if (!name) return;
      if (url && !mapGenieHostOk(url)) {
        const error = document.getElementById('addGameError');
        error.hidden = false;
        error.textContent = 'The map link has to be a mapgenie.io URL. You can leave it blank.';
        return;
      }
      openCustom(name, url ? mapGenieHostOk(url) : '');
    } else if (event.target.id === 'pinMap') {
      event.preventDefault();
      const url = String(new FormData(event.target).get('url') || '');
      const safe = mapGenieHostOk(url);
      if (!safe) {
        const error = document.getElementById('pinError');
        error.hidden = false;
        error.textContent = 'Use a mapgenie.io link.';
        return;
      }
      if (state.game?.kind === 'c') {
        const all = loadCustom();
        const entry = all.find((item) => item.id === state.game.id);
        if (entry) {
          entry.mapgenieUrl = safe;
          localStorage.setItem(CUSTOM_KEY, JSON.stringify(all));
        }
        state.shownGameId = '';
        route();
        return;
      }
      pinMap(safe);
    } else if (event.target.id === 'composer') {
      event.preventDefault();
      const input = document.getElementById('chatInput');
      const text = input.value;
      input.value = '';
      sendChat(text);
    } else if (event.target.id === 'settingsForm') {
      event.preventDefault();
      const key = document.getElementById('groqKey').value.trim();
      const next = {
        liveLookup: document.getElementById('liveLookup').checked,
        mode: document.getElementById('guideMode').value,
        model: document.getElementById('modelSelect').value
      };
      if (key) next.groqKey = key;
      state.settings = saveSettings(next);
      document.getElementById('groqKey').value = '';
      document.getElementById('settings').close();
      render();
    }
  });

  document.getElementById('shotInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 12 * 1024 * 1024) {
      window.alert('Use a screenshot under 12 MB.');
      return;
    }
    state.pendingImage = await shrinkImage(file);
    if (state.view === 'chat') render();
  });

  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settings').close());

  document.addEventListener('keydown', (event) => {
    const typing = ['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable;
    if (event.key === '/' && !typing) {
      event.preventDefault();
      document.getElementById('gameSearch').focus();
    }
  });

  window.addEventListener('hashchange', route);

  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    const button = document.getElementById('installBtn');
    button.hidden = false;
    button.onclick = async () => {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      button.hidden = true;
    };
  });
}

async function boot() {
  bind();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
  state.server = await probeServer();
  try {
    const res = await fetch('/data/games.json');
    if (!res.ok) throw new Error('missing catalog');
    const data = await res.json();
    state.catalog = prepareCatalog(data.games || []);
  } catch {
    state.catalog = [];
    document.getElementById('view').innerHTML = '<section class="panel empty"><h2>Game list failed to load</h2><p>Refresh the page. You can still add a game once the list loads.</p></section>';
    return;
  }
  route();
}

try {
  await boot();
} catch (err) {
  const view = document.getElementById('view');
  if (view) view.textContent = err && err.stack ? err.stack : String(err);
}
