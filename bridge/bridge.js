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

// Track the currently-running autocut claude subprocess so /autocut-cancel
// can kill it cleanly. null when no autocut is in flight.
let _activeAutocut = null;

// Resolve an absolute path to ffmpeg — falls back to bare 'ffmpeg' if no
// absolute path is found. Needed because the bridge may be auto-spawned by
// CEP with a minimal PATH that doesn't include brew bins.
function resolveFFmpeg() {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg', '/usr/bin/ffmpeg', 'C:\\\\ffmpeg\\\\bin\\\\ffmpeg.exe'];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return 'ffmpeg';
}
const FFMPEG_BIN = resolveFFmpeg();
console.log('ffmpeg bin: ' + FFMPEG_BIN);

// Run ffmpeg silencedetect and return parsed pause ranges.
// `onProgress(0..1)` fires as ffmpeg's "time=" reports advance through the clip.
function detectSilences(clipPath, clipDuration, onProgress) {
  return new Promise((resolve, reject) => {
    const args = ['-i', clipPath, '-af', 'silencedetect=noise=-30dB:d=0.6', '-f', 'null', '-'];
    const ff = spawn(FFMPEG_BIN, args);
    let stderr = '';
    const timeRe = /time=([\d:.]+)/g;
    ff.stderr.on('data', d => {
      const chunk = d.toString();
      stderr += chunk;
      // ffmpeg prints "time=HH:MM:SS.MS" repeatedly while processing
      if (onProgress && typeof clipDuration === 'number' && clipDuration > 0) {
        let m, latest = null;
        while ((m = timeRe.exec(chunk)) !== null) latest = m[1];
        if (latest) {
          const parts = latest.split(':').map(parseFloat);
          let sec = 0;
          if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
          else sec = parts[0] || 0;
          if (sec > 0) onProgress(Math.min(1, sec / clipDuration));
        }
      }
    });
    ff.on('error', err => reject(new Error('ffmpeg failed: ' + err.message)));
    ff.on('close', () => {
      const cuts = [];
      const re = /silence_start:\s*([\d.]+)|silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;
      let lastStart = null;
      let m;
      while ((m = re.exec(stderr)) !== null) {
        if (m[1] !== undefined) lastStart = parseFloat(m[1]);
        else if (m[2] !== undefined && lastStart !== null) {
          cuts.push({
            start: lastStart,
            end: parseFloat(m[2]),
            duration: parseFloat(m[3]),
            kind: 'silence',
            reason: 'long pause (' + parseFloat(m[3]).toFixed(1) + 's)',
          });
          lastStart = null;
        }
      }
      const safe = (typeof clipDuration === 'number' && clipDuration > 0) ? clipDuration : Number.MAX_SAFE_INTEGER;
      resolve(cuts.filter(c => c.end <= safe + 0.5));
    });
  });
}

// Ask Claude to transcribe the audio + analyse the transcript for filler
// words, false starts, repeats. Combine with the pre-computed silence cuts.
// Returns { cuts: [...], transcribed: bool, summary: string }.
function transcriptAnalyse(clipPath, clipDuration, silenceCuts) {
  return new Promise(resolve => {
    const silenceJson = JSON.stringify(silenceCuts.map(c => ({
      start: +c.start.toFixed(3),
      end: +c.end.toFixed(3),
      duration: +c.duration.toFixed(3),
    })));

    const userMsg = [
      'TASK: auto-cut a talking-head video. You MUST transcribe and analyse — do not stop at silence detection.',
      '',
      'Source media file:  ' + clipPath,
      'Duration:           ' + (typeof clipDuration === 'number' ? clipDuration.toFixed(2) + 's' : 'unknown'),
      'Output dir:         ' + OUTPUT_DIR,
      '',
      'PRE-COMPUTED SILENCES (ffmpeg silencedetect, ≥0.6s @ -30dB). These are already confirmed — include them in final output:',
      silenceJson,
      '',
      'STEPS — do every one:',
      '',
      'STEP 1 — TRANSCRIBE with WORD-LEVEL TIMESTAMPS.',
      '  Try these paths in order, stop at the first that works:',
      '  (a) asr-transcribe-to-text skill (Qwen3-ASR via MLX on macOS) — preferred.',
      '  (b) whisper.cpp at /opt/homebrew/bin/whisper-cli with a base/small model.',
      '  (c) `python -m whisper` or `faster-whisper` if installed.',
      '  (d) Last resort: extract audio with ffmpeg → `ffmpeg -y -i "' + clipPath + '" -ac 1 -ar 16000 "' + OUTPUT_DIR + '/_autocut_audio.wav"`, then transcribe that wav.',
      '  Only set "transcribed": false if ALL four paths fail. Note which path you used in your reasoning.',
      '',
      'STEP 2 — ANALYSE the transcript for cuts:',
      '   - FILLER words: "um", "uh", "like" (as filler, not comparison), "you know", "I mean", "sorta", "kinda", redundant "actually"/"basically".',
      '   - FALSE STARTS / REPEATS: speaker starts a sentence, stops, restarts a similar phrase. Cut the FIRST broken attempt, keep the better take.',
      '   - SELF-CORRECTIONS: "I went to — sorry, I came from..." — cut the wrong half.',
      '   Use word-level timestamps for tight cut boundaries. Include the trailing breath after a filler so the edit feels natural.',
      '',
      'STEP 3 — MERGE with silence cuts. If a filler-cut range overlaps a silence range, merge them and use the more descriptive reason.',
      '',
      'STEP 4 — DOUBLE-CHECK every proposed cut:',
      '   - Would it orphan part of a word? Drop it.',
      '   - Would it remove meaningful content? Drop it.',
      '   - Be CONSERVATIVE. When unsure, skip.',
      '',
      'STEP 5 — Sort cuts by start time ascending.',
      '',
      'OUTPUT — your FINAL assistant message must be EXACTLY this JSON. No prose, no code fences, no commentary, nothing else:',
      '{',
      '  "transcribed": true,',
      '  "cuts": [',
      '    { "start": 2.30, "end": 3.10, "kind": "silence",     "reason": "long pause (0.8s)" },',
      '    { "start": 5.20, "end": 5.62, "kind": "filler",      "reason": "um" },',
      '    { "start": 14.0, "end": 16.4, "kind": "false_start", "reason": "restarted sentence" }',
      '  ],',
      '  "summary": "Found 6 pauses, 4 fillers, 2 false starts. Would remove 9.8s."',
      '}',
      '',
      '"kind" must be one of: silence, filler, false_start, mistake. Do all reasoning silently — only emit the JSON in your final message.',
    ].join('\n');

    const sysPrompt = 'You are an audio editor\'s assistant inside an Adobe Premiere panel. You return ONLY valid JSON when asked — no prose. You use installed Claude Code skills (asr-transcribe-to-text, ffmpeg, etc.) freely. You are conservative about what to cut: when in doubt, keep the content.';

    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
      '--append-system-prompt', sysPrompt,
      '--no-session-persistence',
      userMsg,
    ];

    const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
    let stderr = '';
    let lineBuf = '';
    let finalReply = '';
    let didResolve = false;

    // Stash this proc as the active autocut so a cancel call can kill it
    _activeAutocut = proc;

    proc.stderr.on('data', d => stderr += d);

    // Hard timeout — Claude can hang on a stuck transcription tool. Kill the
    // subprocess after 3 minutes and fall back to silence-only cuts.
    const HARD_TIMEOUT_MS = 3 * 60 * 1000;
    const killer = setTimeout(() => {
      if (didResolve) return;
      console.log('  [autocut] hard timeout — killing claude after ' + (HARD_TIMEOUT_MS/1000) + 's');
      try { proc.kill('SIGKILL'); } catch {}
      didResolve = true;
      _activeAutocut = null;
      resolve({ cuts: silenceCuts, transcribed: false, summary: 'Transcript timed out (3 min) — silence-only.' });
    }, HARD_TIMEOUT_MS);

    // Idle watchdog — if no stream-json event has arrived in 60s, claude is
    // either hung or waiting on a tool that won't return. Kill it.
    let lastActivity = Date.now();
    const IDLE_TIMEOUT_MS = 90 * 1000;
    const idleCheck = setInterval(() => {
      if (didResolve) { clearInterval(idleCheck); return; }
      if (Date.now() - lastActivity > IDLE_TIMEOUT_MS) {
        console.log('  [autocut] idle ' + Math.round((Date.now() - lastActivity)/1000) + 's — killing claude');
        try { proc.kill('SIGKILL'); } catch {}
      }
    }, 15000);

    // Step inside the 18-92% transcript-stage budget — each tool call bumps
    // the bar by a fixed amount, capped at 90% so we don't pretend to be done.
    let stagePct = 18;
    const stepBump = (status) => {
      if (!status) return;
      if (/^Transcrib/.test(status))            stagePct = Math.max(stagePct, 25);
      else if (/^Reading|^Running ffmpeg/.test(status)) stagePct = Math.min(58, stagePct + 4);
      else if (/^Analys/.test(status))          stagePct = Math.max(stagePct, 62);
      else if (/^Double-check/.test(status))    stagePct = Math.max(stagePct, 88);
      else                                       stagePct = Math.min(90, stagePct + 3);
      broadcastProgress(status, stagePct);
    };

    proc.stdout.on('data', chunk => {
      lastActivity = Date.now();
      lineBuf += chunk.toString();
      let nl;
      while ((nl = lineBuf.indexOf('\n')) >= 0) {
        const line = lineBuf.slice(0, nl).trim();
        lineBuf = lineBuf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        const status = streamEventToStatus(evt);
        if (status) stepBump(status);
        if (evt.type === 'result' && typeof evt.result === 'string') finalReply = evt.result;
        if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
          for (const blk of evt.message.content) {
            if (blk.type === 'text' && typeof blk.text === 'string') finalReply = blk.text;
          }
        }
      }
    });

    proc.on('error', () => {
      if (didResolve) return; didResolve = true;
      clearTimeout(killer); clearInterval(idleCheck); _activeAutocut = null;
      resolve({ cuts: silenceCuts, transcribed: false, summary: 'Claude CLI unavailable — silence-only.' });
    });

    proc.on('close', () => {
      if (didResolve) return;
      clearTimeout(killer); clearInterval(idleCheck); _activeAutocut = null;
      // Parse Claude's reply as JSON. Tolerant: strict → code-fenced → first {…} block.
      let parsed = null;
      const reply = (finalReply || '').trim();
      console.log('  [autocut] claude reply length: ' + reply.length);
      console.log('  [autocut] claude reply preview: ' + reply.slice(0, 200).replace(/\n/g, ' '));
      // 1) Strict JSON
      try { parsed = JSON.parse(reply); } catch {}
      // 2) ```json ... ``` fenced block
      if (!parsed) {
        const fence = reply.match(/```(?:json)?\s*([\s\S]+?)```/);
        if (fence) { try { parsed = JSON.parse(fence[1].trim()); } catch {} }
      }
      // 3) First {...} run that parses
      if (!parsed) {
        const starts = [];
        for (let i = 0; i < reply.length; i++) if (reply[i] === '{') starts.push(i);
        for (const s of starts) {
          // Try expanding ends backwards for the largest matching parse
          for (let e = reply.length; e > s + 1; e--) {
            const chunk = reply.slice(s, e);
            if (chunk[chunk.length - 1] !== '}') continue;
            try { parsed = JSON.parse(chunk); if (parsed && Array.isArray(parsed.cuts)) break; parsed = null; } catch {}
          }
          if (parsed && Array.isArray(parsed.cuts)) break;
        }
      }
      if (!parsed || !Array.isArray(parsed.cuts)) {
        console.log('  [autocut] JSON parse failed — falling back to silence-only');
        didResolve = true;
        resolve({ cuts: silenceCuts, transcribed: false, summary: 'Transcript step failed — silence-only.' });
        return;
      }
      didResolve = true;
      // Sanitize cuts
      const safeClipDur = (typeof clipDuration === 'number' && clipDuration > 0) ? clipDuration : Number.MAX_SAFE_INTEGER;
      const cuts = parsed.cuts
        .filter(c => typeof c.start === 'number' && typeof c.end === 'number' && c.end > c.start && c.end <= safeClipDur + 0.5)
        .map(c => ({
          start: +c.start.toFixed(3),
          end: +c.end.toFixed(3),
          kind: c.kind || 'cut',
          reason: c.reason || 'cut',
        }))
        .sort((a, b) => a.start - b.start);
      resolve({
        cuts,
        transcribed: !!parsed.transcribed,
        summary: parsed.summary || ('Found ' + cuts.length + ' cuts.'),
      });
    });
  });
}

// Auto-transcode files Premiere Pro refuses (webm, vp8, vp9) to MP4 H.264.
// Returns a path Premiere can definitely import. If the input is already an
// MP4/MOV/PNG/GIF/JPG it's returned as-is (no work). Failed transcodes return
// the original path so the user at least sees the original file.
const PREMIERE_IMPORTABLE_EXTS = new Set([
  '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.mxf', '.mts',
  '.png', '.jpg', '.jpeg', '.tif', '.tiff', '.gif', '.webp',
  '.wav', '.mp3', '.aac', '.m4a',
]);
function ensurePremiereImportable(absPath) {
  return new Promise(resolve => {
    try {
      if (!absPath || !fs.existsSync(absPath)) { resolve(absPath); return; }
      const ext = path.extname(absPath).toLowerCase();
      if (PREMIERE_IMPORTABLE_EXTS.has(ext)) { resolve(absPath); return; }
      // Anything else — transcode to mp4
      const outPath = absPath.replace(/\.[^.]+$/, '') + '.mp4';
      broadcastProgress('Transcoding to mp4 (Premiere-compatible)');
      console.log('  transcoding ' + path.basename(absPath) + ' → ' + path.basename(outPath));
      const ff = spawn(FFMPEG_BIN, [
        '-y', '-i', absPath,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-movflags', '+faststart',
        outPath,
      ]);
      let stderrBuf = '';
      ff.stderr.on('data', d => stderrBuf += d.toString().slice(-2000));
      ff.on('error', e => {
        console.error('  ffmpeg spawn failed:', e.message);
        resolve(absPath);
      });
      ff.on('close', code => {
        if (code === 0 && fs.existsSync(outPath)) {
          console.log('  transcoded → ' + outPath);
          resolve(outPath);
        } else {
          console.error('  ffmpeg exit ' + code + '\n' + stderrBuf.slice(-500));
          resolve(absPath);
        }
      });
    } catch (e) {
      resolve(absPath);
    }
  });
}

// Real-time progress — bridge parses Claude's stream-json events and pushes
// human-readable status lines ("Writing component", "Rendering frames", etc.)
// over SSE so the panel can display what's actually happening.
const progressClients = new Set();
function broadcastProgress(text, pct) {
  if (!text && pct == null) return;
  const payload = { text: text || '' };
  if (typeof pct === 'number') payload.pct = Math.max(0, Math.min(100, pct));
  const data = JSON.stringify(payload);
  for (const c of progressClients) {
    try { c.write('event: progress\ndata: ' + data + '\n\n'); } catch {}
  }
}
function broadcastProgressDone() {
  for (const c of progressClients) {
    try { c.write('event: done\ndata: 1\n\n'); } catch {}
  }
}

// Translate a Claude stream-json event into a short human-readable status line.
// Returns null if the event isn't worth showing the user.
function streamEventToStatus(evt) {
  if (!evt || typeof evt !== 'object') return null;
  const msg = evt.message || evt;
  // tool_use blocks live inside assistant messages
  if (msg.role === 'assistant' && Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        return toolUseToStatus(block);
      }
    }
  }
  // Top-level tool_use (some claude versions stream them flat)
  if (evt.type === 'tool_use') return toolUseToStatus(evt);
  return null;
}
function toolUseToStatus(block) {
  const name = block.name || '';
  const input = block.input || {};
  const basename = (p) => (p ? String(p).split('/').pop().split('\\').pop() : '');
  if (name === 'Bash') {
    const cmd = String(input.command || '');
    const desc = String(input.description || '').trim();
    if (/npx\s+remotion\s+render/.test(cmd)) return 'Rendering video';
    if (/npm\s+install/.test(cmd))            return 'Installing dependencies';
    if (/ffmpeg/.test(cmd) && /-frames:v/.test(cmd)) return 'Extracting reference frame';
    if (/ffmpeg/.test(cmd))                   return 'Running ffmpeg';
    if (desc)                                  return desc;
    return 'Running command';
  }
  if (name === 'Read')      return 'Reading ' + basename(input.file_path);
  if (name === 'Write')     return 'Writing ' + basename(input.file_path);
  if (name === 'Edit')      return 'Editing ' + basename(input.file_path);
  if (name === 'Glob')      return 'Searching project';
  if (name === 'Grep')      return 'Searching code';
  if (name === 'WebFetch')  return 'Fetching reference';
  if (name === 'TodoWrite') return null;
  if (name)                 return 'Tool: ' + name;
  return null;
}
try {
  const watchTarget = path.join(PANEL_DIR, 'index.html');
  if (fs.existsSync(watchTarget)) {
    fs.watch(watchTarget, { persistent: false }, () => broadcastReload());
  }
} catch (e) { console.error('live-reload watcher failed:', e.message); }

// Hot-reload host.jsx — when the ExtendScript file changes, push a separate
// event so the panel can re-evaluate the jsx in place without closing.
let _jsxReloadDebounce = null;
function broadcastJsxReload() {
  if (_jsxReloadDebounce) return;
  _jsxReloadDebounce = setTimeout(() => {
    _jsxReloadDebounce = null;
    for (const c of devReloadClients) {
      try { c.write('event: jsx-reload\ndata: 1\n\n'); } catch {}
    }
  }, 120);
}
try {
  const jsxTarget = path.join(PANEL_DIR, 'jsx', 'host.jsx');
  if (fs.existsSync(jsxTarget)) {
    fs.watch(jsxTarget, { persistent: false }, () => broadcastJsxReload());
  }
} catch (e) { console.error('jsx watcher failed:', e.message); }


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
2. Render the final file into ${OUTPUT_DIR}.

OUTPUT FORMAT REQUIREMENTS (critical — Premiere can't import some formats):
- For motion video → MP4 with H.264 codec. NEVER WebM, NEVER VP8/VP9 — Premiere Pro refuses these.
- For looping animation with transparency → MOV with ProRes 4444 (alpha-capable) or animated PNG.
- For still images → PNG.
- The Remotion CLI flag is \`--codec h264\` for MP4 and \`--codec prores --prores-profile 4444\` for transparent MOV. Always pass an explicit \`--codec\` so it doesn't default to webm.
- File extensions MUST match codec: h264 → .mp4, prores → .mov, png → .png. The panel parses the extension to decide how to import.

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

  // Real-time progress channel — panel subscribes when sending /chat so the
  // "Working" indicator can swap in to "Writing component", "Rendering video",
  // etc. as Claude actually does each step.
  if (req.method === 'GET' && req.url === '/progress-stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(': connected\n\n');
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
    progressClients.add(res);
    req.on('close', () => { clearInterval(ping); progressClients.delete(res); });
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

      // Stream-JSON output gives us a JSONL feed of system/tool/assistant
      // events as they happen, so the bridge can push real-time progress to
      // the panel via SSE. The final assistant message is collected and
      // returned to the panel in the original /chat response shape.
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', SYSTEM_PROMPT,
        '--no-session-persistence',
      ];
      args.push(fullMessage);

      console.log('\n> ' + message.slice(0, 80));
      broadcastProgress('Thinking');
      const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
      let stderr = '';
      let lineBuf = '';
      let finalReply = '';
      let lastActivity = Date.now();

      proc.stderr.on('data', d => stderr += d);

      proc.stdout.on('data', chunk => {
        lastActivity = Date.now();
        lineBuf += chunk.toString();
        let nl;
        while ((nl = lineBuf.indexOf('\n')) >= 0) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          let evt;
          try { evt = JSON.parse(line); } catch { continue; }

          // Push human-readable status when we see a tool call
          const status = streamEventToStatus(evt);
          if (status) broadcastProgress(status);

          // Capture the final assistant text
          if (evt.type === 'result' && typeof evt.result === 'string') {
            finalReply = evt.result;
          }
          if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
            for (const blk of evt.message.content) {
              if (blk.type === 'text' && typeof blk.text === 'string') {
                finalReply = blk.text;
              }
            }
          }
        }
      });

      let chatDone = false;

      // Idle watchdog — if Claude emits no stream-json events for 3 minutes,
      // kill it. Catches the "0% CPU forever" hang. 3 min is generous so a
      // legitimate long render isn't interrupted while the actual ffmpeg /
      // remotion subprocess is running (those emit no claude events).
      const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
      const idleCheck = setInterval(() => {
        if (chatDone) { clearInterval(idleCheck); return; }
        const idle = Date.now() - lastActivity;
        if (idle > IDLE_TIMEOUT_MS) {
          console.log('  [chat] idle ' + Math.round(idle/1000) + 's — killing claude');
          try { proc.kill('SIGKILL'); } catch {}
        }
      }, 30000);

      // Hard timeout — chat can't ever take more than 10 minutes
      const HARD_TIMEOUT_MS = 10 * 60 * 1000;
      const hardKiller = setTimeout(() => {
        if (chatDone) return;
        console.log('  [chat] hard timeout — killing claude');
        try { proc.kill('SIGKILL'); } catch {}
      }, HARD_TIMEOUT_MS);

      const sendErr = (m) => {
        if (chatDone) return; chatDone = true;
        clearInterval(idleCheck); clearTimeout(hardKiller);
        broadcastProgressDone();
        try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: m })); } catch {}
      };
      const sendOk = (obj) => {
        if (chatDone) return; chatDone = true;
        clearInterval(idleCheck); clearTimeout(hardKiller);
        broadcastProgressDone();
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); } catch {}
      };

      req.on('aborted', () => {
        if (!chatDone) { try { proc.kill('SIGKILL'); } catch {} chatDone = true; clearInterval(idleCheck); clearTimeout(hardKiller); broadcastProgressDone(); }
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
        const reply = (finalReply || '').trim() || '(no response)';
        const rawImports = [];
        const re = /\[\[IMPORT:([^\]]+)\]\]/g;
        let m;
        while ((m = re.exec(reply)) !== null) rawImports.push(m[1].trim());
        console.log('< ' + String(reply).slice(0, 80));
        if (rawImports.length) console.log('  imports: ' + rawImports.join(', '));

        // Safety net — Premiere can't import .webm. Auto-transcode to .mp4
        // (H.264 + AAC) before handing the path to the panel. Same for any
        // other format Premiere refuses; we transcode all of them through here.
        Promise.all(rawImports.map(p => ensurePremiereImportable(p)))
          .then(safePaths => {
            const imports = safePaths.filter(Boolean);
            sendOk({ reply, imports });
          })
          .catch(err => {
            console.error('transcode error:', err.message);
            sendOk({ reply, imports: rawImports });
          });
      });
    });
    return;
  }

  // Manual update trigger from the panel — pulls latest files from GitHub raw
  if (req.method === 'POST' && req.url === '/update') {
    handleUpdateRequest(req, res);
    return;
  }

  // Auto-cut endpoint — three-stage pipeline:
  // 1. ffmpeg silencedetect → pause ranges
  // 2. Claude transcribes the audio (using asr-transcribe-to-text skill if
  //    installed, otherwise whatever local transcription it can run) and
  //    finds filler words / false starts / repeated takes
  // 3. Claude double-checks the proposed cuts against the transcript before
  //    returning the final list
  // Cancel an in-flight autocut — kill the claude subprocess
  if (req.method === 'POST' && req.url === '/autocut-cancel') {
    let killed = false;
    if (_activeAutocut) {
      try { _activeAutocut.kill('SIGKILL'); killed = true; } catch {}
      _activeAutocut = null;
      broadcastProgressDone();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, killed }));
    return;
  }

  if (req.method === 'POST' && req.url === '/autocut') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const { clipPath, clipDuration, useTranscript } = payload;
      if (!clipPath) { res.writeHead(400); res.end('{"error":"missing clipPath"}'); return; }
      if (!fs.existsSync(clipPath)) { res.writeHead(404); res.end('{"error":"file not found"}'); return; }

      try {
        // Silence-only by default. Fast, reliable, doesn't involve Claude.
        // useTranscript is opt-in from Settings (false until user enables it).
        broadcastProgress('Detecting silences', 5);
        const silenceCuts = await detectSilences(clipPath, clipDuration, (p) => {
          // ffmpeg progress 0..1 → 5..95% in silence-only mode
          broadcastProgress('Detecting silences', 5 + p * 90);
        });

        let finalCuts = silenceCuts;
        let transcribed = false;
        let summary = silenceCuts.length
          ? ('Found ' + silenceCuts.length + ' pauses. Cutting ' + silenceCuts.reduce((s,c) => s + (c.end-c.start), 0).toFixed(1) + 's total.')
          : 'No pauses detected.';

        if (useTranscript) {
          // Opt-in transcript pass — Claude analyses for fillers / false starts
          broadcastProgress('Transcribing audio', 25);
          const analysisResult = await transcriptAnalyse(clipPath, clipDuration, silenceCuts);
          if (analysisResult.cuts && analysisResult.cuts.length) {
            finalCuts = analysisResult.cuts;
            transcribed = !!analysisResult.transcribed;
            summary = analysisResult.summary || summary;
          }
        }

        let totalCut = 0;
        for (const c of finalCuts) totalCut += (c.end - c.start);

        broadcastProgressDone();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          cuts: finalCuts,
          totalCut,
          transcribed,
          summary,
          method: transcribed ? 'silence+transcript' : 'silence-only',
        }));
      } catch (e) {
        broadcastProgressDone();
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e) })); } catch {}
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

// Auto-update — on launch, the bridge pulls the latest panel + bridge files
// from GitHub raw. Diff against on-disk; rewrite only if changed. Skip with
// CLAUDE_BRIDGE_NO_UPDATE=1 in the environment.
const GITHUB_RAW = 'https://raw.githubusercontent.com/iprincemax72-maker/claude-extension-premiere-pro-2026/main';
const UPDATE_TARGETS = [
  { url: GITHUB_RAW + '/extension/com.claudebridge.panel/index.html',     dest: path.join(PANEL_DIR, 'index.html'),     label: 'panel UI' },
  { url: GITHUB_RAW + '/extension/com.claudebridge.panel/jsx/host.jsx',   dest: path.join(PANEL_DIR, 'jsx', 'host.jsx'), label: 'ExtendScript', needsPremRestart: true },
  { url: GITHUB_RAW + '/extension/com.claudebridge.panel/CSXS/manifest.xml', dest: path.join(PANEL_DIR, 'CSXS', 'manifest.xml'), label: 'manifest' },
  { url: GITHUB_RAW + '/bridge/bridge.js',                                 dest: __filename, label: 'bridge', needsBridgeRestart: true },
];

async function checkForUpdates() {
  const result = { ok: true, updated: [], bridgeChanged: false, premiereRestartNeeded: false, skipped: false };
  if (process.env.CLAUDE_BRIDGE_NO_UPDATE === '1') {
    console.log('Auto-update skipped (CLAUDE_BRIDGE_NO_UPDATE=1).\n');
    result.skipped = true;
    return result;
  }
  if (typeof fetch !== 'function') {
    console.log('Auto-update skipped — Node fetch unavailable (upgrade to Node 18+).\n');
    result.skipped = true;
    result.error = 'fetch unavailable';
    return result;
  }
  console.log('Checking for updates…');
  for (const target of UPDATE_TARGETS) {
    try {
      const r = await fetch(target.url + '?t=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
      if (!r.ok) continue;
      const remote = Buffer.from(await r.arrayBuffer());
      let local = null;
      try { local = fs.readFileSync(target.dest); } catch {}
      if (!local || !local.equals(remote)) {
        fs.mkdirSync(path.dirname(target.dest), { recursive: true });
        fs.writeFileSync(target.dest, remote);
        result.updated.push(target.label);
        if (target.needsBridgeRestart) result.bridgeChanged = true;
        if (target.needsPremRestart) result.premiereRestartNeeded = true;
      }
    } catch (e) {
      console.error('  update check failed for ' + target.label + ': ' + e.message);
    }
  }
  if (!result.updated.length) {
    console.log('Up to date.\n');
    return result;
  }
  console.log('Updated ' + result.updated.length + ' file' + (result.updated.length === 1 ? '' : 's') + ':');
  result.updated.forEach(label => console.log('  • ' + label));
  if (result.bridgeChanged) {
    console.log('\n!! Bridge itself was updated. Close this terminal and re-launch the bridge to load the new version.');
  }
  if (result.premiereRestartNeeded) {
    console.log('!! ExtendScript was updated — host.jsx hot-reload should pick it up automatically.');
  }
  console.log('');
  return result;
}

// Manual update trigger from the panel
async function handleUpdateRequest(req, res) {
  try {
    const result = await checkForUpdates();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500); res.end(JSON.stringify({ ok: false, error: String(e) }));
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('Claude Bridge v2 running at http://localhost:' + PORT);
  console.log('Session ID: ' + SESSION_ID);
  console.log('Work dir:   ' + WORK_DIR);
  console.log('Output dir: ' + OUTPUT_DIR);
  console.log('Open Premiere Pro → Window → Extensions → Claude');
  console.log('(keep this terminal open)\n');
  checkForUpdates().catch(e => console.error('Update check error:', e.message));
});
