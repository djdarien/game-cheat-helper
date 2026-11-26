import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8787;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
]);

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}

loadEnv(path.join(root, '.env'));

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

async function handleChat(req, res) {
  if (req.method === 'GET') {
    sendJson(res, 200, { ok: true, provider: 'groq', configured: Boolean(process.env.GROQ_API_KEY) });
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: { message: 'Method not allowed' } });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    sendJson(res, 503, { error: { message: 'GROQ_API_KEY is not set on the server.' } });
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let body = {};
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (!messages.length || !ALLOWED_MODELS.has(body.model)) {
    sendJson(res, 400, { error: { message: 'Send a supported model and at least one message.' } });
    return;
  }
  const payload = {
    model: body.model,
    messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
    max_completion_tokens: Math.min(Number(body.max_completion_tokens) || 800, 1600)
  };
  if (body.model === 'openai/gpt-oss-120b' && Array.isArray(body.tools)) {
    payload.tools = body.tools.filter((tool) => tool && tool.type === 'browser_search').slice(0, 1);
    if (payload.tools.length) {
      payload.tool_choice = 'auto';
      payload.reasoning_effort = 'low';
    }
  }
  const upstream = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(text);
}

function insideRoot(full) {
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return full === root || full.startsWith(rootWithSep);
}

function isHidden(full) {
  const rel = path.relative(root, full);
  if (!rel || rel.startsWith('..')) return true;
  return rel.split(path.sep).some((part) => part.startsWith('.'));
}

function fileFor(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = path.resolve(root, relative);
  if (!insideRoot(full) || isHidden(full)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/chat') {
      await handleChat(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: { message: 'Method not allowed' } });
      return;
    }
    const full = fileFor(url.pathname);
    let real = '';
    try {
      if (full) real = fs.realpathSync(full);
    } catch {
      real = '';
    }
    if (!real || !insideRoot(real) || isHidden(real) || !fs.statSync(real).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(real)] || 'application/octet-stream' });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(real).pipe(res);
  } catch (err) {
    sendJson(res, 500, { error: { message: 'Server error' } });
    console.error(err.message);
  }
});

server.listen(port, () => {
  console.log(`Game Cheat Helper at http://127.0.0.1:${port}`);
  console.log(process.env.GROQ_API_KEY ? 'Groq key loaded from .env' : 'No Groq key loaded');
});
