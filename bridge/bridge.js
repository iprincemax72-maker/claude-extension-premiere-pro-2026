#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3737;
const SESSION_ID = crypto.randomUUID();
const WORK_DIR = path.join(os.homedir(), 'PremiereClaude');
const OUTPUT_DIR = path.join(WORK_DIR, 'output');
const PANEL_DIR = (process.platform === 'win32')
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions', 'com.claudebridge.panel')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'com.claudebridge.panel');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Live-reload — fs.watch on the panel index, broadcasts to any open SSE client
const devReloadClients = new Set();
let _reloadDebounce = null;
function broadcastReload() {
  if (_reloadDebounce) return;
  _reloadDebounce = setTimeout(() => {
    _reloadDebounce = null;
    for (const c of devReloadClients) {
      try { c.write('event: reload\ndata: 1\n\n'); } catch {}
    }
  }, 120);
}
try {
  const watchTarget = path.join(PANEL_DIR, 'index.html');
  if (fs.existsSync(watchTarget)) {
    fs.watch(watchTarget, { persistent: false }, () => broadcastReload());
  }
} catch (e) { console.error('live-reload watcher failed:', e.message); }


const COMPLETION_SYSTEM = `You are an inline autocomplete running inside an Adobe Premiere Pro extension panel. The user is mid-sentence, writing a natural-language request for AI-generated motion graphics, transitions, intros, lower thirds, callouts, or any other video element.

Complete their sentence in 3 to 14 words. Match their tone and casing.

Rules:
- Output ONLY the completion text. No quotes, no preface, no explanation, no trailing period.
- The completion will be appended DIRECTLY to their text. Begin with a leading space if their text does not already end in a space.
- Bias toward concrete editor specifics: durations, colors, text content, animation style, target platform.
- If you genuinely cannot complete it, output an empty response.

Examples:
Input: "make a 3 second"
Output: " logo intro that fades in on a black background"

Input: "i want a"
Output: " kinetic typography intro for my podcast"

Input: "create a smooth"
Output: " transition between two clips"`;

const EXPAND_SYSTEMS = {
  light: `You are a LIGHT prompt enhancer for a Premiere Pro motion-graphics generator. The user typed a short request. Add only the 1–3 most useful missing specifics: a sensible duration if absent, a primary color or style cue, an aspect ratio if implied. Nothing more.

Rules:
- Stay extremely close to the user's wording and voice. Don't paraphrase what they already wrote.
- Final length: roughly 1.3x to 1.8x the input. Slightly longer, not transformed.
- Output ONLY the rewritten prompt. No preface, quotes, or explanation.
- Do NOT invent brand names, text, or content beyond reasonable defaults.
- Don't pad with adjectives. Each added word must add concrete, executable detail.`,

  medium: `You are a prompt-expansion engine for a video editor working in Adobe Premiere Pro. The user types a short, casual request for a motion graphic, intro, transition, lower third, callout, animation, or any rendered video element. Your job is to rewrite that request as a richer, more specific creative brief that an AI video generator (Remotion) can execute confidently.

Rewrite to include, when relevant:
- Duration in seconds (pick a sensible default if absent)
- Aspect ratio / target platform if implied (16:9, 9:16, 1:1)
- Color palette — specific hex codes or descriptive ("warm cinematic ochre and deep navy")
- Typography — weight, scale, family feel ("bold geometric sans, tight tracking")
- Animation style — easing curves, springiness, snap or smooth
- Composition — anchor, alignment, motion path
- Mood / energy — kinetic, calm, gritty, polished
- Concrete elements — grain, glow, light leaks, particles, gradients, masks

Rules:
- Output ONLY the rewritten prompt. No preface, no "Here is...", no explanation, no quotes.
- One or two flowing paragraphs OR a single dense sentence — match the user's energy but add depth.
- Keep their original intent intact; never invent text, names, or brands that weren't in the original.
- Don't pad with filler. Every word should add specificity.
- Final length: 2x to 3x the original.`,

  heavy: `You are a HEAVY production-brief writer for a Premiere Pro motion-graphics generator. The user typed a short request. Output a full, exhaustive creative + technical brief that an AI video tool can execute without further interpretation.

Cover ALL of these when relevant:
- Resolution (default 1920x1080) and aspect ratio
- Total duration broken down second-by-second into beats (e.g. "0.0–1.2s reveal, 1.2–2.6s hold, 2.6–3.0s fade")
- Specific hex color palette of 3–5 colors with role labels (background, accent, type, glow)
- Typography decisions if there's text — family feel, weight, size scale, tracking, kerning intent
- Easing curves named AND with cubic-bezier numbers (e.g. "ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1)")
- FPS (24 cinematic, 30 standard, 60 kinetic) with rationale
- Layered post details: grain percentage, glow intensity, chromatic aberration in pixels, light leaks, gradient angles
- Camera moves, anchor positions, motion paths
- Mood and reference vibe (cinematic, kinetic, agency, gritty, A24, Apple keynote, etc.)
- Optional: 1 sentence of tasteful variant suggestion the editor can ignore.

Rules:
- Output ONLY the brief itself. No preface, no "Here's...", no markdown headers, no bullet lists — flowing prose.
- Be SPECIFIC over flowery. Exact numbers and curves beat "beautiful" or "cinematic".
- Never invent text/brand names that weren't in the original.
- Length: 3x to 6x the input. 2–3 paragraphs is fine.`,
};

const COMPLETION_ARGS = [
  '-p',
  '--output-format', 'json',
  '--no-session-persistence',
  '--exclude-dynamic-system-prompt-sections',
  '--disable-slash-commands',
  '--model', 'haiku',
  '--append-system-prompt', COMPLETION_SYSTEM,
];


const SYSTEM_PROMPT = `You are running inside an Adobe Premiere Pro extension panel. The user is editing video and you are their in-app assistant.

Each user message may be prefixed with a [PREMIERE CONTEXT] block describing the active project, sequence, playhead, and any selected clips. Use this to ground your suggestions in what the user is actually working on. Do not ask for context the panel already provided.

When the user asks for motion graphics, intros, outros, lower thirds, transitions, animated logos, kinetic typography, callouts, countdowns, or any other rendered video element, you MUST:
1. Build and render the result with the Remotion framework. If \`remotion-video-skill\` or \`remotion-best-practices\` skills are installed, use them — they have battle-tested patterns. If not, write Remotion code directly using your training knowledge (it's a React-based video framework: components, useCurrentFrame(), interpolate(), AbsoluteFill, Composition).
2. Render the final file into ${OUTPUT_DIR} as MP4 (or PNG/GIF when more appropriate).
3. Emit the import marker so the panel auto-imports it.

AUDIO POLICY — NEVER include audio in rendered output. The user is a video editor who handles their own audio in Premiere; renders that ship with audio (especially loud auto-generated SFX or music) are unwanted and can damage hearing.
- Do NOT use Remotion's <Audio>, <Sequence audio>, or any sound-emitting components.
- Do NOT add SFX, narration, music, or stingers — even when the prompt would seem to suggest one ("dramatic intro", "boom", "whoosh transition", "alarm", etc). These are visual cues only.
- When invoking Remotion's renderMedia / CLI, render video-only. Pass a codec and config that produces a silent track (e.g. \`--enforce-audio-track=false\`, or omit any audio-producing components).
- If the user explicitly says "with audio" or "include sound", you may add audio but must keep peaks below -20 dBFS and gently fade in/out.

REFERENCE FILES — when a message contains a [REFERENCE: /abs/path] block, treat that file as the visual style guide for the animation:
- For images (.png/.jpg/.jpeg/.webp/.gif): use the Read tool on the path. Examine colors, typography, layout, lighting, mood, composition. Mirror those decisions in your Remotion design.
- For videos (.mp4/.mov/.webm/.mkv): use the Bash tool to extract a representative frame (~1s in) with ffmpeg, e.g. \`ffmpeg -y -ss 1 -i "<path>" -frames:v 1 "${OUTPUT_DIR}/_ref_frame.png"\`, then Read that PNG. Note motion style and pacing from the source duration.
- Always describe in 1 sentence what you took from the reference, then proceed.

The import marker syntax — use this on its own line, anywhere in your reply:
[[IMPORT:/absolute/path/to/file.ext]]

You can emit multiple [[IMPORT:...]] markers. The panel parses them and imports each file into the user's Premiere project bin. Always use absolute paths inside ${OUTPUT_DIR}.

Working directory for any scratch files, Remotion projects, npm installs: ${WORK_DIR}.

PRE-SCAFFOLDED REMOTION PROJECT:
- A Remotion project is already installed at ${WORK_DIR}/remotion-intro/ with node_modules ready.
- Add new compositions as TSX files in ${WORK_DIR}/remotion-intro/src/ and register them in src/Root.tsx with a unique <Composition id="..."> entry.
- Render with: \`cd ${WORK_DIR}/remotion-intro && npx remotion render src/index.ts <CompositionId> ${OUTPUT_DIR}/<filename>.mp4\`
- Do NOT scaffold a new Remotion project; do NOT run \`npx create-video\`. Reuse the existing one.
- If node_modules is somehow missing (\`ls ${WORK_DIR}/remotion-intro/node_modules\` is empty), run \`cd ${WORK_DIR}/remotion-intro && npm install\` first — but this should already be done from the installer.

PROJECT REUSE POLICY:
- You MAY reuse the existing Remotion project shell (package.json, node_modules, render config, fonts).
- You MUST NOT reuse existing components, styles, or design choices from prior renders. The user expects a FRESH design every prompt — different colors, layout, typography, motion. Treat every prompt as a clean creative slate even if a similar-named component already exists on disk.
- Create a new component file with a unique name (e.g. include a short timestamp or descriptive suffix) so you do not collide with previous renders. Register it in src/Root.tsx with a matching unique composition id.
- ONLY exception — when the user message begins with "Make a new version of a previous render." they are explicitly iterating. In that case: read the named "Previous file", find the matching component, and modify it minimally to apply the requested change while preserving every other styling decision.

Style: terse. The user is editing in Premiere, not reading docs. One or two sentences plus the import marker is the goal. Skip preamble like "Sure, I'll help…".`;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Dev mode — serve the panel UI in Chrome at http://localhost:3737/panel
  // so the user can iterate on index.html without reloading Premiere Pro.
  // CEP-only features (timeline import, source monitor) won't work in Chrome,
  // but chat / expand / autocomplete / preview all do.
  if (req.method === 'GET' && (req.url === '/panel' || req.url === '/panel/' || req.url.startsWith('/panel?'))) {
    try {
      const indexPath = path.join(PANEL_DIR, 'index.html');
      if (!fs.existsSync(indexPath)) { res.writeHead(404); res.end('panel not found at ' + PANEL_DIR); return; }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      });
      res.end(fs.readFileSync(indexPath));
    } catch (e) { res.writeHead(500); res.end('error: ' + e.message); }
    return;
  }

  // SSE stream that pushes a 'reload' event whenever index.html changes on
  // disk. The dev-mode tab listens to this and refreshes automatically.
  if (req.method === 'GET' && req.url === '/dev/reload-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n');
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    devReloadClients.add(res);
    req.on('close', () => { clearInterval(ping); devReloadClients.delete(res); });
    return;
  }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, session: SESSION_ID, outputDir: OUTPUT_DIR }));
    return;
  }

  // Local file preview — serves anything under ~/PremiereClaude/output/ over HTTP
  // so the user can open it in Chrome at http://localhost:3737/preview/<file>
  if (req.method === 'GET' && req.url.startsWith('/preview/')) {
    try {
      const rel = decodeURIComponent(req.url.slice('/preview/'.length).split('?')[0]);
      const abs = path.resolve(OUTPUT_DIR, rel);
      // prevent path traversal
      if (!abs.startsWith(OUTPUT_DIR + path.sep) && abs !== OUTPUT_DIR) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(abs).toLowerCase();
      const mime = ({
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp',
      })[ext] || 'application/octet-stream';
      const stat = fs.statSync(abs);
      const range = req.headers.range;
      // Range support so Chrome can seek video without buffering whole file
      if (range && /^bytes=/.test(range)) {
        const [s, e] = range.replace(/bytes=/, '').split('-');
        const start = parseInt(s, 10);
        const end = e ? parseInt(e, 10) : stat.size - 1;
        if (isNaN(start) || isNaN(end) || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
          res.end(); return;
        }
        res.writeHead(206, {
          'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Content-Type': mime,
        });
        fs.createReadStream(abs, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(abs).pipe(res);
      }
    } catch (e) {
      res.writeHead(500); res.end('error: ' + e.message);
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/expand') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('{"expanded":""}'); return; }
      const promptText = (payload.prompt || '').toString();
      if (!promptText.trim() || promptText.length < 3 || promptText.length > 2000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ expanded: '' }));
        return;
      }

      const level = ['light', 'medium', 'heavy'].indexOf(payload.level) >= 0 ? payload.level : 'medium';
      const sys = EXPAND_SYSTEMS[level];

      // No --model flag → uses the user's default (Opus 4.7) for proper depth.
      const args = [
        '-p',
        '--output-format', 'json',
        '--no-session-persistence',
        '--exclude-dynamic-system-prompt-sections',
        '--disable-slash-commands',
        '--append-system-prompt', sys,
        promptText,
      ];

      const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
      let stdout = '', stderr = '', done = false;

      const finish = (expanded) => {
        if (done) return;
        done = true;
        expanded = (expanded || '').toString();
        // Strip wrapping quotes if Claude added them, collapse extra blank lines
        expanded = expanded.replace(/^["'`]+|["'`]+$/g, '').trim();
        expanded = expanded.replace(/\n{3,}/g, '\n\n');
        try {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ expanded }));
        } catch {}
      };

      const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {}; finish(''); }, 60000);

      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('error', () => { clearTimeout(killer); finish(''); });
      proc.on('close', () => {
        clearTimeout(killer);
        let expanded = '';
        try {
          const parsed = JSON.parse(stdout);
          expanded = parsed.result || parsed.text || '';
        } catch { expanded = stdout; }
        finish(expanded);
      });

      req.on('aborted', () => {
        if (!done) { try { proc.kill('SIGKILL'); } catch {}; finish(''); }
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/complete') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('{"completion":""}'); return; }
      const prefix = (payload.prefix || '').toString();
      if (!prefix.trim() || prefix.length < 4 || prefix.length > 600) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ completion: '' }));
        return;
      }

      const args = COMPLETION_ARGS.concat([prefix]);
      const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
      let stdout = '', stderr = '', done = false;

      const finish = (completion) => {
        if (done) return;
        done = true;
        completion = (completion || '').toString();
        completion = completion.replace(/[\r\n]+/g, ' ').trim();
        completion = completion.replace(/^["'`]+|["'`]+$/g, '').trim();
        if (completion.length > 200) completion = completion.slice(0, 200);
        if (completion && !prefix.endsWith(' ') && !completion.startsWith(' ')) {
          completion = ' ' + completion;
        }
        try {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ completion }));
        } catch {}
      };

      const killer = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        finish('');
      }, 12000);

      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      proc.on('error', () => { clearTimeout(killer); finish(''); });
      proc.on('close', () => {
        clearTimeout(killer);
        let completion = '';
        try {
          const parsed = JSON.parse(stdout);
          completion = parsed.result || parsed.text || '';
        } catch { completion = stdout; }
        finish(completion);
      });

      // Client aborted (user typed more) — kill the proc, save quota.
      // Note: 'aborted' fires only on abnormal close; 'close' would also fire
      // on normal request end in modern Node which would kill the running spawn.
      req.on('aborted', () => {
        if (!done) { try { proc.kill('SIGKILL'); } catch {} finish(''); }
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }

      const message = payload.message;
      const context = payload.context || null;
      if (!message) { res.writeHead(400); res.end('{"error":"empty message"}'); return; }

      let fullMessage = message;
      if (context) {
        const ctxLines = [
          '[PREMIERE CONTEXT]',
          'Project: ' + (context.projectName || '(none)'),
          'Sequence: ' + (context.sequenceName || '(no active sequence)'),
        ];
        if (context.playheadSeconds != null) ctxLines.push('Playhead: ' + context.playheadSeconds.toFixed(2) + 's');
        if (context.selectedClips && context.selectedClips.length) {
          ctxLines.push('Selected clips: ' + context.selectedClips.join(', '));
        }
        ctxLines.push('Output dir for any rendered files: ' + OUTPUT_DIR);
        ctxLines.push('');
        fullMessage = ctxLines.join('\n') + '\n' + message;
      }

      // Each /chat call is intentionally a fresh Claude invocation with no
      // memory of prior prompts, so the user doesn't get repeats of past
      // animations. Iteration context is passed explicitly inside the message
      // body (see the panel's "Changes" button).
      const args = [
        '-p',
        '--output-format', 'json',
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', SYSTEM_PROMPT,
        '--no-session-persistence',
      ];
      args.push(fullMessage);

      console.log('\n> ' + message.slice(0, 80));
      const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => stdout += d);
      proc.stderr.on('data', d => stderr += d);
      let chatDone = false;
      const sendErr = (msg) => {
        if (chatDone) return; chatDone = true;
        try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); } catch {}
      };
      const sendOk = (obj) => {
        if (chatDone) return; chatDone = true;
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); } catch {}
      };

      req.on('aborted', () => {
        if (!chatDone) { try { proc.kill('SIGKILL'); } catch {} chatDone = true; }
      });

      proc.on('error', err => {
        console.error('spawn error:', err.message);
        sendErr('claude CLI not found: ' + err.message);
      });
      proc.on('close', code => {
        if (chatDone) return;
        if (code !== 0) {
          console.error('claude exit', code, stderr);
          sendErr(stderr.trim() || `claude exited with code ${code}`);
          return;
        }
        let reply = stdout.trim();
        try {
          const parsed = JSON.parse(stdout);
          reply = parsed.result || parsed.text || parsed.message || reply;
        } catch {}
        const imports = [];
        const re = /\[\[IMPORT:([^\]]+)\]\]/g;
        let m;
        while ((m = re.exec(reply)) !== null) imports.push(m[1].trim());
        console.log('< ' + String(reply).slice(0, 80));
        if (imports.length) console.log('  imports: ' + imports.join(', '));
        sendOk({ reply, imports });
      });
    });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Claude Bridge v2 running at http://localhost:' + PORT);
  console.log('Session ID: ' + SESSION_ID);
  console.log('Work dir:   ' + WORK_DIR);
  console.log('Output dir: ' + OUTPUT_DIR);
  console.log('Open Premiere Pro → Window → Extensions → Claude');
  console.log('(keep this terminal open)\n');
});
