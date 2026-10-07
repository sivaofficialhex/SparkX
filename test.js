// Runs the server against a mock Gemini endpoint. Usage: npm test
const http = require('http'), { spawn } = require('child_process');
let last = null, fail = false;
const mock = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  last = JSON.parse(b); s.setHeader('Content-Type', 'application/json');
  if (fail) { s.statusCode = 500; return s.end('{}'); }
  s.end(JSON.stringify(q.url==='/groq' ? { choices: [{ message: { content: 'Your name is Siva.' } }] } : { candidates: [{ content: { parts: [{ text: 'Your name is Siva.' }] } }] })); }); }).listen(4999);
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT: '4001', GEMINI_API_KEY: process.env.T_PROV==='groq'?'':'k', GROQ_API_KEY: 'g', GEMINI_API_URL: 'http://127.0.0.1:4999/x', GROQ_API_URL: 'http://127.0.0.1:4999/groq', LLM_PROVIDER: process.env.T_PROV || '' }, stdio: 'ignore' });
const post = (b, raw) => fetch('http://127.0.0.1:4001/api/chat', { method: 'POST', body: raw ?? JSON.stringify(b) }).then(async r => [r.status, await r.json()]);
let bad = 0; const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) bad++; };
setTimeout(async () => {
  let [s, j] = await post({ message: 'What is my name?', conversation: [{ role: 'user', text: 'My name is Siva.' }, { role: 'model', text: 'Nice to meet you!' }] });
  ok('chat reply + context forwarded', s === 200 && j.reply === 'Your name is Siva.' && (last.contents ? last.contents.length === 3 && last.systemInstruction : last.messages.length === 4 && last.messages[0].role === 'system'));
  mock.calls = last; last = null;
  [s] = await post({ message: '   ' }); ok('empty input -> 400, no Gemini call', s === 400 && last === null);
  [s] = await post(null, '{bad'); ok('bad JSON -> 400', s === 400);
  [s] = await post({ message: 'x'.repeat(2001) }); ok('too long -> 400', s === 400);
  fail = true; [s, j] = await post({ message: 'hi' }); ok('Gemini failure -> friendly 502', s === 502 && !/500|k/.test(j.error.replace(/hiccup|check|again|try/gi, '')));
  const h = await fetch('http://127.0.0.1:4001/'); const html = await h.text();
  ok('index served, no API key in it', h.status === 200 && !html.includes('GEMINI_API_KEY'));
  ok('path traversal blocked', (await fetch('http://127.0.0.1:4001/..%2fserver.js')).status !== 200);
  srv.kill(); mock.close(); process.exit(bad ? 1 : 0);
}, 700);
