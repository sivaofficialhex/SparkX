# SparkX — Talk. Listen. Understand.
A voice-first AI companion. You speak → browser speech recognition → Gemini → browser text-to-speech.

## Stack (and why)
Zero-dependency Node 18+ server (`server.js`) + a single static page (`public/index.html`, plain JS/CSS).
Chosen over React/Vite/Express so there is nothing to install or build, and deployment is one step.
The AI is called only from the server (Gemini or Groq); keys never reach the browser.

## Run locally
```bash
cp .env.example .env      # put your key in GEMINI_API_KEY
npm start                 # http://localhost:3000
npm test                  # server tests against a mock Gemini
```
Get a key free at https://aistudio.google.com/apikey. Mic access needs HTTPS or localhost.

## Deploy (Render, free tier)
1. Push this folder to a GitHub repo (`.env` is git-ignored).
2. render.com → New → Blueprint (or Web Service) → pick the repo. `render.yaml` is included.
3. Add environment variable `GEMINI_API_KEY`. Deploy. You get an https URL.

## Env vars
Set `GEMINI_API_KEY` **or** `GROQ_API_KEY` (one is enough). If both, Gemini is used unless `LLM_PROVIDER=groq`. Optional: `GEMINI_MODEL`, `GROQ_MODEL` (default llama-3.3-70b-versatile), `PORT`. Groq key: console.groq.com/keys.

## Browsers
Voice input: Chrome, Edge, Safari (iOS 14.5+). Firefox lacks speech recognition; SparkX shows a typing fallback.
Android Chrome has the best Tamil/Tanglish recognition. Recognition language is `en-IN`, which transcribes Tanglish well.

## Troubleshooting
- "Microphone blocked": allow the mic in site settings, reload.
- "Not configured": `GEMINI_API_KEY` is missing on the server.
- No voice reply: pick a voice in ⚙; some devices lack a Tamil voice (text still shows).
- Tamil script is only transcribed if you change `rec.lang` to `ta-IN` in index.html.
