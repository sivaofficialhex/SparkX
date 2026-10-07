'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
try { for (const l of fs.readFileSync('.env', 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]; } } catch {}
const PORT = process.env.PORT || 3000;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const API = process.env.GEMINI_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GROQ_API = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const PUB = path.join(__dirname, 'public');
const SYSTEM = `You are SparkX, a friendly, smart, calm voice companion. Your replies are spoken aloud.
- Reply in the user's language and style: English, Tamil, Tanglish (Tamil in English letters), or a mix. Mirror them.
- Casual chat: 1-2 short sentences. Educational/technical questions: a clear, useful explanation, still easy to hear.
- Natural and conversational, slightly playful when fitting. Never say "As an AI". No robotic filler.
- Plain spoken text only: no markdown, bullet symbols, headings or code blocks.
- Use the conversation so far (e.g. remember the user's name).`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const hits = new Map();
const limited = ip => { const n = Date.now(), a = (hits.get(ip) || []).filter(t => n - t < 60000); a.push(n); hits.set(ip, a); return a.length > 30; };
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (!v.some(t => n - t < 60000)) hits.delete(k); }, 60000).unref();
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'microphone=(self)', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'" };

async function chat(req, res) {
  let body = '';
  for await (const c of req) { body += c; if (body.length > 64000) return send(res, 413, { error: 'Request too large.' }); }
  let d; try { d = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid JSON.' }); }
  const msg = typeof d.message === 'string' ? d.message.trim() : '';
  if (!msg) return send(res, 400, { error: 'Message is empty.' });
  if (msg.length > 2000) return send(res, 400, { error: 'Message is too long.' });
  const hist = (Array.isArray(d.conversation) ? d.conversation : []).slice(-20)
    .filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role, parts: [{ text: m.text.slice(0, 2000) }] }));
  const prov = provider();
  if (!prov) return send(res, 503, { error: 'SparkX is not configured yet (missing GEMINI_API_KEY or GROQ_API_KEY).' });
  const order = [prov, prov === 'gemini' ? 'groq' : 'gemini'].filter(p => p === prov || process.env[p.toUpperCase() + '_API_KEY']);
  let lastStatus = 0;
  for (const p of order) {
    for (let i = 0; i < 2; i++) {
      try {
        const reply = await (p === 'groq' ? askGroq(msg, hist) : askGemini(msg, hist));
        if (reply) return send(res, 200, { reply });
        lastStatus = 0; break;
      } catch (e) {
        lastStatus = e.status || 0;
        console.error(p, 'error', e.message);
        if (![429, 500, 503, 0].includes(lastStatus)) break;
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }
  const msgs = { 429: 'Too many requests right now. Wait a few seconds and try again.', 503: 'My brain is busy right now. Try again in a moment.', 404: 'My AI model name is wrong. Check GEMINI_MODEL.', 400: 'My AI rejected that request. Check the model and key settings.', 403: 'My API key is not allowed. Check the key.' };
  send(res, 502, { error: msgs[lastStatus] || 'My brain had a hiccup. Please try again.' });
}

function provider() {
  const want = (process.env.LLM_PROVIDER || '').toLowerCase();
  if (want === 'groq' && process.env.GROQ_API_KEY) return 'groq';
  if (want === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  return process.env.GEMINI_API_KEY ? 'gemini' : process.env.GROQ_API_KEY ? 'groq' : null;
}
async function askGemini(msg, hist) {
  const r = await fetch(API, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [...hist, { role: 'user', parts: [{ text: msg }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 1024 } })
  });
  if (!r.ok) throw Object.assign(new Error('Gemini status ' + r.status), { status: r.status });
  const j = await r.json();
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
}
async function askGroq(msg, hist) {
  const messages = [{ role: 'system', content: SYSTEM }, ...hist.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text })), { role: 'user', content: msg }];
  const r = await fetch(GROQ_API, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.GROQ_API_KEY },
    body: JSON.stringify({ model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile', messages, temperature: 0.8, max_tokens: 1024 })
  });
  if (!r.ok) throw Object.assign(new Error('Groq status ' + r.status), { status: r.status });
  const j = await r.json();
  return (j.choices?.[0]?.message?.content || '').trim();
}

http.createServer(async (req, res) => {
  for (const k in SEC) res.setHeader(k, SEC[k]);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return send(res, 200, { ok: true });
  if (url.pathname === '/api/chat') {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
    if (limited(req.socket.remoteAddress)) return send(res, 429, { error: 'Slow down a little and try again soon.' });
    return chat(req, res).catch(() => send(res, 500, { error: 'Something went wrong.' }));
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (p === '/' || p === path.sep) p = '/index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB)) return send(res, 403, { error: 'Forbidden.' });
  fs.readFile(f, (e, data) => {
    if (e) return send(res, 404, { error: 'Not found.' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`SparkX running on :${PORT}`));
