import { safeUrl } from './util.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const GUIDE_MODEL = 'openai/gpt-oss-120b';
export const FAST_MODEL = 'openai/gpt-oss-120b';
export const VISION_MODEL = 'qwen/qwen3.8-27b';
export const CHAT_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B — smartest, live lookup' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B — fastest (needs Groq console enable)' },
  { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B — vision + chat (needs Groq console enable)' }
];

const SETTINGS_KEY = 'gch-settings-v1';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      groqKey: typeof saved.groqKey === 'string' ? saved.groqKey.trim() : '',
      liveLookup: saved.liveLookup !== false,
      mode: saved.mode === 'fast' ? 'fast' : 'guide',
      model: CHAT_MODELS.some((m) => m.id === saved.model) ? saved.model : GUIDE_MODEL
    };
  } catch {
    return { groqKey: '', liveLookup: true, mode: 'guide', model: GUIDE_MODEL };
  }
}

export function saveSettings(next) {
  const current = loadSettings();
  const settings = {
    groqKey: next.groqKey === undefined ? current.groqKey : String(next.groqKey || '').trim(),
    liveLookup: next.liveLookup === undefined ? current.liveLookup : Boolean(next.liveLookup),
    mode: next.mode === 'fast' ? 'fast' : (next.mode === 'guide' ? 'guide' : current.mode),
    model: next.model === undefined ? current.model : (CHAT_MODELS.some((m) => m.id === next.model) ? next.model : current.model)
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

export function clearKey() {
  return saveSettings({ groqKey: '' });
}

export async function probeServer() {
  try {
    const res = await fetch('/api/chat', { headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('application/json')) return { available: false, configured: false };
    const data = await res.json();
    return { available: true, configured: Boolean(data.configured) };
  } catch {
    return { available: false, configured: false };
  }
}

function linkLines(items) {
  if (!items?.length) return '- none listed';
  return items.map((item) => `- ${item.name}: ${item.url}`).join('\n');
}

export function systemPrompt(game) {
  const title = game?.name || 'an unknown game';
  return `You are the guide inside Game Cheat Helper. The player is playing "${title}".

Map Genie hub: ${game?.mapgenie || 'not linked yet'}
Interactive maps:
${linkLines(game?.maps)}

Map Genie guides and checklists:
${linkLines(game?.mapGuides)}

Other guide pages:
${linkLines(game?.guides)}

How to answer:
- Tell the player the next concrete step: where to go, what to look for, and what to do when they get there.
- When a place or collectible is on Map Genie, name that map or guide and include its exact URL from the lists above.
- Use live lookup when you need a detail that is not in the lists. If you still are not sure, say so and point at the best link.
- Spoil only what they asked about.
- Single-player strategies, puzzles, builds, quest steps, and published codes are in scope.
- Do not provide multiplayer cheats, aimbots, wallhacks, trainers, memory editors, or account theft.
- Write short numbered steps in plain language.`;
}

function historyKey(gameId) {
  return `gch-chat:${gameId || 'none'}`;
}

export function loadHistory(gameId) {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey(gameId)) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').slice(-16);
  } catch {
    return [];
  }
}

export function saveHistory(gameId, messages) {
  localStorage.setItem(historyKey(gameId), JSON.stringify(messages.slice(-16)));
}

export function clearHistory(gameId) {
  localStorage.removeItem(historyKey(gameId));
}

function errorText(status, data) {
  const message = data?.error?.message || (typeof data?.error === 'string' ? data.error : '');
  if (status === 401) return 'Groq rejected that API key. Save a new key in Settings.';
  if (status === 403) return 'This Groq key is not allowed to use that model. Text chat can still answer. Screenshot vision needs the vision model turned on in the Groq console.';
  if (status === 429) return 'Groq rate limit reached. Wait a moment and send it again.';
  if (status === 503) return message || 'Chat is not configured on the server yet. Save a Groq API key in Settings.';
  if (message) return String(message).slice(0, 320);
  return `Chat failed (${status}).`;
}

async function postChat(body, { settings, server }) {
  const useServer = server?.available && server?.configured;
  const headers = { 'Content-Type': 'application/json' };
  let url = GROQ_URL;
  if (useServer) {
    url = '/api/chat';
  } else {
    if (!settings.groqKey) {
      const err = new Error('Add a Groq API key in Settings to start chatting.');
      err.code = 'nokey';
      throw err;
    }
    headers.Authorization = `Bearer ${settings.groqKey}`;
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(errorText(res.status, data));
    err.status = res.status;
    throw err;
  }
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) {
    throw new Error('Groq returned an empty answer. Try again, or turn off live guide lookup in Settings.');
  }
  return String(text).trim();
}

export async function askGuide({ settings, server, game, history, text, imageDataUrl }) {
  const live = Boolean(settings.liveLookup) && !imageDataUrl && settings.mode !== 'fast';
  const model = imageDataUrl ? VISION_MODEL : (settings.model || GUIDE_MODEL);
  const prior = history
    .filter((item) => typeof item.content === 'string')
    .slice(-12)
    .map((item) => ({ role: item.role, content: item.content }));

  let userContent = text;
  if (imageDataUrl) {
    const url = imageDataUrl.startsWith('data:image/') ? imageDataUrl : '';
    if (!url) throw new Error('That screenshot could not be read. Try a JPG or PNG.');
    userContent = [
      { type: 'text', text: text || 'This is my screenshot. Where am I, and what should I do next?' },
      { type: 'image_url', image_url: { url } }
    ];
  }

  const messages = [
    { role: 'system', content: systemPrompt(game) },
    ...prior,
    { role: 'user', content: userContent }
  ];

  const body = {
    model,
    messages,
    temperature: 0.3,
    max_completion_tokens: imageDataUrl ? 900 : 1400
  };
  if (live) {
    body.tools = [{ type: 'browser_search' }];
    body.tool_choice = 'auto';
    body.reasoning_effort = 'low';
  }

  try {
    return await postChat(body, { settings, server });
  } catch (err) {
    if (live && err.status === 400) {
      delete body.tools;
      delete body.tool_choice;
      delete body.reasoning_effort;
      const textAnswer = await postChat(body, { settings, server });
      return `${textAnswer}\n\nLive guide lookup was unavailable, so this answer used the loaded Map Genie and guide links only.`;
    }
    throw err;
  }
}

export function trustedImageUrl(value) {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : '';
}

export function mapGenieHostOk(url) {
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
