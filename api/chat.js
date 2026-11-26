const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b'
]);

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      ok: true,
      provider: 'groq',
      configured: Boolean(process.env.GROQ_API_KEY)
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(503).json({ error: { message: 'GROQ_API_KEY is not set on the server.' } });
    return;
  }

  const body = readBody(req);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
  if (!messages.length || !ALLOWED_MODELS.has(body.model)) {
    res.status(400).json({ error: { message: 'Send a supported model and at least one message.' } });
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
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const text = await upstream.text();
  res.status(upstream.status).setHeader('Content-Type', 'application/json').send(text);
}
