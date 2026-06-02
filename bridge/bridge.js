#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3737;
const SESSION_ID = crypto.randomUUID();
// WORK_DIR pins to wherever bridge.js itself lives, so the bridge always
// finds the remotion-intro project sitting next to it — even if the user
// has moved/renamed the parent folder. Override with the env var if you
// need to point it somewhere else.
const WORK_DIR = process.env.CLAUDE_BRIDGE_WORK_DIR || __dirname;
const OUTPUT_DIR = path.join(WORK_DIR, 'output');
const PANEL_DIR = (process.platform === 'win32')
  ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Adobe', 'CEP', 'extensions', 'com.claudebridge.panel')
  : path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions', 'com.claudebridge.panel');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────
// CRASH GUARDS — a single bad request must NOT take down the whole bridge.
// Without these, an uncaught error or unhandled promise rejection in ANY
// handler (e.g. when several renders run at once and one throws) crashes the
// entire node process, killing EVERY other in-flight request with a "Failed
// to fetch". For a local single-process bridge, staying up and logging beats
// crashing everyone's work — so we log and keep serving.
// ─────────────────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  try { console.error('[uncaughtException] kept bridge alive:\n' + (err && err.stack || err)); } catch {}
  try { if (typeof clog === 'function') clog('bridge', 'error', 'uncaughtException (kept alive)', { err: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 1400) }); } catch {}
});
process.on('unhandledRejection', (reason) => {
  try { console.error('[unhandledRejection] kept bridge alive:\n' + (reason && reason.stack || reason)); } catch {}
  try { if (typeof clog === 'function') clog('bridge', 'error', 'unhandledRejection (kept alive)', { reason: String(reason && reason.message || reason), stack: String(reason && reason.stack || '').slice(0, 1400) }); } catch {}
});

// ─────────────────────────────────────────────────────────────────────────
// UNIFIED LOG COLLECTOR
// One JSONL file that every module feeds into — panel, bridge, ExtendScript
// (host.jsx via the panel), and render subprocesses. Each line is a single
// JSON object: { t, session, module, level, msg, data?, reqId? }.
//
// Why: previously panel console.logs vanished into CEP's void, bridge logs
// went to bridge.log, host.jsx debug went nowhere, and renders wrote to
// per-request files. Debugging meant guessing. Now: read ONE file and see
// the whole story across modules, time-ordered.
//
// Modules log here via:
//   - bridge:        clog(module, level, msg, data, reqId)   [this file]
//   - panel:         POST /log  { module:'panel', level, msg, data }
//   - host.jsx:      panel forwards its debug/error to POST /log
//   - renders:       bridge routes their key events through clog()
//
// Read it via:  GET /logs/recent?n=300&module=panel&level=error
//           or:  tail -f ~/PremiereClaude/logs/unified.jsonl | jq .
//           or:  bash bridge/tail-logs.sh
// ─────────────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(WORK_DIR, 'logs');
const UNIFIED_LOG = path.join(LOG_DIR, 'unified.jsonl');
const LOG_MAX_BYTES = 5 * 1024 * 1024;   // rotate at 5 MB → unified.jsonl.1
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function _rotateLogIfNeeded() {
  try {
    const st = fs.statSync(UNIFIED_LOG);
    if (st.size > LOG_MAX_BYTES) {
      // Single-generation rotation — keep .1 as the previous chunk, overwrite.
      try { fs.renameSync(UNIFIED_LOG, UNIFIED_LOG + '.1'); } catch {}
    }
  } catch {}  // file doesn't exist yet → nothing to rotate
}

// Core writer. Synchronous append so log ordering is exact and a crash
// can't lose the line that explains the crash. Best-effort: never throws.
function clog(module, level, msg, data, reqId) {
  const rec = {
    t: new Date().toISOString(),
    session: SESSION_ID.slice(0, 8),
    module: module || 'bridge',
    level: level || 'info',     // debug | info | warn | error
    msg: String(msg == null ? '' : msg),
  };
  if (reqId) rec.reqId = String(reqId).slice(0, 12);
  if (data !== undefined) {
    try {
      // Cap serialized data so one giant payload can't bloat the log.
      let s = JSON.stringify(data);
      if (s && s.length > 4000) s = s.slice(0, 4000) + '…[truncated]';
      rec.data = s === undefined ? String(data) : JSON.parse(s);
    } catch {
      rec.data = String(data).slice(0, 4000);
    }
  }
  try {
    _rotateLogIfNeeded();
    fs.appendFileSync(UNIFIED_LOG, JSON.stringify(rec) + '\n');
  } catch {}
  // Mirror warn/error to the terminal so a human watching bridge.log still
  // sees the important stuff without tailing the JSONL.
  if (level === 'error') { try { console.error('  [' + rec.module + '] ' + rec.msg); } catch {} }
  else if (level === 'warn') { try { console.warn('  [' + rec.module + '] ' + rec.msg); } catch {} }
}

// Dev-mode live-reload removed — was causing the bridge to degrade after
// SSE clients accumulated (claude spawns hung after a few minutes of panel
// uptime). Production panels reload manually via Window → Extensions →
// Claude when needed.

// Track the currently-running autocut claude subprocess so /autocut-cancel
// can kill it cleanly. null when no autocut is in flight.
let _activeAutocut = null;

// AUTO EDIT — handle for the currently-running pipeline so /autoedit-cancel
// can kill it. Holds { children: Set<ChildProcess>, aborted: bool }.
let _activeAutoedit = null;

// Count of in-flight heavy requests (chat render / autoedit / autocut). The
// periodic auto-update uses this to avoid restarting the bridge mid-render.
let _heavyInflight = 0;
function _bridgeBusy() { return _heavyInflight > 0 || !!_activeAutoedit || !!_activeAutocut; }


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

// Resolve how to launch the Claude Code CLI as a child process.
//   macOS / Linux: `claude` is a normal executable on PATH → spawn it directly
//     (unchanged behaviour — { cmd:'claude', prefixArgs:[] }).
//   Windows: npm installs it as `claude.cmd` (a batch shim). Node's spawn can't
//     exec a .cmd directly, and routing our multi-KB --append-system-prompt arg
//     through a shell would mangle it. So we find the CLI's JS entry and run it
//     with the SAME node running this bridge — clean args, no shell, no console.
// Returns { cmd, prefixArgs, shell? }.
let _claudeTarget = null;
function resolveClaude() {
  if (_claudeTarget) return _claudeTarget;
  if (process.platform !== 'win32') { _claudeTarget = { cmd: 'claude', prefixArgs: [] }; return _claudeTarget; }
  // 1) a real claude.exe on PATH (native installer) — spawn it directly
  try {
    const dirs = (process.env.PATH || process.env.Path || '').split(';');
    for (const d of dirs) {
      if (!d) continue;
      const exe = path.join(d, 'claude.exe');
      try { if (fs.existsSync(exe)) { _claudeTarget = { cmd: exe, prefixArgs: [] }; return _claudeTarget; } } catch {}
    }
  } catch {}
  // 2) npm global install → run the package's bin .js with node directly
  const roots = [];
  if (process.env.APPDATA) roots.push(path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code'));
  roots.push(path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code'));
  if (process.env.ProgramFiles) roots.push(path.join(process.env.ProgramFiles, 'nodejs', 'node_modules', '@anthropic-ai', 'claude-code'));
  for (const root of roots) {
    try {
      const pj = path.join(root, 'package.json');
      if (!fs.existsSync(pj)) continue;
      const bin = (JSON.parse(fs.readFileSync(pj, 'utf8')) || {}).bin;
      let rel = (typeof bin === 'string') ? bin : (bin && (bin.claude || Object.values(bin)[0]));
      if (!rel) rel = 'cli.js';
      const js = path.join(root, rel);
      if (fs.existsSync(js)) { _claudeTarget = { cmd: process.execPath, prefixArgs: [js] }; return _claudeTarget; }
    } catch {}
  }
  // 3) last resort — claude.cmd via a shell (large args may suffer, but better
  //    than a hard ENOENT that breaks every request)
  _claudeTarget = { cmd: 'claude', prefixArgs: [], shell: true };
  return _claudeTarget;
}
// Drop-in replacement for the old spawn('claude', args, opts) — uses the
// resolved launcher and hides the console window on Windows.
function spawnClaude(args, opts) {
  const t = resolveClaude();
  const o = Object.assign({}, opts);
  if (t.shell) o.shell = true;
  if (process.platform === 'win32') o.windowsHide = true;
  return spawn(t.cmd, t.prefixArgs.concat(args || []), o);
}

// Run ffmpeg silencedetect and return parsed pause ranges.
// `onProgress(0..1)` fires as ffmpeg's "time=" reports advance through the clip.
function detectSilences(clipPath, clipDuration, onProgress) {
  return new Promise((resolve, reject) => {
    // Tuned middle ground. -30dB:0.6 was too aggressive (cut a 16-min clip to
    // 2 min — caught quiet speech as silence). -45dB:1.5 was too soft (same
    // clip only went to 11 min). -35dB:0.7 sits between: -35dB ignores quiet
    // speech but still catches genuine dead air, and d=0.7 trims real pauses
    // (0.7s+) without nuking every natural half-second breath.
    const args = ['-i', clipPath, '-af', 'silencedetect=noise=-35dB:d=0.7', '-f', 'null', '-'];
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

// Extract clip audio to a 16kHz mono WAV (what parakeet-mlx ingests), trimmed
// to [inP, outP] of the source. Returns path to the temp wav.
function extractAudioForTranscription(clipPath, inP, outP) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(OUTPUT_DIR, '_autocut_audio_' + Date.now() + '.wav');
    const args = [
      '-y', '-ss', String(inP), '-to', String(outP),
      '-i', clipPath,
      '-ac', '1', '-ar', '16000',
      outPath,
    ];
    const ff = spawn(FFMPEG_BIN, args);
    let stderr = '';
    ff.stderr.on('data', d => stderr += d.toString().slice(-2000));
    const killer = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} reject(new Error('audio extract timeout')); }, 90000);
    ff.on('error', e => { clearTimeout(killer); reject(e); });
    ff.on('close', code => {
      clearTimeout(killer);
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error('ffmpeg extract exit ' + code + ': ' + stderr.slice(-300)));
    });
  });
}

// Find the parakeet-mlx CLI. Installed via `uv tool install parakeet-mlx`
// which puts it in ~/.local/bin.
function resolveParakeet() {
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'parakeet-mlx'),
    '/opt/homebrew/bin/parakeet-mlx',
    '/usr/local/bin/parakeet-mlx',
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  // Last resort — let PATH find it
  return 'parakeet-mlx';
}

// NVIDIA Parakeet TDT via parakeet-mlx — runs natively on Apple Silicon,
// ~20x realtime, leaderboard-#1 accuracy for English, clean punctuation +
// sentence-level segments with confidence. Returns segments in the
// { start, end, text } shape downstream code expects.
function runParakeet(wavPath, audioDuration) {
  return new Promise((resolve, reject) => {
    const bin = resolveParakeet();
    const outDir = path.dirname(wavPath);
    const baseName = path.basename(wavPath, path.extname(wavPath));
    const jsonOut = path.join(outDir, baseName + '.json');
    try { fs.unlinkSync(jsonOut); } catch {}

    const args = ['--output-format', 'json', '--output-dir', outDir, wavPath];
    const proc = spawn(bin, args, { env: process.env });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString().slice(-2000));
    proc.stdout.on('data', () => {}); // drain

    // ~20x realtime cached; first run downloads the model (~600MB) and takes
    // longer. Cap is generous to absorb the first-run download case.
    const cap = Math.min(15 * 60 * 1000, Math.max(120000, audioDuration * 800 + 60000));
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error('parakeet timeout after ' + Math.round(cap / 1000) + 's'));
    }, cap);

    proc.on('error', e => { clearTimeout(killer); reject(e); });
    proc.on('close', code => {
      clearTimeout(killer);
      if (code !== 0 || !fs.existsSync(jsonOut)) {
        reject(new Error('parakeet exit ' + code + ': ' + stderr.slice(-300)));
        return;
      }
      try {
        const j = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
        const segs = (j.sentences || []).map(s => ({
          start: typeof s.start === 'number' ? s.start : 0,
          end:   typeof s.end   === 'number' ? s.end   : 0,
          text:  (s.text || '').trim(),
        })).filter(s => s.text && s.end > s.start);
        try { fs.unlinkSync(jsonOut); } catch {}
        try { fs.unlinkSync(wavPath); } catch {}
        resolve(segs);
      } catch (e) {
        reject(new Error('parakeet json parse: ' + e.message));
      }
    });
  });
}

// Transcription is parakeet-mlx, period. If it's not installed, fail loud
// with the install command so the user knows exactly what to do — don't
// silently degrade to a worse engine.
async function runTranscribe(wavPath, audioDuration) {
  const bin = resolveParakeet();
  const found = bin && (bin.includes('/') ? fs.existsSync(bin) : false);
  if (!found) {
    throw new Error('parakeet-mlx is not installed. Install it with:  uv tool install parakeet-mlx');
  }
  console.log('  [transcribe] parakeet-mlx');
  return runParakeet(wavPath, audioDuration);
}

// Ask Claude (small, fast call) to scan the transcript for fillers + false
// starts. Claude doesn't need any tools — just reads text, returns JSON. So
// no hanging on tool I/O. 60s hard cap. Used only when useTranscript is true.
function analyseTranscriptWithClaude(transcript, opts) {
  opts = opts || {};
  const findFillers = (opts.findFillers !== undefined) ? !!opts.findFillers : true;
  const findRepeats = (opts.findRepeats !== undefined) ? !!opts.findRepeats : true;

  return new Promise(resolve => {
    if (!transcript || !transcript.length) return resolve({ cuts: [], summary: 'transcript empty' });
    if (!findFillers && !findRepeats) return resolve({ cuts: [], summary: 'nothing requested' });

    const transcriptText = transcript.map(s =>
      '[' + s.start.toFixed(2) + '-' + s.end.toFixed(2) + '] ' + s.text
    ).join('\n');

    // Build the "what to look for" section based on user opt-ins. Strong,
    // example-driven phrasing — especially for partial-word false starts
    // which the old prompt missed ("maybe it was th-" → "maybe it was the fear").
    const lookFor = [];
    if (findFillers) {
      lookFor.push(
        'FILLER words to remove:',
        '  - "um", "uh", "uhh", "umm", "er"',
        '  - "like" when used as a verbal tic (NOT "like a cat" — that\'s a real word)',
        '  - "you know", "I mean", "sorta", "kinda"',
        '  - "actually" / "basically" / "literally" when used redundantly',
        '  Cut a filler the moment you spot it. Include the trailing breath/pause if any.'
      );
    }
    if (findRepeats) {
      lookFor.push(
        'REPEATED SENTENCES, FALSE STARTS, SELF-CORRECTIONS, RAMBLING to remove:',
        '  Edit like a human editor making a tight final cut. Catch the clear',
        '  flubs and dead weight — but never cut something a viewer would miss.',
        '  - PARTIAL-WORD false start: "maybe it was th-" then "maybe it was the fear"',
        '    → cut "th-" and the gap before the restart.',
        '  - PHRASE / SENTENCE REDO: speaker says something, then says it again',
        '    better → cut the weaker first version (use its full start/end).',
        '  - SELF-CORRECTION: "the red car, no, the blue car" → cut "the red car, no,".',
        '  - REPEATED FILLER PHRASES: "so, so the thing is" → cut the first "so,".',
        '  - RAMBLING / DEAD WEIGHT: a long meandering aside that goes nowhere and',
        '    the speaker clearly abandons → cut it.',
        '  - HESITATION RESTART: word said, long pause, said again → cut the first.',
        '  Keep each cut tight to the flubbed span. DO cut redo sentences fully,',
        '  but NEVER cut a coherent sentence just because a later one is on a',
        '  similar topic, and NEVER cut deliberate rhetorical repetition.'
      );
    }

    const userMsg = [
      'Here is a transcript of a talking-head clip, broken into short phrase',
      'segments. Each line is [start-end in seconds] followed by the words said',
      'in that span.',
      '',
      transcriptText.slice(0, 16000), // bumped cap — longer clips need full context
      '',
      'Find UNWANTED spans to cut out:',
      '',
      ...lookFor,
      '',
      'TIMESTAMP RULES:',
      '- Each cut\'s start/end must fall WITHIN the [start-end] range of the',
      '  segment(s) it covers. If a false start is the first half of a segment,',
      '  estimate the split point proportionally inside that segment\'s range.',
      '- For a redo, cut the WHOLE weaker version (its full start to end). For a',
      '  partial-word flub, keep the cut tight to the flubbed words.',
      '- NEVER cut deliberate rhetorical repetition (e.g. "when you lose,',
      '  especially when you lose" is intentional emphasis — do NOT cut).',
      '- Aim for a tight final cut — be willing to cut, but every cut must be a',
      '  genuine flub, redo, filler or abandoned ramble, not real content.',
      '',
      'Output EXACTLY this JSON, nothing else (no prose, no fences, no commentary):',
      '{"cuts":[{"start":2.30,"end":3.10,"kind":"false_start","reason":"truncated word \'th-\' before restart"}],"summary":"Found 3 fillers and 5 false starts."}',
      '',
      '"kind" must be: filler | false_start | mistake. start and end are seconds.',
    ].join('\n');

    const sysPrompt = 'You are a skilled video editor cleaning up a talking-head clip. Return ONLY valid JSON. No tool use — just read the transcript and emit cut ranges. Edit like a human making a tight final cut: confidently remove clear flubs, redos, fillers and abandoned rambles — but never cut coherent real content or deliberate rhetorical repetition. An empty cut list is fine for genuinely clean speech.';

    // Pure text-in / JSON-out — Haiku is plenty and 3-5x faster than the
    // user's default model (which could be Opus and was timing out on
    // 12-minute transcripts). Force Haiku here.
    const args = [
      '-p',
      '--output-format', 'json',
      '--model', 'claude-haiku-4-5-20251001',
      '--permission-mode', 'bypassPermissions',
      '--append-system-prompt', sysPrompt,
      '--no-session-persistence',
      userMsg,
    ];

    // stdin 'ignore' — without it the claude CLI blocks waiting for stdin
    // ("no stdin data received in 3s") and times out without answering.
    // cwd is a temp dir so claude doesn't load the project CLAUDE.md.
    const log = opts.log || (() => {});
    const t0 = Date.now();
    const el = () => '+' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
    log(`analyseClaude: spawning claude, msgLen=${userMsg.length}, args=${JSON.stringify(args.slice(0, -1))}`);
    const proc = spawnClaude(args, {
      cwd: os.tmpdir(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    log(`analyseClaude: spawned pid=${proc.pid} ${el()}`);
    let stdoutBuf = '';
    let stderrBuf = '';
    let firstOut = false, firstErr = false;
    proc.stdout.on('data', d => {
      stdoutBuf += d.toString();
      if (!firstOut) { firstOut = true; log(`analyseClaude: first stdout byte ${el()}`); }
    });
    proc.stderr.on('data', d => {
      stderrBuf += d.toString();
      if (!firstErr) { firstErr = true; log(`analyseClaude: first stderr byte ${el()}: ${d.toString().slice(0, 200)}`); }
    });

    // claude is NOT hung when this fires — measured: a real 127-segment
    // transcript with the full aggressive prompt takes Haiku ~150-200s of
    // genuine analysis before it emits anything (json output mode buffers
    // until the end). The old 187s cap killed it ~right as it finished.
    // Give real headroom: 2 min base + 2.5s/segment, capped at 8 min.
    const timeoutMs = Math.min(480000, 120000 + transcript.length * 2500);
    let done = false;
    const finish = (result) => { if (done) return; done = true; clearTimeout(killer); resolve(result); };
    const killer = setTimeout(() => {
      log(`analyseClaude: TIMEOUT at ${el()} — killing pid=${proc.pid}. stdoutSoFar=${stdoutBuf.length}B stderrSoFar=${JSON.stringify(stderrBuf.slice(-400))}`);
      try { proc.kill('SIGKILL'); } catch {}
      finish({ cuts: [], summary: 'analysis timed out (' + Math.round(timeoutMs/1000) + 's)' });
    }, timeoutMs);

    // Parse the result. Called on whichever of exit/close fires first — if
    // claude leaves a stdio pipe open, 'close' never fires, so 'exit' is the
    // backstop.
    let parsedOnce = false;
    const handleEnd = (evt, code) => {
      if (parsedOnce) return;
      parsedOnce = true;
      log(`analyseClaude: ${evt} code=${code} ${el()} stdout=${stdoutBuf.length}B stderr=${JSON.stringify(stderrBuf.slice(-400))}`);
      let result = null;
      try { const j = JSON.parse(stdoutBuf); result = j.result || j.text; } catch {}
      if (!result) { log('analyseClaude: no parseable result field'); return finish({ cuts: [], summary: null }); }
      let parsed = null;
      try { parsed = JSON.parse(result); } catch {}
      if (!parsed) {
        const m = result.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed || !Array.isArray(parsed.cuts)) { log('analyseClaude: result had no cuts array'); return finish({ cuts: [], summary: null }); }
      log(`analyseClaude: parsed ${parsed.cuts.length} cuts ok`);
      finish(parsed);
    };

    proc.on('error', (e) => { log(`analyseClaude: spawn ERROR ${el()}: ${e}`); finish({ cuts: [], summary: 'claude unavailable: ' + e }); });
    proc.on('exit', (code) => handleEnd('exit', code));
    proc.on('close', (code) => handleEnd('close', code));
  });
}

// Master transcript path — local parakeet + claude analyze. Replaces the old
// "Claude does everything" implementation that hung forever.
async function transcriptCutsLocal(clipPath, clipDuration, clipIn, clipOut, silenceCuts, reqId, opts) {
  opts = opts || {};
  const findFillers = (opts.findFillers !== undefined) ? !!opts.findFillers : true;
  const findRepeats = (opts.findRepeats !== undefined) ? !!opts.findRepeats : true;
  const log = opts.log || (() => {});

  const audioDur = (clipOut - clipIn) || clipDuration || 60;
  // 1. Extract audio chunk
  broadcastProgress('Extracting audio', 20, reqId);
  let wavPath;
  try { wavPath = await extractAudioForTranscription(clipPath, clipIn, clipOut); }
  catch (e) {
    log(`audio extract failed: ${e.message}`);
    console.log('  [autocut] audio extract failed: ' + e.message);
    return { cuts: silenceCuts, transcribed: false, summary: null };
  }

  // 2. Transcribe (parakeet-mlx)
  broadcastProgress('Transcribing', 35, reqId);
  let transcript;
  try { transcript = await runTranscribe(wavPath, audioDur); }
  catch (e) {
    log(`transcribe failed: ${e.message}`);
    console.log('  [autocut] transcribe failed: ' + e.message);
    try { fs.unlinkSync(wavPath); } catch {}
    return { cuts: silenceCuts, transcribed: false, summary: null };
  }
  console.log('  [autocut] parakeet transcribed ' + transcript.length + ' segments');
  log(`parakeet produced ${transcript.length} sentence segments`);
  // Dump the transcript so we can see exactly what Claude saw. Limit lines.
  for (let i = 0; i < Math.min(transcript.length, 500); i++) {
    const s = transcript[i];
    log(`  wd[${i}] ${s.start.toFixed(2)}-${s.end.toFixed(2)}: ${s.text}`);
  }

  // 3. Claude analyses the transcript (no tool use — just text in, JSON out)
  const progressLabel = findFillers && findRepeats ? 'Finding fillers + repeats'
                     : findRepeats ? 'Finding repeats / false starts'
                     :               'Finding fillers';
  broadcastProgress(progressLabel, 70, reqId);
  const analysis = await analyseTranscriptWithClaude(transcript, { findFillers, findRepeats, log });
  console.log('  [autocut] claude found ' + analysis.cuts.length + ' filler/false-start cuts');
  log(`Claude returned ${analysis.cuts.length} transcript cuts. summary=${analysis.summary || '(none)'}`);
  for (let i = 0; i < analysis.cuts.length; i++) {
    const c = analysis.cuts[i];
    log(`  cl[${i}] ${(c.start || 0).toFixed(2)}-${(c.end || 0).toFixed(2)} kind=${c.kind || '?'} reason=${(c.reason || '').slice(0, 100)}`);
  }

  // 4. Translate Claude's cuts (which are relative to clip start) back to
  //    source-time, then merge with silence cuts.
  const fillerCuts = analysis.cuts
    .filter(c => typeof c.start === 'number' && typeof c.end === 'number' && c.end > c.start)
    .map(c => ({
      start: c.start + clipIn,   // parakeet saw [clipIn, clipOut] audio, so 0 in transcript = clipIn in source
      end:   c.end   + clipIn,
      kind:  c.kind || 'filler',
      reason: c.reason || c.kind || 'cut',
    }));

  // Merge silence + filler, sort by start. Drop overlaps (silence wins).
  const merged = silenceCuts.concat(fillerCuts).sort((a, b) => a.start - b.start);
  const deduped = [];
  for (const c of merged) {
    const last = deduped[deduped.length - 1];
    if (last && c.start < last.end - 0.05) {
      // overlap — extend last to cover
      last.end = Math.max(last.end, c.end);
    } else {
      deduped.push({ ...c });
    }
  }

  return {
    cuts: deduped,
    transcribed: true,
    summary: analysis.summary ? (analysis.summary + ' + ' + silenceCuts.length + ' pauses.') : null,
  };
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

// Video containers that might carry an unwanted silent audio track from
// Remotion's default render. Pure motion-graphic overlays should never
// have audio; we strip it unconditionally so Premiere doesn't get a
// useless empty waveform on the source clip.
const VIDEO_STRIPABLE_EXTS = new Set([
  '.mp4', '.mov', '.m4v', '.mkv', '.avi', '.mts', '.mxf', '.webm',
]);

// Use ffprobe to detect any audio stream, then ffmpeg -c:v copy -an to
// strip it (fast, no re-encode). On any failure the original file is
// left untouched. Always resolves — non-destructive on errors.
function stripAudioInPlace(absPath) {
  return new Promise(resolve => {
    try {
      if (!absPath || !fs.existsSync(absPath)) { resolve(false); return; }
      const ext = path.extname(absPath).toLowerCase();
      if (!VIDEO_STRIPABLE_EXTS.has(ext)) { resolve(false); return; }
      const ffprobeBin = FFMPEG_BIN.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
      const probe = spawn(ffprobeBin, [
        '-v', 'error',
        '-select_streams', 'a',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
        absPath,
      ]);
      let pbuf = '';
      probe.stdout.on('data', d => pbuf += d.toString());
      probe.on('error', () => resolve(false));
      probe.on('close', () => {
        if (!pbuf.trim()) { resolve(false); return; }
        const tmpOut = absPath.replace(/\.([^.]+)$/, '.__noaudio.$1');
        const ff = spawn(FFMPEG_BIN, [
          '-y', '-i', absPath,
          '-c:v', 'copy', '-an',
          '-map_metadata', '0',
          tmpOut,
        ]);
        let stderr = '';
        ff.stderr.on('data', d => stderr += d.toString().slice(-1500));
        ff.on('error', () => { try { fs.unlinkSync(tmpOut); } catch {} resolve(false); });
        ff.on('close', code => {
          if (code === 0 && fs.existsSync(tmpOut)) {
            try {
              fs.renameSync(tmpOut, absPath);
              console.log('  audio stripped from ' + path.basename(absPath));
              resolve(true);
            } catch (e) {
              try { fs.unlinkSync(tmpOut); } catch {}
              resolve(false);
            }
          } else {
            try { fs.existsSync(tmpOut) && fs.unlinkSync(tmpOut); } catch {}
            resolve(false);
          }
        });
      });
    } catch (e) {
      resolve(false);
    }
  });
}

function ensurePremiereImportable(absPath) {
  return new Promise(async resolve => {
    try {
      if (!absPath || !fs.existsSync(absPath)) { resolve(absPath); return; }
      // Strip any audio track first — Claude's output should be pure
      // visual / overlay and never carry a silent waveform.
      await stripAudioInPlace(absPath);
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

// ═══════════════════════════════════════════════════════════════════════
//  AUTO EDIT — pipeline helpers
// ═══════════════════════════════════════════════════════════════════════

// Send sentence-level transcript to Claude and ask for a JSON list of
// "moments" — points in the video that deserve a motion graphic. Returns
// an array of Moment objects (see schema above the /autoedit endpoint).
function detectMoments(sentences, density, styleOverride, reqId, log, extraGuidance) {
  return new Promise((resolve) => {
    const targetCount = density === 'sparse' ? Math.max(3, Math.floor(sentences.length / 18))
                      : density === 'dense'  ? Math.max(8, Math.floor(sentences.length / 6))
                      : density === 'full'   ? Math.max(12, Math.floor(sentences.length / 2))
                      :                        Math.max(5, Math.floor(sentences.length / 10));
    const isFull = density === 'full';

    // Cap the prompt size — Claude struggles with very long transcripts AND
    // the 0%-CPU hang risk goes up the bigger the prompt. For >600-sentence
    // transcripts we sample down: keep every Nth sentence so coverage is
    // even across the full video. The exact text gets trimmed but timestamps
    // are still real, so the moments land at the right spots.
    const MAX_SENTS = 600;
    let sentsForPrompt = sentences;
    if (sentences.length > MAX_SENTS) {
      const stride = Math.ceil(sentences.length / MAX_SENTS);
      sentsForPrompt = sentences.filter((_, i) => i % stride === 0);
      log && log(`transcript ${sentences.length} sentences → sampled to ${sentsForPrompt.length} (stride ${stride}) for Claude`);
    }
    const transcriptForClaude = sentsForPrompt.map(s =>
      `[${s.i}] ${s.text}`
    ).join('\n');

    const system = [
      'You are a motion-graphics editor reviewing a transcript of a video clip.',
      'You decide where on-screen text/graphics would HELP the viewer — not where to flex.',
      '',
      'Each transcript line is:  [N] the words spoken   — N is the line index.',
      '',
      'Output a JSON array of "moments". Each moment is an opportunity for a motion graphic.',
      'Each moment is an object: { id, type, startIndex, endIndex, label, payload, confidence }',
      '  startIndex / endIndex = the [N] line numbers this moment covers. For a',
      '  single-line moment, startIndex === endIndex. NEVER output seconds — only',
      '  the integer [N] line indices straight from the transcript.',
      '',
      'Moment types (pick the BEST fit; do not stretch to fit):',
      '  - stat       : a specific number/percentage/measurement was stated. payload: { number: "43%", subject: "growth" }',
      '  - quote      : a thesis/punchline/memorable line. payload: { text: "the quote", attribution: "Speaker name or empty" }',
      '  - name       : a person\'s name is introduced. payload: { name: "Jane Doe", subtitle: "role or empty" }',
      '  - list       : the speaker enumerates 2-5 items. payload: { items: ["one", "two", "three"] }',
      '  - callout    : a single emphasis word/phrase deserves a sticker badge. payload: { text: "KEY POINT" }',
      '  - question   : a rhetorical question the speaker poses. payload: { text: "the question" }',
      '  - section    : a topic shift / new chapter. payload: { title: "what comes next" }',
      '  - fact       : a supporting fact worth a small side card. payload: { text: "the fact" }',
      '',
      'RULES:',
      (isFull
        ? '  1. FULL-COVERAGE MODE: cover the ENTIRE timeline with NO gaps. Every span of speech gets a moment. Where something "key" happens (a stat, name, list, quote) use that special type. Where the speaker is just talking with nothing special, STILL make a moment — use type "fact", "callout", or "quote" with the best short phrase from that span. Leave NO gap longer than 2.5 seconds anywhere in the video.'
        : '  1. You MUST return about ' + targetCount + ' moments — spread them across the whole transcript. This is not optional. Even ordinary conversational speech has lines worth a graphic: a punchy line is a "quote", an emphasis phrase is a "callout", any informative statement is a "fact", a rhetorical question is a "question". If there is no stat/name/list, fall back to quote/callout/fact — there is ALWAYS something. An empty or near-empty array is a FAILURE.'),
      '  2. Return approximately ' + targetCount + ' moments total — not far fewer.',
      (isFull
        ? '  3. confidence: in full-coverage mode include everything, even confidence ~0.4.'
        : '  3. confidence is 0..1. Aim high, but it is fine to include solid picks at ~0.5 to reach the target count. The user WANTS graphics on this video.'),
      '  4. startIndex/endIndex are the [N] line numbers from the transcript — integers, not seconds.',
      '  5. id is a short unique string like "m1", "m2", etc.',
      '  6. label is a 2-6 word human description for logs.',
      '  7. The audio plays normally underneath — the graphic SUPPORTS the speech, doesn\'t replace it.',
      '  8. OUTPUT FORMAT — this is critical: output ONE moment per line, each',
      '     line a COMPLETE compact single-line JSON object. NO array brackets,',
      '     NO commas between lines, NO markdown fences, NO prose. Keep payload',
      '     strings short and plain (no double-quote characters inside them).',
      '     Exactly like this (one object per line):',
      '     {"id":"m1","type":"callout","startIndex":2,"endIndex":3,"label":"Key point","payload":{"text":"THE BIG IDEA"},"confidence":0.8}',
      '     {"id":"m2","type":"fact","startIndex":5,"endIndex":6,"label":"Supporting fact","payload":{"text":"a short fact"},"confidence":0.7}',
    ].join('\n') + (extraGuidance ? '\n\n' + extraGuidance : '');

    const user = 'TRANSCRIPT (one line per spoken segment, [N] is the line index):\n' + transcriptForClaude;
    const fullPrompt = system + '\n\n' + user;

    let stdout = '';
    let stderr = '';
    // Resolve claude: use $CLAUDE_CLI if set, otherwise bare 'claude' so the
    // shell PATH does the lookup (CEP minimal PATH gets extended below).
    const claudePath = process.env.CLAUDE_CLI || 'claude';
    const extendedPath = [
      process.env.PATH || '',
      '/Users/anshdhakad/.local/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
    ].filter(Boolean).join(':');
    // stdio: stdin MUST be 'ignore' — otherwise the claude CLI sits waiting
    // for stdin ("no stdin data received in 3s") and the idle watchdog kills
    // it before it answers. cwd is a temp dir, not WORK_DIR, so claude
    // doesn't load the project's CLAUDE.md (which tells it to go read the
    // Remotion skill files — irrelevant to a pure text→JSON task and a
    // source of multi-minute stalls). Haiku + bypassPermissions keep it
    // fast and unblocked.
    const proc = spawn(claudePath, [
      '-p', fullPrompt,
      '--output-format', 'text',
      '--model', 'claude-haiku-4-5-20251001',
      '--permission-mode', 'bypassPermissions',
      '--no-session-persistence',
    ], {
      env: { ...process.env, PATH: extendedPath },
      cwd: os.tmpdir(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (_activeAutoedit) _activeAutoedit.children.add(proc);

    // Hard timeout. claude does genuine heavy analysis here — with json/text
    // output it buffers and emits nothing until the end, which can take
    // 150-250s on a long transcript. 2 min base + 2.5s/sentence, cap 8 min.
    const timeoutMs = Math.min(480000, 120000 + sentences.length * 2500);
    const killer = setTimeout(() => {
      log(`moments HARD TIMEOUT (${timeoutMs}ms) — killing claude`);
      try { proc.kill('SIGKILL'); } catch {}
    }, timeoutMs);

    // Idle watchdog — only a TRUE hang (0% CPU, no output for minutes) should
    // trip this. claude legitimately produces no output for 2-3 min while
    // analysing, so this must be well above that or it kills good runs.
    const IDLE_MS = 300000;
    let lastOutputAt = Date.now();
    const idleCheck = setInterval(() => {
      if (Date.now() - lastOutputAt > IDLE_MS) {
        log(`moments IDLE WATCHDOG — no output for ${IDLE_MS}ms, killing claude (hang detected)`);
        try { proc.kill('SIGKILL'); } catch {}
        clearInterval(idleCheck);
      }
    }, 5000);

    const _mt0 = Date.now();
    const _mel = () => '+' + ((Date.now() - _mt0) / 1000).toFixed(1) + 's';
    let _mFirstOut = false;
    log(`moments: spawned pid=${proc.pid}`);
    proc.stdout.on('data', d => {
      stdout += d; lastOutputAt = Date.now();
      if (!_mFirstOut) { _mFirstOut = true; log(`moments: first stdout byte ${_mel()}`); }
    });
    proc.stderr.on('data', d => { stderr += d; lastOutputAt = Date.now(); });

    // handleEnd runs on whichever of exit/close fires first. If claude leaves
    // a stdio pipe open, 'close' never fires — 'exit' is the backstop.
    let _mDone = false;
    const handleEnd = (evt, code) => {
      if (_mDone) return;
      _mDone = true;
      clearInterval(idleCheck);
      clearTimeout(killer);
      if (_activeAutoedit) _activeAutoedit.children.delete(proc);
      log(`moments: ${evt} code=${code} ${_mel()} stdout=${stdout.length}B`);
      if (stderr) log('moments stderr: ' + stderr.slice(-500));
      log('moments RAW stdout: ' + JSON.stringify(stdout.slice(0, 600)));

      // Multi-strategy parse. Claude's big nested JSON arrays kept breaking
      // mid-output (one unescaped quote killed all moments). So we ask for
      // JSONL (one compact object per line) and parse defensively:
      //   1) JSONL — parse each line independently; a bad line loses only
      //      itself.  2) fall back to a whole-array parse.  3) fall back to
      //      object-by-object regex recovery.
      let parsed = [];
      for (const rawLine of stdout.split('\n')) {
        let t = rawLine.trim();
        if (!t || t[0] !== '{') continue;
        t = t.replace(/,\s*$/, '');           // tolerate a trailing comma
        try {
          const m = JSON.parse(t);
          if (m && typeof m.type === 'string') parsed.push(m);
        } catch (_) { /* skip just this line */ }
      }
      if (parsed.length) {
        log('moments parsed ' + parsed.length + ' via JSONL');
      } else {
        const arrM = stdout.match(/\[[\s\S]*\]/);
        if (arrM) {
          try {
            const a = JSON.parse(arrM[0]);
            if (Array.isArray(a)) parsed = a.filter(m => m && typeof m.type === 'string');
          } catch (_) { /* fall through */ }
        }
        if (!parsed.length) {
          const objs = stdout.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
          for (const o of objs) {
            try { const m = JSON.parse(o); if (m && typeof m.type === 'string') parsed.push(m); }
            catch (_) {}
          }
          log('moments recovered ' + parsed.length + ' via object-regex');
        } else {
          log('moments parsed ' + parsed.length + ' via array fallback');
        }
      }
      if (!Array.isArray(parsed)) parsed = [];
      log('moments after parse: ' + parsed.length + ' (before sanity filter)');

      // Resolve startIndex/endIndex -> real seconds. Claude reliably says
      // "this moment covers line 3" but does NOT reliably copy float
      // timestamps (it was returning 0.0 for everything). So it now returns
      // line indices and we look up the true startSec/endSec here.
      parsed = parsed.map(m => {
        if (!m || typeof m !== 'object') return m;
        let si = (typeof m.startIndex === 'number') ? m.startIndex
               : (typeof m.endIndex === 'number') ? m.endIndex : null;
        let ei = (typeof m.endIndex === 'number') ? m.endIndex : si;
        if (si === null) return m; // leave as-is; sanity filter will drop it
        si = Math.max(0, Math.min(sentences.length - 1, Math.round(si)));
        ei = Math.max(si, Math.min(sentences.length - 1, Math.round(ei)));
        const a = sentences[si], b = sentences[ei];
        if (a && b && typeof a.startSec === 'number' && typeof b.endSec === 'number') {
          m.startSec = a.startSec;
          m.endSec = b.endSec;
        }
        return m;
      });
      // Sanity filter
      parsed = parsed.filter(m =>
        m && typeof m === 'object'
        && typeof m.type === 'string'
        && typeof m.startSec === 'number'
        && typeof m.endSec === 'number'
        && m.startSec < m.endSec
        && m.endSec - m.startSec < 30
        // 0.4 floor (was 0.6): the prompt now intentionally lets Claude
        // include solid ~0.5 picks to hit the target count. A 0.6 floor
        // was silently dropping them and leaving the user with 0 graphics.
        && (m.confidence == null || m.confidence >= 0.4)
      );
      log(`moments: parsed ${parsed.length} moments`);
      resolve(parsed);
    };
    proc.on('exit', (code) => handleEnd('exit', code));
    proc.on('close', (code) => handleEnd('close', code));
    proc.on('error', (e) => { log('moments spawn err: ' + e.message); clearInterval(idleCheck); clearTimeout(killer); if (!_mDone) { _mDone = true; resolve([]); } });
  });
}

// ════════════════════════════════════════════════════════════════════════
//  AUTO-EDIT v2 — interview → plan → fit-check, plus multi-segment audio.
// ════════════════════════════════════════════════════════════════════════

// In-memory transcript cache so /autoedit/analyze (transcribe + ask) and
// /autoedit/run (plan + generate) don't transcribe twice. Pruned by age/size.
const _autoeditCache = new Map();   // reqId -> { sentences, span, density, style, createdAt }
function _aeCacheSet(reqId, val) {
  val.createdAt = Date.now();
  _autoeditCache.set(reqId, val);
  // prune: drop >30min old, then cap to 20 newest
  const now = Date.now();
  for (const [k, v] of _autoeditCache) if (now - (v.createdAt || 0) > 30 * 60 * 1000) _autoeditCache.delete(k);
  if (_autoeditCache.size > 20) {
    const oldest = [..._autoeditCache.entries()].sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0));
    for (let i = 0; i < oldest.length - 20; i++) _autoeditCache.delete(oldest[i][0]);
  }
}

// One-shot Haiku text call (no tools, no session) — used for the interview
// questions and the plan fit-check. Returns raw stdout (best-effort; '' on
// failure so callers degrade gracefully). Registered as an _activeAutoedit
// child so ESC cancels it.
function runClaudeText(promptStr, timeoutMs, log, label) {
  return new Promise((resolve) => {
    const claudePath = process.env.CLAUDE_CLI || 'claude';
    const extendedPath = [process.env.PATH || '', '/Users/anshdhakad/.local/bin', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':');
    const proc = spawn(claudePath, [
      '-p', promptStr,
      '--output-format', 'text',
      '--model', 'claude-haiku-4-5-20251001',
      '--permission-mode', 'bypassPermissions',
      '--no-session-persistence',
    ], { env: { ...process.env, PATH: extendedPath }, cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    if (_activeAutoedit) _activeAutoedit.children.add(proc);
    let out = '', err = '', done = false;
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, timeoutMs);
    proc.stdout.on('data', d => out += d);
    proc.stderr.on('data', d => err += d.toString().slice(-1000));
    const end = (code) => {
      if (done) return; done = true;
      clearTimeout(killer);
      if (_activeAutoedit) _activeAutoedit.children.delete(proc);
      log && log(`${label}: exit ${code} ${out.length}B` + (err ? ' stderr=' + err.slice(-200) : ''));
      resolve(out);
    };
    proc.on('exit', end); proc.on('close', end);
    proc.on('error', (e) => { if (done) return; done = true; clearTimeout(killer); log && log(`${label} spawn err ${e.message}`); resolve(''); });
  });
}

// Concrete, named visual styles. When the user picks "same style for the whole
// video" we lock ONE of these and feed it into every graphic prompt so all the
// overlays look like a single designed set (fixes "they all look the same /
// random"). When they pick "vary", each graphic gets its own look instead.
const STYLE_PRESETS = {
  minimal:   { palette: 'near-white text #F5F3EC over a subtle dark scrim, single warm accent #D97757', font: 'clean grotesk sans (Inter / Helvetica Neue), tight tracking', motion: 'gentle fades + small upward slides on soft springs', inout: 'fade + slide-up in, fade out' },
  energetic: { palette: 'high-contrast white + electric accent #FF4D2E, bold and punchy', font: 'heavy condensed sans, ALL-CAPS emphasis words', motion: 'fast spring pops, scale overshoot, quick staggered reveals', inout: 'scale/slam in, snap out' },
  editorial: { palette: 'paper #ECE7DD with ink #1A1916 and one red rule #C8312B', font: 'serif display headline + grotesk caption, magazine feel', motion: 'masked clip-wipes, baseline slides, measured timing', inout: 'mask/clip reveal in, wipe out' },
  luxury:    { palette: 'mocha #2A211C with champagne #C9A86A, low-key and refined', font: 'elegant serif with generous letter-spacing', motion: 'slow eases, soft blur-in, nothing abrupt', inout: 'blur + fade in, slow fade out' },
};
function buildStyleSpec(tone) {
  const p = STYLE_PRESETS[tone] || STYLE_PRESETS.minimal;
  return ['  - palette: ' + p.palette, '  - typography: ' + p.font, '  - motion feel: ' + p.motion, '  - entry/exit: ' + p.inout].join('\n');
}

// Turn the user's interview answers into a short guidance block appended to the
// moment-detection prompt. Style/tone are handled separately, so skip them.
function buildMomentGuidance(answers) {
  if (!answers || typeof answers !== 'object') return '';
  const bits = [];
  for (const k in answers) {
    // styleConsistency/tone drive the visual style, ratio drives the render
    // resolution — none of those should steer WHICH moments get picked. Only
    // the content-driven questions (ids like c1, c2) belong in moment guidance.
    if (k === 'styleConsistency' || k === 'tone' || k === 'ratio') continue;
    const v = answers[k];
    if (v && typeof v === 'string') bits.push(v);
  }
  return bits.length ? ('USER PREFERENCES — honor these when choosing moments:\n  - ' + bits.join('\n  - ')) : '';
}

// Read the transcript and ask the user a couple of SMART, content-based
// multiple-choice questions, on top of two fixed ones (style consistency +
// tone). Returns an array of { id, q, type, options:[{value,label}] }.
async function detectInterviewQuestions(sentences, density, log) {
  const fixed = [
    { id: 'styleConsistency', q: 'Same visual style across the whole video, or mix it up per moment?', type: 'single', options: [
      { value: 'same', label: 'Same style throughout — one consistent look' },
      { value: 'vary', label: 'Vary it per moment — different looks' },
    ] },
    { id: 'tone', q: 'Overall visual tone?', type: 'single', options: [
      { value: 'minimal',   label: 'Clean & minimal' },
      { value: 'energetic', label: 'Energetic & punchy' },
      { value: 'editorial', label: 'Bold editorial' },
      { value: 'luxury',    label: 'Luxury & moody' },
    ] },
    { id: 'ratio', q: 'Aspect ratio of the video?', type: 'single', options: [
      { value: '1920x1080', label: 'Landscape 16:9 (1920×1080)' },
      { value: '1080x1920', label: 'Vertical 9:16 (1080×1920)' },
      { value: '1080x1080', label: 'Square 1:1 (1080×1080)' },
      { value: '1080x1350', label: 'Portrait 4:5 (1080×1350)' },
    ] },
  ];
  try {
    const sample = sentences.slice(0, 220).map((s, i) => `[${i}] ${s.text}`).join('\n').slice(0, 8000);
    const system = [
      'You are a motion-graphics editor about to add on-screen graphics to a talking-head video.',
      'Read the transcript and ask UP TO 2 short multiple-choice questions whose answers would change HOW you edit — based on the ACTUAL content you see (the real topics, names, numbers, lists).',
      'Examples: if there is an enumerated list, ask whether to animate it as a checklist or skip it; if there are statistics, ask how prominent the numbers should be; if names/people are introduced, ask whether to add lower-third name tags.',
      'Do NOT ask about visual style, tone, colour, font, or density — those are decided separately. Content-driven questions ONLY.',
      'Output JSONL — ONE compact JSON object per line. No array, no prose, no markdown fences:',
      '{"id":"c1","q":"There\'s a 3-step list around the middle — show it as…","options":[{"value":"checklist","label":"Animated checklist"},{"value":"caption","label":"Just captions"},{"value":"skip","label":"Skip it"}]}',
      'Each question: 2-3 options, each with a short value and a human label. Max 2 questions. If the content is unremarkable, output NOTHING.',
    ].join('\n');
    const raw = await runClaudeText(system + '\n\nTRANSCRIPT:\n' + sample, 90000, log, 'interview');
    const content = [];
    for (const line of String(raw).split('\n')) {
      let t = line.trim();
      if (!t || t[0] !== '{') continue;
      t = t.replace(/,\s*$/, '');
      try {
        const o = JSON.parse(t);
        if (o && o.q && Array.isArray(o.options) && o.options.length >= 2) {
          o.id = 'c' + (content.length + 1);
          o.type = 'single';
          o.options = o.options.slice(0, 4).map(op => ({ value: String(op.value || op.label || ''), label: String(op.label || op.value || '') }));
          content.push({ id: o.id, q: String(o.q), type: 'single', options: o.options });
        }
      } catch {}
      if (content.length >= 2) break;
    }
    log && log(`interview: ${content.length} content questions generated`);
    return fixed.concat(content);
  } catch (e) {
    log && log('interview failed, using fixed questions only: ' + e.message);
    return fixed;
  }
}

// PLAN MODE — read the user's animation request and ask a few SMART
// multiple-choice questions (like the Auto-Edit interview, but driven by the
// build prompt instead of a transcript). Two fixed questions (aspect ratio +
// tone) plus up to 3 content-driven ones. Returns [{id,q,type,options:[{value,label}]}].
async function detectPlanQuestions(message, log) {
  const msg = String(message || '');
  // Fixed questions are CONDITIONAL — only ask what the prompt hasn't already
  // pinned down, so a fully-specified prompt doesn't get padded with noise.
  const hasRatio = /\b(16:9|9:16|1:1|4:5|4:3|\d{3,4}\s*[x×]\s*\d{3,4}|portrait|landscape|vertical|horizontal|square|widescreen|reel|tiktok|shorts?)\b/i.test(msg);
  const hasTone  = /\b(minimal|clean|luxur|elegant|energetic|punchy|bold|editorial|playful|corporate|retro|vintage|neon|cyber|moody|dark|aesthetic|cinematic|premium|sleek|modern|brutalist|grunge|vibe|style)\b/i.test(msg);
  const fixed = [];
  if (!hasRatio) fixed.push({ id: 'ratio', q: 'Aspect ratio?', type: 'single', options: [
    { value: '1920x1080', label: 'Landscape 16:9' },
    { value: '1080x1920', label: 'Vertical 9:16' },
    { value: '1080x1080', label: 'Square 1:1' },
    { value: '1080x1350', label: 'Portrait 4:5' },
  ] });
  if (!hasTone) fixed.push({ id: 'tone', q: 'Visual tone?', type: 'single', options: [
    { value: 'minimal',   label: 'Clean & minimal' },
    { value: 'energetic', label: 'Energetic & punchy' },
    { value: 'editorial', label: 'Bold editorial' },
    { value: 'luxury',    label: 'Luxury & moody' },
  ] });
  try {
    // The model decides HOW MANY content questions to ask, scaled to how
    // complex / ambiguous the request is — that's what the user asked for.
    const system = [
      'You are a senior motion-graphics designer about to build ONE Remotion animation for the user.',
      'Read their request and ask the clarifying multiple-choice questions whose answers would genuinely change HOW you design and animate it — based on the SPECIFIC request (the actual text, shapes, mood, content they mentioned).',
      '',
      'SCALE THE NUMBER OF QUESTIONS TO THE REQUEST — this is the most important rule:',
      '  • A short, simple, fully-specified request → ask 0-1 questions (or none).',
      '  • A normal request with a few open decisions → 2-3 questions.',
      '  • A big, vague, ambitious, or multi-part request → 4-6 questions.',
      'Use real judgment. Do NOT pad a simple prompt with filler questions, and do',
      'NOT under-ask on a complex one. Hard prompt = more questions; easy prompt = fewer.',
      '',
      'Make every question SMART and specific to THIS request — e.g. what element is',
      'the focal point, what animates in first, accent/border/glow treatment, what the',
      'background does, how it exits, which word gets emphasized, icon or no icon,',
      'pacing, color direction, layout. Never ask trivial yes/no filler.',
      'Do NOT ask about aspect ratio or overall visual tone — those are handled separately.',
      '',
      'Output JSONL — ONE compact JSON object per line. No array, no prose, no markdown fences:',
      '{"id":"c1","q":"The headline — how should each word arrive?","options":[{"value":"word","label":"One word at a time"},{"value":"all","label":"All together"},{"value":"char","label":"Letter by letter"}]}',
      'Each question: 2-4 options, each with a short value and a human label. Hard cap 6 questions.',
      'If the request is already fully specified, output NOTHING.',
    ].join('\n');
    const raw = await runClaudeText(system + '\n\nUSER REQUEST:\n' + msg.slice(0, 4000), 60000, log, 'planq');
    const content = [];
    for (const line of String(raw).split('\n')) {
      let t = line.trim();
      if (!t || t[0] !== '{') continue;
      t = t.replace(/,\s*$/, '');
      try {
        const o = JSON.parse(t);
        if (o && o.q && Array.isArray(o.options) && o.options.length >= 2) {
          o.id = 'c' + (content.length + 1);
          o.type = 'single';
          o.options = o.options.slice(0, 4).map(op => ({ value: String(op.value || op.label || ''), label: String(op.label || op.value || '') }));
          content.push({ id: o.id, q: String(o.q), type: 'single', options: o.options });
        }
      } catch {}
      if (content.length >= 6) break;
    }
    log && log(`planq: ${content.length} smart questions (${fixed.length} fixed) for ${msg.length}-char prompt`);
    return fixed.concat(content);
  } catch (e) {
    log && log('planq failed, using fixed only: ' + e.message);
    return fixed;
  }
}

// Double-check the plan FITS the video before the expensive generate step.
// (1) deterministic clamp — every moment must lie inside the span, have a
// positive duration, and not run past the end. (2) a light Claude review that
// drops clearly bad/duplicate picks and writes a one-line fit summary.
async function verifyPlan(moments, sentences, spanStart, spanEnd, log) {
  let m = (moments || [])
    .filter(x => x && typeof x.startSec === 'number' && typeof x.endSec === 'number')
    .map(x => {
      const st = Math.max(spanStart, x.startSec);
      let en = Math.min(spanEnd, x.endSec);
      if (en <= st) en = Math.min(spanEnd, st + 1.5);
      return { ...x, startSec: st, endSec: en };
    })
    .filter(x => x.endSec > x.startSec && x.startSec >= spanStart - 0.01 && x.startSec < spanEnd);

  let report = `Fit check: ${m.length} graphics, all inside the ${Math.round(spanEnd - spanStart)}s span.`;
  try {
    const list = m.map((x, i) => `${i}. [${x.startSec.toFixed(1)}-${x.endSec.toFixed(1)}s] ${x.type}: ${String(x.label || _momentPayloadText(x)).slice(0, 70)}`).join('\n');
    const sys = [
      `You are reviewing a motion-graphics edit plan for a ${Math.round(spanEnd - spanStart)}s video, BEFORE it is rendered.`,
      'For each graphic, decide if it FITS: timing is reasonable, it is not redundant with its immediate neighbours, and the label makes sense for that type.',
      'Return ONE JSON object only, nothing else: {"drop":[<indices to remove>],"note":"<one short sentence on the overall fit>"}.',
      'Be conservative — only drop clearly bad or duplicate graphics. An empty drop list is the normal, expected answer.',
    ].join('\n');
    const raw = await runClaudeText(sys + '\n\nPLAN:\n' + list, 90000, log, 'verify');
    const mt = String(raw).match(/\{[\s\S]*\}/);
    if (mt) {
      const v = JSON.parse(mt[0]);
      if (Array.isArray(v.drop) && v.drop.length) {
        // Only honour in-range integer indices — a hallucinated/1-based/float
        // index from the LLM must not silently drop the wrong graphic.
        const ds = new Set(v.drop.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < m.length));
        const kept = m.filter((_, i) => !ds.has(i));
        if (kept.length) m = kept;   // never let verify nuke the whole plan
      }
      if (v.note) report = `Fit check: ${String(v.note).slice(0, 160)} (${m.length} graphics)`;
    }
  } catch (e) { log && log('verify review skipped: ' + e.message); }
  return { moments: m, report };
}

// Extract + concatenate the audio of N timeline segments into ONE 16kHz mono
// WAV for transcription, and return a map so transcript times (relative to the
// concatenated wav) can be converted back to absolute TIMELINE seconds. This
// is what makes multi-clip selection and nested sequences work: each clip /
// nested sub-clip is one segment; their audio is stitched in timeline order.
async function extractConcatAudio(segments, reqId, log) {
  const tmpBase = path.join(OUTPUT_DIR, `_ae_${reqId.slice(0, 8)}`);
  const partPaths = [];
  const timeMap = [];
  let cum = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dur = Math.max(0, (Number(s.outSec) || 0) - (Number(s.inSec) || 0));
    if (dur < 0.05) continue;
    const out = `${tmpBase}_part${i}.wav`;
    await new Promise((res, rej) => {
      const args = ['-y', '-ss', String(s.inSec), '-to', String(s.outSec), '-i', s.path, '-ac', '1', '-ar', '16000', out];
      const ff = spawn(FFMPEG_BIN, args);
      let er = '';
      ff.stderr.on('data', d => er += d.toString().slice(-1500));
      const k = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} rej(new Error('segment extract timeout')); }, 120000);
      ff.on('error', e => { clearTimeout(k); rej(e); });
      ff.on('close', c => {
        clearTimeout(k);
        if (c === 0 && fs.existsSync(out)) { res(); return; }
        // Translate ffmpeg's cryptic failures into something a human can act on.
        const lc = (er || '').toLowerCase();
        let msg;
        if (/does not contain any stream|matches no streams|output file is empty|no audio/.test(lc)) {
          msg = 'This clip has no audio for Auto-Edit to read. Pick a clip with speech/sound (the one whose voice you want captioned) — not a silent graphics or HUD overlay.';
        } else if (/no such file|does not exist|cannot find|could not open .*input/.test(lc)) {
          msg = "Couldn't find this clip's media file on disk — it may have been moved or renamed.";
        } else {
          msg = "Couldn't read this clip's audio. The clip may have no audio track. (ffmpeg exit " + c + ")";
        }
        log && log('segment ffmpeg failed: ' + er.slice(-200));
        rej(new Error(msg));
      });
    });
    partPaths.push(out);
    timeMap.push({ concatStart: cum, dur, timelineStart: Number(s.timelineStart) || 0,
                   timelineDur: (Number(s.timelineDur) > 0 ? Number(s.timelineDur) : dur) });
    cum += dur;
  }
  if (!partPaths.length) throw new Error('no audio segments extracted');

  let wavPath;
  if (partPaths.length === 1) {
    wavPath = partPaths[0];
  } else {
    wavPath = `${tmpBase}_concat.wav`;
    const listFile = `${tmpBase}_list.txt`;
    fs.writeFileSync(listFile, partPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    await new Promise((res, rej) => {
      const ff = spawn(FFMPEG_BIN, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', wavPath]);
      let er = '';
      ff.stderr.on('data', d => er += d.toString().slice(-1500));
      const k = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} rej(new Error('concat timeout')); }, 120000);
      ff.on('error', e => { clearTimeout(k); rej(e); });
      ff.on('close', c => { clearTimeout(k); (c === 0 && fs.existsSync(wavPath)) ? res() : rej(new Error('concat exit ' + c + ': ' + er.slice(-200))); });
    });
    for (const p of partPaths) { try { fs.unlinkSync(p); } catch {} }
    try { fs.unlinkSync(listFile); } catch {}
  }
  log && log(`concat audio: ${segments.length} segs → ${cum.toFixed(1)}s wav`);
  return { wavPath, totalDur: cum, timeMap };
}
// Which concat segment a wav-time falls in (index into timeMap).
function concatSegIndex(timeMap, t) {
  for (let i = 0; i < timeMap.length; i++) {
    if (t < timeMap[i].concatStart + timeMap[i].dur + 0.001) return i;
  }
  return timeMap.length - 1;
}
// Map a time in the concatenated wav back to an absolute timeline second. The
// offset is clamped to the segment's own duration so a time never maps past the
// clip it belongs to (clips can be non-contiguous on the timeline).
function concatToTimeline(timeMap, t) {
  for (let i = 0; i < timeMap.length; i++) {
    const seg = timeMap[i];
    if (t < seg.concatStart + seg.dur + 0.001 || i === timeMap.length - 1) {
      const off = Math.max(0, Math.min(t - seg.concatStart, seg.dur));
      // Scale source-seconds → timeline-seconds for speed-changed clips
      // (1x clips: timelineDur == dur, so scale is 1).
      const scale = (seg.timelineDur > 0 && seg.dur > 0) ? (seg.timelineDur / seg.dur) : 1;
      return seg.timelineStart + off * scale;
    }
  }
  return t;
}

// Anti-collision + density cap. Sorts moments by start time, drops anything
// that lands within `minGapSec` of the previous kept moment, then caps the
// total to `maxPerMin × clipMinutes`.
function spaceMoments(moments, minGapSec, maxPerMin, totalDurSec) {
  const sorted = [...moments].sort((a, b) => a.startSec - b.startSec);
  const kept = [];
  let lastEnd = -Infinity;
  for (const m of sorted) {
    if (m.startSec - lastEnd < minGapSec) continue;
    kept.push(m);
    lastEnd = m.endSec;
  }
  const cap = Math.max(1, Math.floor((totalDurSec / 60) * maxPerMin));
  if (kept.length <= cap) return kept;
  // Drop the lowest-confidence ones until we're at the cap.
  return kept
    .map(m => ({ ...m, _conf: typeof m.confidence === 'number' ? m.confidence : 0.7 }))
    .sort((a, b) => b._conf - a._conf)
    .slice(0, cap)
    .sort((a, b) => a.startSec - b.startSec)
    .map(({ _conf, ...rest }) => rest);
}

// FULL-COVERAGE gap filler. Given the moments Claude found + the transcript
// + the clip's [inP, outP] window, guarantee NO gap longer than maxGapSec
// remains. Any uncovered span gets a "fact" moment built from the transcript
// text spoken during that span. The result: a motion graphic on screen the
// entire video — key beats keep their special cards, gaps get filled.
function fillGaps(moments, sentences, inP, outP, maxGapSec = 2.0) {
  const sorted = [...moments].sort((a, b) => a.startSec - b.startSec);
  const result = [];
  let cursor = inP;
  let fillIdx = 0;

  // Pull the speech text spoken during [from, to] from the transcript.
  const textForSpan = (from, to) => {
    const hits = sentences.filter(s => s.endSec > from + 0.1 && s.startSec < to - 0.1);
    let txt = hits.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    // Keep it short — a fill card shouldn't carry a paragraph. ~14 words max.
    const words = txt.split(' ');
    if (words.length > 14) txt = words.slice(0, 14).join(' ') + '…';
    return txt;
  };

  const makeFill = (from, to) => {
    const txt = textForSpan(from, to);
    if (!txt) return null;                       // silence — nothing to show
    if (to - from < 0.8) return null;            // too short to be worth a graphic
    return {
      id: 'fill_' + (fillIdx++),
      type: 'fact',
      startSec: from,
      endSec: to,
      label: 'gap fill',
      payload: { text: txt },
      confidence: 0.5,
      _isFill: true,
    };
  };

  for (const m of sorted) {
    if (m.startSec - cursor > maxGapSec) {
      const f = makeFill(cursor, m.startSec);
      if (f) result.push(f);
    }
    result.push(m);
    cursor = Math.max(cursor, m.endSec);
  }
  // Trailing gap after the last moment to the end of the clip.
  if (outP - cursor > maxGapSec) {
    const f = makeFill(cursor, outP);
    if (f) result.push(f);
  }
  return result.sort((a, b) => a.startSec - b.startSec);
}

// FULL coverage means literally no gaps: every second of [start,end] is under a
// graphic. fillGaps can't invent cards for silent spans (no transcript text),
// so for full density we tile instead — stretch each moment's end to where the
// next one begins. A graphic simply holds across the silence rather than the
// timeline showing bare video. First moment is pulled back to `start`, last is
// pushed to `end`.
function makeContiguous(moments, start, end) {
  const s = [...moments].sort((a, b) => a.startSec - b.startSec);
  if (!s.length) return s;
  s[0].startSec = Math.min(s[0].startSec, start);
  for (let i = 0; i < s.length; i++) {
    const nextStart = (i + 1 < s.length) ? s[i + 1].startSec : end;
    if (nextStart > s[i].endSec) s[i].endSec = nextStart;   // grow to close the gap
  }
  const last = s[s.length - 1];
  if (end > last.endSec) last.endSec = end;
  return s;
}

// Map a moment type + index → a recommended trend pack name. Rotates across
// moments so adjacent graphics don't share a style.
function momentTypeToTrendPack(type, idx) {
  const rotations = {
    stat:    ['statSlam', 'editorialBrutalist', 'newsTicker'],
    quote:   ['editorialBrutalist', 'mochaLuxury', 'darkAcademia'],
    name:    ['newsTicker', 'editorialBrutalist'],
    list:    ['tiktokKineticCaption', 'editorialBrutalist'],
    callout: ['confettiHype', 'glitchHype', 'tiktokKineticCaption'],
    question:['editorialBrutalist', 'darkAcademia'],
    section: ['editorialBrutalist', 'mochaLuxury'],
    fact:    ['tiktokKineticCaption', 'mochaLuxury'],
  };
  const list = rotations[type] || ['tiktokKineticCaption'];
  return list[idx % list.length];
}

// Render each moment as its own short MP4 by calling remotion render with
// the AutoEditMoment composition and JSON-encoded props. Returns an array
// of { ok, file, atSec, type, label, durationSec, reason? } in moment order.
// Readable one-liner describing what a moment should show — fed to Claude.
function _momentPayloadText(m) {
  const p = (m && m.payload) || {};
  if (typeof p.text === 'string' && p.text) return p.text;
  if (p.number) return String(p.number) + (p.subject ? ' — ' + p.subject : '');
  if (p.name) return String(p.name) + (p.subtitle ? ' (' + p.subtitle + ')' : '');
  if (Array.isArray(p.items) && p.items.length) return p.items.join(' | ');
  if (p.title) return String(p.title);
  if (p.quote) return String(p.quote);
  return m.label || m.type || 'graphic';
}

// AUTO EDIT — custom-generate each moment's motion graphic. For every moment
// we spawn an agentic Claude that WRITES a fresh Remotion composition (no
// templates) and renders it to a transparent .mov overlay. All moments run
// in parallel (user's call on their M4 16GB), capped at 16 as a safety net
// for Full-coverage runs where moment counts can balloon past 30 — that
// would guarantee swap-thrash + possible OOM on 16GB RAM. A moment that
// fails gets ONE retry, then is skipped. Returns the same shape
// renderMomentsParallel did so the /autoedit endpoint is unchanged.
//
// Tradeoff we accepted (user picked 12-at-once over recommended 6):
//   - 12 parallel Remotion renders peak around 8 GB RAM. On 16GB the OS
//     swaps to SSD, slowing per-task time. The user explicitly chose this
//     over the 6-parallel option that wouldn't swap. If you hit OOM kills,
//     drop the cap back to 6-8 in this same constant.
function generateMomentsParallel(moments, reqId, log, onProgress, genOpts) {
  const PARALLEL_CAP = 16;
  const vidW = (genOpts && genOpts.width)  || 1920;
  const vidH = (genOpts && genOpts.height) || 1080;
  const MAX_INFLIGHT = Math.min(moments.length || 1, PARALLEL_CAP);
  const cacheDir = path.join(OUTPUT_DIR, 'cache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}

  const tasks = moments.map((m, idx) => {
    const speechDur = Math.max(0.5, m.endSec - m.startSec);
    const durationSec = Math.min(6, Math.max(2.5, speechDur + 0.6));
    const durationFrames = Math.round(durationSec * 30);
    const outFile = path.join(cacheDir, `ae_${reqId.slice(0, 8)}_${idx}_${Date.now()}.mov`);
    return { idx, moment: m, outFile, durationSec, durationFrames };
  });

  let done = 0;
  const total = tasks.length;
  const results = new Array(total);

  function buildPrompt(task) {
    const m = task.moment;
    const opts = genOpts || null;
    let styleBlock = '';
    if (opts && opts.styleMode === 'same' && opts.styleSpec) {
      styleBlock = 'LOCKED STYLE — every graphic in THIS video shares ONE consistent look. '
        + 'Use exactly this palette, type and motion (nothing else) so all overlays read as a single designed set:\n' + opts.styleSpec;
    } else if (opts) {
      styleBlock = 'DISTINCT STYLE — give THIS graphic its own look (aesthetic hint: '
        + momentTypeToTrendPack(m.type, task.idx) + '). Across the video the graphics should feel VARIED — '
        + 'do not default to the same generic caption palette/type/motion every time.';
    }
    return [
      'Create a motion-graphic OVERLAY for a video. It will be placed on a',
      'track ABOVE the speaker\'s footage, so it MUST have a fully transparent',
      'background — only the graphic elements are visible.',
      '',
      'THE MOMENT (pulled from the video transcript):',
      '  type: ' + (m.type || 'fact'),
      '  show this: ' + _momentPayloadText(m),
      '  on screen for: ' + task.durationSec.toFixed(1) + 's (' + task.durationFrames + ' frames @ 30fps)',
      '',
      styleBlock,
      '',
      'BUILD IT:',
      '- Write a FRESH Remotion composition from scratch. Do NOT copy or import',
      '  a template from src/templates/. Build the animation yourself.',
      '- BEFORE you write any code, read the relevant skill rule files:',
      '    ~/.claude/skills/remotion-best-practices/rules/transparent-videos.md',
      '      (MANDATORY — alpha output is critical for overlays)',
      '    ~/.claude/skills/remotion-best-practices/rules/text-animations.md',
      '      (for any text the overlay shows)',
      '    ~/.claude/skills/remotion-best-practices/rules/timing.md',
      '      (interpolate / spring / easings — use these, not CSS transitions)',
      '    ~/.claude/skills/remotion-transitions/references/animation-math.md',
      '      (easing functions, stagger formulas, the `clamp` pattern)',
      '  For the OVERLAY ENTRY/EXIT animation specifically, study the patterns in:',
      '    ~/.claude/skills/remotion-transitions/references/transition-catalog.md',
      '    ~/.claude/skills/remotion-transitions-extra/references/transition-catalog-extra.md',
      '      (Striped Slam, Zoom Punch, Iris Open, Page Tear, etc. — pick the',
      '      reveal pattern that fits the moment\'s energy and adapt it to your',
      '      overlay\'s in/out animation, not as a TransitionSeries.)',
      '  For TEXT-DRIVEN overlays (titles, captions, callouts, stats), write',
      '  bespoke Remotion components — pick fonts, motion, easing, palette',
      '  based on what the user actually asked for. Pass `bg="transparent"`',
      '  on the root AbsoluteFill so the ProRes 4444 alpha survives.',
      '- DO use the style library at ' + WORK_DIR + '/remotion-intro/src/lib/',
      '  for easings, palettes, typography and motion helpers — read the files',
      '  you need first to get exact export names.',
      '- ' + vidW + 'x' + vidH + ', 30fps, EXACTLY ' + task.durationFrames + ' frames.'
        + (vidW < vidH ? ' This is a VERTICAL frame — compose for a tall 9:16-ish canvas (stack elements, keep text within the centre safe area).' : (vidW === vidH ? ' This is a SQUARE frame.' : '')),
      '- TRANSPARENT background — this is CRITICAL. The composition root must',
      '  have NO opaque background (no solid-color AbsoluteFill behind it).',
      '  Render with EXACTLY this codec config so the alpha channel survives:',
      '      --codec prores --prores-profile 4444 --mute',
      '  ProRes 422 (the default) has NO alpha and will black out the video.',
      '  You MUST pass --prores-profile 4444. The --mute flag silences any',
      '  audio track (without it Remotion adds silent stereo and Premiere',
      '  shows an empty waveform). The bridge ALSO post-processes with',
      '  ffmpeg -an to strip the silent track entirely after render. After',
      '  rendering, the file\'s pixel format must be yuva444p10le (alpha-',
      '  capable) — verify with ffprobe if unsure and re-render if it is not.',
      '- It is an OVERLAY, not a full-screen card: keep it to a lower-third,',
      '  corner, or side panel as fits the type. It supports the speech, it',
      '  does not cover the speaker.',
      '- It MUST animate in at the start and out before the end — never static.',
      '- Render the final file to EXACTLY this path:',
      '  ' + task.outFile,
      '',
      'When finished, the file at ' + task.outFile + ' must exist on disk.',
      'Emit [[IMPORT:' + task.outFile + ']] when done.',
    ].join('\n');
  }

  function runOne(task, isRetry) {
    return new Promise((resolve) => {
      const tag = `gen[${task.idx}]${isRetry ? ' (retry)' : ''}`;
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', SYSTEM_PROMPT,
        '--no-session-persistence',
        buildPrompt(task),
      ];
      // stdin 'ignore' — otherwise the claude CLI blocks waiting for stdin.
      const proc = spawnClaude(args, {
        cwd: WORK_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (_activeAutoedit) _activeAutoedit.children.add(proc);
      log(`${tag} spawned pid=${proc.pid} ${task.moment.type}`);

      let lineBuf = '';
      let lastActivity = Date.now();
      let finished = false;

      proc.stdout.on('data', chunk => {
        lastActivity = Date.now();
        lineBuf += chunk.toString();
        let nl;
        while ((nl = lineBuf.indexOf('\n')) >= 0) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          let evt; try { evt = JSON.parse(line); } catch { continue; }
          const status = streamEventToStatus(evt);
          if (status) broadcastProgress('Graphic ' + (task.idx + 1) + ': ' + status, null, reqId);
        }
      });
      proc.stderr.on('data', () => { lastActivity = Date.now(); });

      // Generation legitimately goes quiet while Claude thinks/renders. Kill
      // only on a real stall (5 min no output) or a 12-min hard cap.
      const IDLE_MS = 5 * 60 * 1000;
      const HARD_MS = 12 * 60 * 1000;
      const startedAt = Date.now();
      const watchdog = setInterval(() => {
        if (finished) { clearInterval(watchdog); return; }
        if (Date.now() - lastActivity > IDLE_MS || Date.now() - startedAt > HARD_MS) {
          log(`${tag} watchdog kill (idle/hard cap)`);
          try { proc.kill('SIGKILL'); } catch {}
        }
      }, 10000);

      const conclude = () => {
        if (finished) return;
        finished = true;
        clearInterval(watchdog);
        if (_activeAutoedit) _activeAutoedit.children.delete(proc);
        const fileExists = fs.existsSync(task.outFile) && (() => {
          try { return fs.statSync(task.outFile).size > 1000; } catch { return false; }
        })();
        if (!fileExists) {
          log(`${tag} produced no output file`);
          resolve({ ok: false, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: 'no output' });
          return;
        }
        // Verify the .mov actually has an alpha channel. ProRes 422 (no
        // alpha) would black out the video underneath — that's a fail, not
        // a usable graphic, so it goes to retry/skip like any other failure.
        let hasAlpha = false;
        try {
          const pf = require('child_process').execFileSync(
            FFMPEG_BIN.replace(/ffmpeg$/, 'ffprobe'),
            ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', task.outFile],
            { encoding: 'utf8', timeout: 15000 },
          ).trim();
          hasAlpha = /yuva|rgba|argb|\ba\b/i.test(pf);
          if (!hasAlpha) log(`${tag} output is OPAQUE (pix_fmt=${pf}) — needs ProRes 4444`);
        } catch (e) {
          // ffprobe failed — don't hard-fail on that alone; accept the file.
          hasAlpha = true;
        }
        if (hasAlpha) {
          log(`${tag} ok -> ${task.outFile}`);
          resolve({
            ok: true, file: task.outFile, atSec: task.moment.startSec,
            type: task.moment.type, label: task.moment.label || '',
            durationSec: task.durationSec,
          });
        } else {
          try { fs.unlinkSync(task.outFile); } catch {}
          resolve({ ok: false, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: 'opaque (no alpha)' });
        }
      };
      proc.on('exit', conclude);
      proc.on('close', conclude);
      proc.on('error', (e) => {
        log(`${tag} spawn error ${e.message}`);
        if (!finished) { finished = true; clearInterval(watchdog); resolve({ ok: false, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: e.message }); }
      });
    });
  }

  // Per task: try once, retry once on failure, then give up (skip).
  async function runWithRetry(task) {
    let r = await runOne(task, false);
    if (!r.ok && !(_activeAutoedit && _activeAutoedit.aborted)) {
      r = await runOne(task, true);
    }
    results[task.idx] = r;
    done++;
    if (onProgress) onProgress(done, total);
  }

  // Pool: up to MAX_INFLIGHT generations running at once.
  return (async () => {
    if (!tasks.length) return [];
    const queue = tasks.slice();
    const workers = [];
    for (let w = 0; w < Math.min(MAX_INFLIGHT, queue.length); w++) {
      workers.push((async () => {
        while (queue.length) {
          if (_activeAutoedit && _activeAutoedit.aborted) break;
          const task = queue.shift();
          await runWithRetry(task);
        }
      })());
    }
    await Promise.all(workers);
    return results;
  })();
}

// Real-time progress — bridge parses Claude's stream-json events and pushes
// human-readable status lines ("Writing component", "Rendering frames", etc.)
// over SSE so the panel can display what's actually happening.
const progressClients = new Set();
function broadcastProgress(text, pct, reqId) {
  if (!text && pct == null) return;
  const payload = { text: text || '' };
  if (typeof pct === 'number') payload.pct = Math.max(0, Math.min(100, pct));
  if (reqId) payload.reqId = reqId;
  const data = JSON.stringify(payload);
  for (const c of progressClients) {
    try { c.write('event: progress\ndata: ' + data + '\n\n'); } catch {}
  }
}
function broadcastProgressDone(reqId) {
  const data = JSON.stringify(reqId ? { reqId } : {});
  for (const c of progressClients) {
    try { c.write('event: done\ndata: ' + data + '\n\n'); } catch {}
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
// fs.watch and jsx hot-reload removed along with the dev SSE.


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

// Component bank — every v2 Remotion skill with its key components. The expand
// system prompts inject this so each level can name-drop real components into
// the rewritten brief; when /chat then fires, Claude Code's skill loader picks
// up those names via description-match and loads the right SKILL.md files.
//
// Format: <skill-name>: <Component1>, <Component2>, … — <one-line "best for">
const _ARCHIVED_COMPONENT_BANK_UNUSED = `
COMPONENT BANK — pick real components from these skills. Naming a component in
the brief causes the generator to load the matching skill (description-match).

remotion-hooks: WaitZoomHook, POVCaption, PlotTwistReveal, StoryTimeTitle, RealTalkCaption, WatchThisStamp — short-form openers, first 60–90 frames
remotion-text-presets: TiltedSlam, WordPopCaption, LetterCascade, TypewriterPro, MarkerUnderline, CounterCountUp, GlitchText, NeonGlow, Extrude3D, StampImpact, KaraokeLyric — title moments + kinetic text
remotion-word-effects: WordSwap, StrikethroughSwap, HighlightedWord, CensorBar, SpinningLetters, FallingLetters, SparkleTitle — word-level transforms
remotion-ctas: SubscribeArrow, BellRing, LikeSmash, ShareCallout, SaveBookmark, TapToFollow — engagement prompts
remotion-social-ui: iMessageBubble, DMNotification, LikeBurst, SubscribePop, CommentOverlay, LiveIndicator, HashtagPop, CornerWatermark — platform UI mocks
remotion-reactions: MindBlown, FireBurst, HundredSlam, HeartEyes, SideEye, CryingLaugh, EyesPeek, SparkleField — emoji reaction overlays
remotion-callouts: HandDrawnArrow, HighlightCircle, PullQuote, SpeechBubble, QuestionCard — emphasis devices
remotion-quotes: PullQuote (accent-bar variant), BigQuote, QuoteWithAttribution, AuthorTagline — editorial quote cards
remotion-stingers: BrandReveal, EndCard, ChapterBumper, SponsorPlate — brand-moment cards (intros, outros, chapter breaks)
remotion-logos: LogoSlam, LogoMorph, LogoRing, LogoPulse — channel-intro logo treatments
remotion-banners: NewsTicker, BreakingBanner, CTABanner, AlertStrip — banner overlays
remotion-trend-packs: BratTitle, CoquetteIntro, Y2KChromeTitle, VaporwaveSunset, EditorialBrutalist, GlitchHype, MochaPodcastIntro — aesthetic-locked title moments (2024–26 trends)
remotion-charts: BarChart, PieChart, LineGraph, DonutMetric, TrendArrow, BarRace — data viz
remotion-stats: BarChartRace, ProgressRing, ComparisonBars, StatCardGrid — metric reveals
remotion-comparison: BeforeAfter, DayOneVsDayThirty, ThenVsNow, ExpectedVsHappened, VersusCard — side-by-side / vs cards
remotion-lists: NumberedList, StepIndicator, Checklist, BulletReveal, RecipeStep, SectionBreak — list / step-by-step
remotion-tech: CodeSnippet, TerminalCommand, KeyboardShortcut, FileTree, PullRequestCard, LoadingDots — dev / tutorial content
remotion-music-lyrics: KaraokeLine, LyricDrop, BeatHitPop, DropIncoming, NowPlaying, SoundWaveBars — music / lyric visuals
remotion-frames: ToastPopup, PolaroidFrame, PriceReveal, BookmarkFold, GiftBoxReveal — decorative frame / reveal cards
remotion-device-notifications: StickyNote, SpeechBubble (notif variant), ThoughtBubble, TapeSticker, CameraFlash, RecordingDot, BatteryLow — phone / notification mocks
remotion-lower-thirds: NewsBroadcast, MinimalBauhaus, RetroVhs, EditorialItalic, GlitchLowerThird — name-card chyrons
remotion-backgrounds: AnimatedGradient, ParticleField, NoiseGrain, WavyLines — full-frame backdrops (use UNDER other components)
remotion-transitions / remotion-transitions-extra: cinematic scene transitions (Striped Slam, Zoom Punch, Iris Open, Page Tear, Hex Mosaic Flip, etc.)

When you name a component in the brief, write it as a real noun in the sentence
("the WaitZoomHook opens cold", "drop a SubscribeArrow + BellRing at the end")
— don't write "use component X from skill Y". The natural mention is what
triggers the skill loader.
`;

const EXPAND_SYSTEMS = {
  // Core principle across all three levels: add CRAFT, never invent NUMBERS.
  // The generator picks specific durations, frame counts, hex colors, fps, and
  // text itself — our job is to give it richer texture, motion feel, and
  // composition language so its picks are better.
  light: `You are a LIGHT prompt enhancer for a Premiere Pro motion-graphics generator. The user typed a short request. Add 1–2 small craft specifics — a motion feel, an easing word, a composition cue, or a mood. That's it.

NEVER invent any of these unless the user explicitly said them:
- Duration, seconds, frame counts, FPS
- Specific hex colors (a vibe like "warm dark" is fine; #ABC123 is not)
- Text strings, names, numbers, brand names
- Aspect ratio / resolution
- Beat-by-beat timings
- Specific component or pre-built skill names

Stay extremely close to the user's wording and voice. Final length: roughly 1.3–1.8x the input. Output ONLY the rewritten prompt — no preface, no quotes, no explanation.`,

  medium: `You are a prompt-expansion engine for a Premiere Pro motion-graphics generator. The user typed a short request. Rewrite it as a more specific brief — but go DEEPER ON CRAFT, never on invented numbers. The generator picks concrete specifics itself; your job is to give it texture, motion language, and intent so its picks are good.

ADD specificity about (only what's relevant):
- Motion feel and easing language in WORDS (snappy, springy, smooth, kinetic, anticipate-and-settle)
- Composition (anchor, alignment, hierarchy, negative space)
- Typography style in WORDS (geometric sans, editorial serif, tight tracking, heavy display weight)
- Mood / energy / reference vibe in WORDS
- Atmosphere texture in WORDS (grain feel, glow softness, gradient direction, light-leak hint)
- Choreography intent — what enters first, what supports what, where the eye lands

NEVER invent any of these unless the user explicitly said them:
- Duration, total length, seconds, frame counts, FPS
- Specific hex colors (a palette feel like "warm dark with one accent" is fine; #ABC123 is not)
- Text strings, names, numbers, brand names
- Aspect ratio / resolution
- Second-by-second beat breakdowns
- Specific component or pre-built skill names

If the user said "5 seconds" or "blue" or "the word HELLO" — keep their value exactly. If they didn't — say nothing about it; the generator decides.

Avoid LLM filler — no "cinematic", "epic", "stunning", "captivating", "mind-blowing", "beautiful". Be specific instead.

Output ONLY the rewritten prompt. No preface, no "Here is...", no quotes. One or two flowing paragraphs. Final length: 2–3x the original.`,

  heavy: `You are a HEAVY brief writer for a Premiere Pro motion-graphics generator. Output a rich, textured brief that's deep on CRAFT and motion language — but never on invented numbers. The generator picks concrete specifics itself; your job is to give it enough feel and intent to pick well.

ADD specificity about (whichever apply):
- Motion language: how things enter, hold, exit; easing FEEL in named words (snap, spring, glide, ease-out-expo, anticipate-recoil) — NOT cubic-bezier numbers
- Composition: anchors, alignment, hierarchy, negative space, layered depth
- Typography decisions: family feel (geometric sans / editorial serif / display / mono), weight, tracking intent — never specific px/pt sizes
- Mood and reference vibe in plain words (kinetic agency, Apple keynote, editorial, gritty)
- Texture: grain feel, glow softness, gradient direction, light-leak hint, particle density — described, not measured
- Choreography intent: order of reveal, where attention lands, what hands off to what

NEVER invent any of these unless the user explicitly said them:
- Duration / total length / seconds / frame counts / FPS
- Beat-by-beat second timings (no "0.0–1.2s reveal, 1.2–2.6s hold")
- Specific hex colors (a vibe is fine; #ABC123 is not)
- Specific text strings, names, numbers, brand names
- Aspect ratio / resolution / cubic-bezier numbers / measured pixel values
- Specific component or pre-built skill names

If the user gave a value, keep it exactly. If they didn't, say nothing about it.

Be SPECIFIC over flowery. "Snap easing on the hero word, glide on supporting text" beats "beautiful animation". Avoid LLM filler — no "cinematic", "epic", "stunning", "captivating", "mind-blowing".

Output ONLY the brief itself — flowing prose, 2–3 paragraphs, no headers, no bullets, no markdown. Length: 3–5x the input.`,
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
1. Build and render the result with the Remotion framework.
2. Render the final file into ${OUTPUT_DIR}.

═══════════════════════════════════════════════════════════════════════════
INSTALLED SKILLS — load these before writing Remotion code, they have
battle-tested patterns that will dramatically improve output quality.
Skills live in ~/.claude/skills/. Read the relevant rule file(s) first,
then write code that follows the pattern.

  remotion-best-practices/
    rules/transparent-videos.md   READ THIS for any transparent / alpha /
                                  overlay request. Tells you exactly how to
                                  render alpha-capable .mov correctly.
    rules/text-animations.md      Typography animation patterns.
    rules/transitions.md          Scene transition patterns.
    rules/timing.md               Easing, springs, interpolation curves.
    rules/sequencing.md           <Series>, <Sequence>, trim/delay patterns.
    rules/calculate-metadata.md   Dynamic durationInFrames from props.
    rules/voiceover.md            ElevenLabs TTS + word timestamps.
    rules/captions.md             Animated captions (TikTok / word-by-word /
                                  karaoke).
    rules/audio.md                Audio import, trim, volume, pitch.
    rules/audio-visualization.md  Waveforms, spectrum bars, bass-reactive.
    rules/fonts.md                Loading Google Fonts / local fonts.
    rules/images.md  rules/videos.md  rules/gifs.md  rules/lottie.md
                                  Embedding assets correctly.
    rules/charts.md               Bar/pie/line charts in Remotion.
    rules/3d.md                   3D content via React Three Fiber.
    rules/measuring-text.md       Text-fitting / overflow checking.
    rules/light-leaks.md          @remotion/light-leaks overlay effects.

  remotion-transitions/           If the user asks for "cinematic", "high-
                                  energy", "glitch", "striped", "punch",
                                  "shutter", "burst" transitions — invoke
                                  this skill. It has 6 production-grade
                                  TransitionPresentation components ready
                                  to copy: Striped Slam, Zoom Punch,
                                  Diagonal Reveal, Emerald Burst, Vertical
                                  Shutter, Glitch Slam. Animation math
                                  reference is in references/animation-math.md.

  remotion-transitions-extra/     5 ADDITIONAL transitions beyond the base
                                  skill: Iris Open, Page Tear, Camera Shake
                                  Cut, Color Wash, Hex Mosaic Flip. Triggers:
                                  "iris", "circular reveal", "page tear",
                                  "rip", "smash cut shake", "color wash",
                                  "tile flip", "mosaic", "grid transition".
                                  Catalog in references/transition-catalog-
                                  extra.md. CRITICAL: read references/
                                  architecture.md before building a NEW
                                  custom transition — it explains the wrap-
                                  stacking gotcha that silently breaks
                                  cover/reveal mechanics.

  remotion-ads/                   If the user asks for an "Instagram reel",
                                  "video ad", "explainer video", "carousel",
                                  "hook → problem → solution → CTA", or a
                                  URL-to-video — invoke this skill. Full
                                  ad framework: scene JSON, ElevenLabs
                                  voiceover with word timestamps, animated
                                  captions, safe zones, ad copywriting
                                  templates. Check references/formats.md
                                  first for the exact dimensions/safe zones.

How to invoke a skill: load its top-level SKILL.md, then read the specific
rule/reference file(s) named for your task. Don't try to remember everything
upfront — read the file when you're about to use that pattern.

═══════════════════════════════════════════════════════════════════════════

OUTPUT FORMAT REQUIREMENTS (critical — Premiere can't import some formats):
- For motion video → MP4 with H.264 codec. NEVER WebM, NEVER VP8/VP9 — Premiere Pro refuses these.
- For still images → PNG.
- File extensions MUST match codec: h264 → .mp4, prores → .mov, png → .png. The panel parses the extension to decide how to import.
- Always pass an explicit \`--codec\` so it doesn't default to webm.
- ★ NO EMPTY AUDIO TRACK ★ — Unless the composition genuinely USES audio
  (i.e. you wrapped <Audio src={…}/> components in it, or it's part of an
  ad with a voiceover track), pass \`--mute\` to every render. Without it,
  Remotion writes a silent stereo track to the output and the user sees
  an empty L/R waveform on the Premiere source monitor. (The bridge ALSO
  runs ffmpeg -an post-process to strip the silent track after render,
  so even if you forget, audio gets removed before Premiere sees it.)
  IMPORTANT: \`--audio-codec=no-audio\` is NOT a valid Remotion flag — it
  errors with "Audio codec must be one of pcm-16, aac, mp3, opus". Use
  \`--mute\` instead.

★★★ TRANSPARENCY — READ THIS, IT IS THE #1 THING PEOPLE GET WRONG ★★★
If the request mentions "transparent", "no background", "remove the
background", "alpha", "overlay", "on top of", "for V2/V3", or anything
that implies the result sits OVER other footage — you MUST do BOTH of
these, or the output will have a solid black background:

  1. THE COMPOSITION MUST NOT PAINT A BACKGROUND. Do not put a
     \`backgroundColor\` on the root, do not render a solid <AbsoluteFill>
     behind the content, do not add a dark/black panel "for contrast".
     The root element's background stays fully transparent. Only the
     actual graphic elements are drawn.
  2. RENDER AS PRORES 4444 — the ONLY alpha-capable format here:
        --codec prores --prores-profile 4444   →  output file is .mov
     H.264 / MP4 HAS NO ALPHA CHANNEL. Rendering a transparent
     composition to .mp4 produces a BLACK background every time. There
     is no flag that makes .mp4 transparent — you must use ProRes 4444.

  After rendering, the .mov's pixel format must be \`yuva444p10le\` (the
  \`yuva\` = alpha). If you are unsure, check with:
     ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt -of csv=p=0 <file>
  If it comes back \`yuv422...\` (no alpha), you used the wrong codec —
  re-render with --prores-profile 4444.

Only when the request does NOT involve transparency: render H.264 .mp4.

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

═══════════════════════════════════════════════════════════════════════════
TEMPLATES — START HERE for common output shapes.

Before writing a component from scratch, check ${WORK_DIR}/remotion-intro/src/templates/ —
each file is a proven working composition using the library correctly. Pick
the closest match, COPY the file with a new unique name, edit the marked
"EDIT THESE" constants, and register it in Root.tsx. Way faster + higher
hit rate than starting blank.

Available templates (10):

  PodcastCaption.tsx    — STANDALONE kinetic caption. CENTERED on a dark
                          backdrop with vignette. Hero word in accent color.
                          Auto-scales for horizontal vs vertical aspect.
                          Use for: "caption", "kinetic caption", "title caption",
                          any caption ask that doesn't mention overlay/V2/alpha.

  CaptionOverlay.tsx    — TRANSPARENT-bg caption for V2 overlay above a
                          speaker. Word-pop in the bottom-third safe zone.
                          MUST render with --codec=prores or webm w/ alpha.
                          Use ONLY when user says: "overlay", "transparent",
                          "for V2", "on my speaker", "with alpha".

  StatSlam.tsx          — big number reveal with kicker label.
                          Use for: stat, percentage, growth, $1M, counter.

  IntroCard.tsx         — 3s logo/brand intro with kerning-in entrance.
                          Use for: intro, logo intro, brand opening, 3 second.

  LowerThird.tsx        — bottom-left name + role card with accent stripe.
                          Use for: lower third, name card, guest intro.

  QuotePull.tsx         — editorial italic quote with accent bar.
                          Use for: quote, pull quote, thesis line.

  CalloutSticker.tsx    — rotated sticker badge in a corner.
                          Use for: WATCH THIS, key point, NEW, callout.

  ListReveal.tsx        — 3-5 staggered numbered list items.
                          Use for: 3 reasons, 5 tips, key takeaways.

  BeforeAfter.tsx       — split-screen before/after with center accent.
                          Use for: before/after, then vs now, transformation.

  SectionDivider.tsx    — full-frame chapter card. Brief beat between topics.
                          Use for: chapter break, section title, next topic.

  OutroSubscribe.tsx    — Thanks for watching + subscribe button.
                          Use for: outro, end card, sign-off, subscribe prompt.

How to use a template:
  1. cp src/templates/StatSlam.tsx src/<NewUniqueName>.tsx
  2. Edit the "EDIT THESE" block at the top of the file.
  3. Rename the component export from StatSlam to NewUniqueName.
  4. Register in src/Root.tsx with a unique <Composition id="..."/> entry.
  5. Render. Run self-critique. Ship.

DON'T copy a template AND add 4 other library components on top. The
template is already restrained — adding more breaks the balance. The single
biggest improvement to your output quality from now on is "copy the template,
change the text, don't reach for anything else."

If the user's prompt clearly doesn't match any template (e.g. a wild custom
animation), THEN start blank and use the library directly.
═══════════════════════════════════════════════════════════════════════════

PRE-SCAFFOLDED REMOTION PROJECT:
- A Remotion project is already installed at ${WORK_DIR}/remotion-intro/ with node_modules ready.
- Add new compositions as TSX files in ${WORK_DIR}/remotion-intro/src/ and register them in src/Root.tsx with a unique <Composition id="..."> entry.
- Render with: \`cd ${WORK_DIR}/remotion-intro && npx remotion render src/index.ts <CompositionId> "<OUTPUT_DIR>/<filename>.mp4" --codec=h264 --mute\` — \`--mute\` is REQUIRED unless the composition actually has <Audio> elements; it silences any audio track Remotion would otherwise add. (NOTE: \`--audio-codec=no-audio\` does NOT exist as a flag and errors out — use \`--mute\` instead. The bridge also post-strips audio with ffmpeg -an, so the final file Premiere sees has no audio stream at all.) <OUTPUT_DIR> = the "Output dir for any rendered files" path from the [PREMIERE CONTEXT] block at the top of the user's message (NOT the global default). If no context is provided fall back to ${OUTPUT_DIR}. Quote the path because it may contain spaces (e.g. "Vera Vid 13/Claude Animations/...").
- Do NOT scaffold a new Remotion project; do NOT run \`npx create-video\`. Reuse the existing one.
- NEVER run \`remotion --help\`, \`npx remotion render --help\`, or ANY \`--help\` on the remotion CLI. The exact render command is written right above — use it verbatim. Running \`--help\` spins up an esbuild service that HANGS in this environment (it never returns from its ping), which stalls the entire render indefinitely. If you're unsure of a flag, use only the flags shown above; do not probe the CLI.
- If node_modules is somehow missing (\`ls ${WORK_DIR}/remotion-intro/node_modules\` is empty), run \`cd ${WORK_DIR}/remotion-intro && npm install\` first — but this should already be done from the installer.

__SELF_CRITIQUE_BEGIN__
═══════════════════════════════════════════════════════════════════════════
SELF-CRITIQUE BEFORE SHIPPING — MANDATORY for every render.
═══════════════════════════════════════════════════════════════════════════

After the main render finishes, you MUST visually verify the output before
you tell the user it's ready. You catch ~80% of layout problems this way.

The flow:

  1. Render the MP4 as you would normally.

  2. Render a single still frame at the middle of the composition. Run:
       cd ${WORK_DIR}/remotion-intro && \\
       npx remotion still src/index.ts <CompositionId> ${OUTPUT_DIR}/_check_<id>.png --frame=<frameAtMiddle>
     where <frameAtMiddle> is roughly durationInFrames / 2.

  3. Use the Read tool to view that PNG. Look at it like a human would.

  4. Score it against these rules. If ANY rule fails, FIX the component and
     repeat from step 1. You get ONE retry — that's it.

     - **Clipping**: is any text/shape cut off at the frame edges?
     - **Centering**: did you position something with \`left: 50%; top: 50%\`
       WITHOUT \`transform: translate(-50%, -50%)\`? Common bug — the corner
       of the element ends up at center, content drifts bottom-right.
     - **Safe zone (9:16 vertical only)**: is any content in the middle 45%
       of the frame? That's the speaker's face zone — keep content in the
       bottom 35% or top 20% unless the prompt is "title card, no speaker".
     - **Contrast**: can you read the text against the background? Light
       text on light bg, or near-equal hex values, fail this.
     - **Overlapping**: are two text/element layers covering each other in
       ways that make either unreadable?
     - **Size**: is hero text under ~40px at 1080p? Too small to read.
     - **Visibility**: is the content even visible at this frame? An animation
       that starts at frame 30 with a duration of 60 will be invisible at
       frame 15. Pick a frame where things are landed, not still entering.
     - **Empty frame**: middle frame has nothing on it? Animation timing is
       off — adjust the start frames so something is on screen at the middle.

  5. After the critique (and any fix), THEN emit your [[IMPORT:path]] marker.

  6. If you couldn't fix the issue in 1 retry, ship what you have but say
     so briefly in your reply: "Heads-up — the title is clipped at the
     right edge, couldn't get a clean fix in one pass."

This step adds ~20-30s per render. It's worth it. Without it Claude
ships components with content off-screen, in the wrong corner, or invisible
at the middle frame — exactly the failure modes the user has flagged.

If the prompt is "make a new version of a previous render" (iteration mode),
ALSO run self-critique on the new version. Just because it's a small edit
doesn't mean it's correct.
═══════════════════════════════════════════════════════════════════════════
__SELF_CRITIQUE_END__

PROJECT REUSE POLICY:
- You MAY reuse the existing Remotion project shell (package.json, node_modules, render config, fonts).
- You MUST NOT reuse existing components, styles, or design choices from prior renders. The user expects a FRESH design every prompt — different colors, layout, typography, motion. Treat every prompt as a clean creative slate even if a similar-named component already exists on disk.
- Create a new component file with a unique name (e.g. include a short timestamp or descriptive suffix) so you do not collide with previous renders. Register it in src/Root.tsx with a matching unique composition id.
- ONLY exception — when the user message begins with "Make a new version of a previous render." they are explicitly iterating. In that case: read the named "Previous file", find the matching component, and modify it minimally to apply the requested change while preserving every other styling decision.

STYLE LIBRARY — at ${WORK_DIR}/remotion-intro/src/lib/. Import from here,
don't reinvent. This index tells you WHICH file has what. Files are short
(~100-300 lines) — when you're about to use one, Read it first to get the
EXACT export names + prop signatures. Don't guess an export name; read first.

CORE — you'll touch these on almost every render:
  palettes.ts     15 named color palettes. modernDark is the default. bratLime,
                  coquetteCream, chromeY2K, mochaMousse, darkAcademia, sunsetVapor,
                  noirHC, sageMatcha, reelsGradient — pick by prompt vibe.
  easings.ts      EASE.* named bezier curves + FRAMES.* duration constants.
                  Never write raw cubic-bezier().
  typography.ts   TYPE.* type recipes; TIKTOK_CAPTION / KARAOKE_CAPTION / SOFT_CAPTION;
                  TEXT_FX.* text-effect recipes (neon, gradient, chrome, gold,
                  outlined, embossed, sticker, highlight, ...).
  motion.ts       frame-driven helpers: popIn, fadeIn, slideUp/In, staggered, wordPop,
                  typewriter, highlighter, glitch, whipPan, zoomPunch, breathe, wiggle,
                  screenShake, swipeReveal, irisWipe, dropAndSettle, blurIn, beatPulse,
                  kerningIn, counter.
  motion-extra.ts physics/character motion: anticipate, recoil, hover, pendulum, tilt,
                  pathFollow, springChain, popcorn, explodeIn/Out, meltDown, foldOpen,
                  riseAndShine, dropAndCrack, magnetic, stretchFlick, attentionShake,
                  heartbeat, drift, gradientReveal, typeOnWithCursor, elastic, orbital.
  presets.ts      PRESETS.* composed animations — spread onto an element's style:
                  heroEntrance, slam, pop, fadeUp/Down, hold, exitFade, exitFlyOut,
                  callout, enterHoldExit, reveal, iris, pulse, shake, flip, stickerSlam,
                  kenBurns, parallax.
  effects.tsx     overlay components: FilmGrain, Vignette, ChromaticAberration,
                  Scanlines, LightLeak, GlowHalo, SparkleField, GradientMesh,
                  SpeedLines, Grid, Confetti.
  trends.ts       TRENDS.* named style packs — see TREND PACKS below.

LAYOUT & STRUCTURE:
  layouts.tsx     BentoGrid, BentoCell, Split, LowerThird, Pip, CardStack, StickyBadge,
                  ProgressBar, CaptionBox.
  cards.tsx       card design styles: GlassCard, NeumorphCard, BrutalistCard, PaperTear,
                  Polaroid, EditorialCard, Receipt, IndexCard, HeroCard, SoftCard.
  shapes.tsx      Arrow, Star, Heart, Burst, SpeechBubble, ThoughtBubble, Badge, Tape,
                  StickyNote, Blob, Ring, RoundedRect, Underline, Scribble, HighlightBar,
                  + device frames: PhoneFrame, MacWindow, BrowserFrame, TerminalWindow.
  prims3d.tsx     mock-3D via CSS/SVG: Cube3D, ShadedSphere, Cylinder, Pyramid, IsoCube,
                  IsoStack, Card3D.

TRANSITIONS (scene-to-scene):
  transitions.ts       whipPan, zoomPunch, glitchCut, irisWipe, slideMorph, push, flashCut.
  transitions-extra.ts cubeFlip, pageCurl, liquidWipe, colorWash, zoomBlur, impactShake,
                       slideCover, crossfade.

CONTENT COMPONENTS:
  icons.tsx         ~32 static pictograms — IconHeart, IconStar, IconCheck, IconFire,
                    IconBell, IconPlay, IconTrendUp, IconRocket, IconTrophy, ... .
  icons-animated.tsx moving icons (pass frame): HeartBeat, BellRing, StarTwinkle,
                    FireFlicker, SpinIcon, BounceIcon, CheckDraw, XDraw, SparkleTrail,
                    RocketLaunch, LightbulbOn.
  numbers.tsx       CountUp (commas/percent/abbrev/currency/time), CountUpFlip, BigStat,
                    PriceTag, DeltaBadge, formatNumber().
  charts.tsx        frame-driven data viz: BarChart, LineChart, PieChart, DonutChart,
                    ProgressLine, ProgressRing, Gauge, Sparkline.
  text-paths.tsx    curved text via SVG textPath: CircularText, ArchText, WaveText,
                    SpiralText, TextOnPath, PerLetter, Rotate3DText.
  avatars.tsx       Avatar (auto-colors from name), AvatarStack, FacePlaceholder.
  social.tsx        platform mock cards: TweetCard, RedditCard, LinkedInCard, IMessage,
                    IMessageThread, SlackMessage, Notification, EmailCard, TikTokOverlay.
  buttons.tsx       CTAButton, GhostButton, SoftButton, SubscribeButton, AppStoreBadge,
                    Toggle, Chip.
  code.tsx          CodeBlock, TypingCodeBlock, InlineCode. Languages: js, ts, py, sql,
                    bash, css, go, rust. Themes: dark, light, cyber, warmCream.
  loaders.tsx       Spinner, DotTyping, PulseDots, BarLoader, Skeleton, SkeletonCard,
                    ProgressFill, IndeterminateBar.
  audio-viz.tsx     WaveformBars, WaveformBarsMirrored, Waveform, VinylRecord,
                    CassetteTape, NowPlaying.
  flags.tsx         22 country/group flags as SVG: FlagUS, FlagJP, FlagUK, FlagEU, ... .

BACKGROUNDS & ATMOSPHERE:
  backgrounds.tsx   DotGrid, LineGrid, Stripes, Halftone, RadialBurst, GradientMesh,
                    Aurora, Static, Vignette, StarField, Particles, LightLeak, IsoGrid.
  bg-procedural.tsx CheckerboardAnim, Voronoi, HalftoneWave, NoiseField, StripeWave,
                    ConcentricPulse, Topographic, Plasma.
  particles.tsx     Confetti, Explosion, Smoke, Sparks, Snow, Balloons, Emitter.
  photo-fx.tsx      LensFlare, DOFBlur, TiltShift, DoubleExposure, FilmBurn, ColorGrade,
                    Bloom, ChromaticAberrationAnim, VintageBorder, DustMotes, GodRays.
  sketchy.tsx       hand-drawn feel: Sketchy (jitter wrapper), ScribbleUnderline, Scribble,
                    Asterisk, PlusSign, SketchArrow, SketchFrame, DoodleDots, HandCircled,
                    DoodleStar, TwinkleMark, sketchJitter().

Import-extension rule: .tsx files export JSX components; .ts files export
functions/objects. effects/layouts/shapes/cards/icons/charts/etc are .tsx;
palettes/easings/motion/presets/trends are .ts.

TREND PACKS (composed recipes — pick one based on user's prompt keywords):
  - tiktokKineticCaption — DEFAULT. Word-by-word pops for talking-head/podcast clips.
  - bratPunch           — "brat" / "lime" / "club" / "ironic" / lowercase Arial on lime.
  - coquetteRibbon      — "soft" / "pink" / "girly" / pastel + italic serif + sparkles.
  - chromeY2K           — "y2k" / "chrome" / "retro" / silver gradient text + grid floor.
  - vaporwaveSunset     — "synthwave" / "80s" / "neon" / magenta-teal gradient + grid.
  - editorialBrutalist  — "brutalist" / "minimal" / "magazine" / massive uppercase b/w.
  - mochaLuxury         — "warm" / "cozy" / "coffee" / Pantone 2025 mocha + slow easings.
  - darkAcademia        — "vintage" / "literary" / "moody" / oxblood + italic serif.
  - sageWellness        — "calm" / "wellness" / "morning" / sage green + slow motion.
  - karaokePop          — "lyric" / "song" / "beat" / yellow karaoke highlight per word.
  - statSlam            — "stat" / "data" / "launch" / number reveal + bento grid.
  - newsTicker          — "news" / "sports" / "breaking" / ticker strip + lower third.
  - glitchHype          — "glitch" / "cyber" / "gaming" / RGB-split + scanlines + shake.
  - confettiHype        — "celebrate" / "win" / "drop" / confetti burst + bouncy text.
  - reelsStory          — "instagram" / "reel" / "story" / IG gradient + soft motion.

DESIGN PRINCIPLES — read these BEFORE picking helpers (the difference between
AI-slop and something a real motion designer would ship):

  1. ONE clear idea per render. Not three. Pick the single thing the eye should
     do: read a line, watch a number count up, see one logo land. Build around
     that. Cut everything that competes with it.
  2. RESTRAINT beats stacking. A human designer picks 1 motion helper + maybe
     1 effect overlay. They do NOT use wordPop + glitch + zoomPunch + grain +
     vignette + sparkles on the same shot. If you're tempted to add a fifth
     thing, delete one of the first four.
  3. HOLD frames. Real videos let things SIT. After a word lands, give it
     8-15 frames of stillness before the next move. Constant motion is the
     #1 AI tell.
  4. ASYMMETRY. Real designers offset things slightly. 50/50 center is rare.
     Use rule-of-thirds, top-left/bottom-right placement, generous whitespace.
  5. ONE accent color in a shot. A palette has 5 colors so you can CHOOSE one,
     not so you can use all five at once. Background + foreground + one
     accent = three colors max in any frame.
  6. SLOW down. Default to EASE.expoOut / EASE.cinematic / EASE.hero. Use
     tiktokPunch / elastic / bouncy SPARINGLY — once per render, on the hero
     moment only.
  7. TYPE that just says the thing. If the hero word is "BULLY", don't glitch
     it + chrome it + stagger it. Pick ONE treatment. The word is doing the
     work.
  8. FRAMES.long (36) and FRAMES.hold (45) exist on purpose — USE them for
     reveals, not FRAMES.short.

How to compose a render (the actual workflow):
- TREND PACKS are a STARTING POINT, not a checklist. Pick the closest pack,
  then USE 1-2 of its suggested motion helpers — never all four. Same for
  effects: 0 or 1, almost never two.
- For 90% of prompts → tiktokKineticCaption pack: TIKTOK_CAPTION + wordPop +
  one palette. Don't add anything else unless the prompt calls for it.
- Effects are condiments. Grain at 0.06 max. Vignette at 0.3 max. If the
  user didn't ask for "moody" / "film" / "vintage" — skip them entirely.
- Sparkles only when the prompt literally says coquette / magical / luxury.
- Glitch only when the prompt says glitch / cyber / hack. ONE glitch burst
  per render, max 8 frames.
- Confetti only when the prompt says celebrate / win / launch / drop.
- Transitions between scenes (Series) — use a *Transition helper, but only
  one type per render. Don't whip-pan into a glitch-cut into a zoom-punch.

Hard rules:
- NEVER hard-code colors. Always pull from a palette.
- NEVER write raw cubic-bezier(). Always use EASE.* names.
- .tsx imports: effects.tsx and layouts.tsx export JSX; the rest are .ts.
- If a primitive you need isn't in the library, write it inline. Don't grow
  the library mid-render.

GOOD EXAMPLE — restrained BRAT (one idea: type lands tight on lime, holds, done):

  import { palettes } from '../lib/palettes';
  import { EASE, FRAMES } from '../lib/easings';
  import { TYPE } from '../lib/typography';
  import { kerningIn, fadeIn } from '../lib/motion';

  const p = palettes.bratLime;
  // ONE word. ONE motion (kerning closes from 30 → 0). Holds for FRAMES.hold.
  // No effects layer. No staggered words. No rotation jitter. No grain.
  return (
    <AbsoluteFill style={{ background: p.bg, display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft: 80 }}>
      <span style={{
        ...TYPE.bratLockup,
        color: p.fg,
        letterSpacing: kerningIn(frame, { start: 0, dur: FRAMES.medium, from: 30, to: -8 }),
        opacity: fadeIn(frame, { start: 0, dur: FRAMES.short }),
      }}>brat</span>
    </AbsoluteFill>
  );

BAD EXAMPLE (what NOT to do — every helper at once, no breathing room):

  // Don't: wordPop + glitch + zoomPunch + grain + vignette + sparkles all
  // wrestling for attention. Eye doesn't know where to land. Screams AI.

If the prompt is more complex (e.g. "podcast clip caption that builds excitement"),
THEN add: wordPop on the words, ONE zoomPunch on the hero word at FRAMES.medium,
and stop. Don't reach for glitch and grain because they're in the library.

Style: terse. The user is editing in Premiere, not reading docs. One or two sentences plus the import marker is the goal. Skip preamble like "Sure, I'll help…".`;

// ─────────────────────────────────────────────────────────────────────────
// REMOTION BEST-PRACTICES INJECTION
// The remotion-best-practices skill must apply to EVERY render — reliably,
// not "maybe, if the spawned claude decides to read the rule files." The old
// system prompt only POINTED at the files ("load these"), which claude read
// inconsistently → one render had the craft rules, the next didn't, and
// quality wobbled. So we read the core rule files at startup and inject them
// straight into the render system prompt.
//
// Reading from the skill files (not hardcoding) keeps this in sync: edit the
// skill, restart the bridge, the new rules apply. If the skill is missing,
// the blocks are empty strings and the prompt still works (graceful).
//
//   CORE  = animations.md — hard correctness rules (useCurrentFrame, no CSS
//           transitions). Injected in ALL render modes, including fast.
//   CRAFT = motion-design.md + timing.md — the spring catalog, multi-act
//           choreography, easing reference. Injected in default + slow only;
//           fast mode is deliberately minimal so it gets CORE only.
// ─────────────────────────────────────────────────────────────────────────
const BP_RULES_DIR = path.join(os.homedir(), '.claude', 'skills', 'remotion-best-practices', 'rules');
function _readBPRule(file) {
  try {
    let s = fs.readFileSync(path.join(BP_RULES_DIR, file), 'utf8');
    // Strip YAML frontmatter — the rule body is what matters in-context.
    s = s.replace(/^---[\s\S]*?---\s*/, '').trim();
    return s;
  } catch { return ''; }
}
const BP_CORE  = _readBPRule('animations.md');
const BP_CRAFT = [_readBPRule('motion-design.md'), _readBPRule('timing.md')].filter(Boolean).join('\n\n---\n\n');
clog('bridge', 'info', 'best-practices loaded', {
  core: BP_CORE.length, craft: BP_CRAFT.length, dir: BP_RULES_DIR,
});

// Build the inject block for a given render mode. Empty string if no rules
// were found (skill not installed) — caller-safe.
function buildBestPracticesBlock(renderMode) {
  const parts = [];
  if (BP_CORE) parts.push(BP_CORE);
  if (renderMode !== 'fast' && BP_CRAFT) parts.push(BP_CRAFT);
  if (!parts.length) return '';
  return [
    '═══════════════════════════════════════════════════════════════════════════',
    'REMOTION BEST PRACTICES — these ALWAYS apply to the composition you write.',
    'Inlined from the remotion-best-practices skill so they are guaranteed in',
    'context. Follow them; they are what separate a polished render from a',
    'janky AI-looking one. (For task-specific techniques — captions, fonts,',
    'charts, voiceover, transitions — also read the matching rule file under',
    BP_RULES_DIR + '/ and the remotion-transitions skill.)',
    '═══════════════════════════════════════════════════════════════════════════',
    '',
    parts.join('\n\n'),
    '',
    '═══════════════════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
//  Account auth + render metering (OPTIONAL — fail-open when not configured).
//
//  Reads Supabase PUBLIC config from env vars or <WORK_DIR>/bridge-auth.json:
//      { "SUPABASE_URL": "https://xxxx.supabase.co", "SUPABASE_ANON_KEY": "ey..." }
//  When unset, AUTH_ENABLED=false and every render proceeds exactly as before —
//  so existing installs are unaffected until the owner opts in.
// ════════════════════════════════════════════════════════════════════════════
const alog = (m) => { try { clog('auth', /fail|error/i.test(String(m)) ? 'error' : 'info', String(m)); } catch {} };
let AUTH = { url: process.env.SUPABASE_URL || '', anon: process.env.SUPABASE_ANON_KEY || '' };
try {
  const cfgFile = path.join(WORK_DIR, 'bridge-auth.json');
  if ((!AUTH.url || !AUTH.anon) && fs.existsSync(cfgFile)) {
    const j = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    AUTH.url = AUTH.url || j.SUPABASE_URL || j.url || '';
    AUTH.anon = AUTH.anon || j.SUPABASE_ANON_KEY || j.anon || '';
  }
} catch (e) { alog('config read failed: ' + e.message); }
AUTH.url = String(AUTH.url).replace(/\/+$/, '');
const AUTH_ENABLED = !!(AUTH.url && AUTH.anon);
if (AUTH_ENABLED) alog('auth enabled for ' + AUTH.url); else alog('auth disabled (no Supabase config) — renders are ungated');

const SESSION_FILE = path.join(WORK_DIR, 'session.json');
let _session = null;
function loadSession() {
  if (_session) return _session;
  try { if (fs.existsSync(SESSION_FILE)) _session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch {}
  return _session;
}
function saveSession(s) { _session = s; try { fs.writeFileSync(SESSION_FILE, JSON.stringify(s), { mode: 0o600 }); } catch (e) { alog('session save failed: ' + e.message); } }
function clearSession() { _session = null; try { fs.unlinkSync(SESSION_FILE); } catch {} }

// Return a non-expired access token, refreshing via the refresh_token if needed.
// Refreshes are SERIALIZED: concurrent callers share one in-flight request, so we
// never use the same refresh token twice (which trips Supabase's reuse detection
// and revokes the whole session). A definitive auth failure clears the session so
// the panel shows "Sign in" instead of pretending to be signed in.
let _refreshing = null;
async function freshToken() {
  const s = loadSession();
  if (!s || !s.access_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at && (s.expires_at - now) > 60) return s.access_token;
  if (!s.refresh_token) return s.access_token;
  if (_refreshing) return _refreshing;          // coalesce concurrent refreshes
  _refreshing = (async () => {
    try {
      const r = await fetch(AUTH.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: AUTH.anon },
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      if (!r.ok) {
        alog('token refresh http ' + r.status);
        if (r.status === 400 || r.status === 401) { clearSession(); return null; }  // dead refresh token → sign out
        return (loadSession() || {}).access_token || null;
      }
      const j = await r.json();
      saveSession({ access_token: j.access_token, refresh_token: j.refresh_token || s.refresh_token, expires_at: j.expires_at || (now + (j.expires_in || 3600)), user: j.user || s.user });
      return j.access_token;
    } catch (e) { alog('token refresh failed: ' + e.message); return (loadSession() || {}).access_token || null; }
    finally { _refreshing = null; }
  })();
  return _refreshing;
}

// Call a Postgres RPC as the signed-in user. Returns parsed JSON (scalar/array) or null on error.
async function supaRPC(fn, token) {
  try {
    const r = await fetch(AUTH.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: AUTH.anon, Authorization: 'Bearer ' + token },
      body: '{}',
    });
    if (!r.ok) { alog('rpc ' + fn + ' http ' + r.status); return null; }
    return await r.json();
  } catch (e) { alog('rpc ' + fn + ' failed: ' + e.message); return null; }
}

// Owner accounts get unlimited everything (all features, no render metering),
// independent of their Supabase plan. Set OWNER_EMAILS (comma-separated) to override.
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'iprincemax72@gmail.com').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
function isOwnerEmail(email) { return !!email && OWNER_EMAILS.includes(String(email).toLowerCase()); }

async function authStatus() {
  if (!AUTH_ENABLED) return { enabled: false, signedIn: false };
  const s = loadSession();
  if (!s || !s.access_token) return { enabled: true, signedIn: false };
  const token = await freshToken();
  if (!token) return { enabled: true, signedIn: false };   // session expired & couldn't refresh → re-connect
  const usage = await supaRPC('my_usage', token);
  const u = Array.isArray(usage) ? usage[0] : usage;
  const email = (s.user && s.user.email) || '';
  const owner = isOwnerEmail(email);
  const plan = owner ? 'studio' : ((u && u.plan) || 'free');
  if (owner) _planCache = { plan: 'studio', at: Date.now() };
  else if (u && u.plan) _planCache = { plan: u.plan, at: Date.now() };   // don't cache 'free' on a transient RPC failure
  const meta = (s.user && (s.user.user_metadata || {})) || {};
  return {
    enabled: true, signedIn: true,
    email,
    name: meta.full_name || meta.name || email || 'Account',
    avatar: meta.avatar_url || '',
    owner,
    unlimited: owner,                                       // panel/dashboard show ∞ instead of X/Y
    usageKnown: owner ? true : !!u,                         // false when the lookup failed — UI shows "—" not a fake 0
    plan,
    renders_used: (u && u.renders_used != null) ? u.renders_used : 0,
    renders_limit: owner ? 999999 : ((u && u.renders_limit != null) ? u.renders_limit : 5),
  };
}

// Gate one render. { allowed:true } when ok; { allowed:false, reason:'signin'|'limit' } when blocked.
// Fail-open on config-absent or RPC error so we never wrongly block a paying user.
async function gateRender() {
  if (!AUTH_ENABLED) return { allowed: true };
  const s = loadSession();
  if (!s || !s.access_token) return { allowed: false, reason: 'signin' };
  if (isOwnerEmail(s.user && s.user.email)) return { allowed: true };   // owner = unlimited, no metering
  const token = await freshToken();
  if (!token) return { allowed: false, reason: 'signin' };   // session died → must re-connect
  const remaining = await supaRPC('consume_render', token);
  if (remaining === null) return { allowed: true };
  if (remaining === -1) return { allowed: false, reason: 'limit' };
  return { allowed: true, remaining };
}

// Page served in the system browser when the panel says "Sign in". It runs the
// Google OAuth flow, then hands the resulting session back to THIS bridge.
const CONNECT_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect your extension</title>'
+ '<style>:root{color-scheme:dark}*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#09090b;color:#fafafa;min-height:100vh;display:grid;place-items:center;padding:24px}'
+ '.card{width:100%;max-width:420px;background:#121215;border:1px solid rgba(255,255,255,.09);border-radius:20px;padding:34px;box-shadow:0 30px 80px -50px #000}'
+ '.brand{display:flex;align-items:center;gap:9px;font-weight:600;margin-bottom:22px}.glyph{width:30px;height:30px;border-radius:8px;background:#E2885F;color:#15110d;display:grid;place-items:center;font-family:Georgia,serif;font-style:italic;font-size:18px}'
+ '.big{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;margin-bottom:8px}.sub{color:#9a9aa1;font-size:.95rem;line-height:1.55;margin-bottom:22px}'
+ '.gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;font:600 1rem system-ui;color:#0a0a0b;background:#F4F4F5;border:0;border-radius:12px;padding:.9em;cursor:pointer}.gbtn:hover{filter:brightness(1.05)}.gbtn svg{width:18px;height:18px}b{color:#fafafa}</style></head>'
+ '<body><div class="card"><div class="brand"><span class="glyph">C</span><span>Claude <small style="color:#7c7d87">for Premiere Pro</small></span></div><div id="view"><p class="sub">Loading…</p></div></div>'
+ '<script type="module">'
+ 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";'
+ 'var SB_URL="' + AUTH.url + '",SB_ANON="' + AUTH.anon + '";'
+ 'var supabase=createClient(SB_URL,SB_ANON,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});'
+ 'var view=document.getElementById("view");function show(h){view.innerHTML=h;}'
+ 'var GSVG=\'<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>\';'
+ 'async function pushToBridge(s){var body=JSON.stringify({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,user:s.user});try{var r=await fetch("/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:body});return r.ok;}catch(e){return false;}}'
+ '(async function(){var res=await supabase.auth.getSession();var session=res.data.session;'
+ 'if(session){show(\'<p class="big">Connecting…</p>\');var ok=await pushToBridge(session);'
+ 'show(ok?\'<p class="big">&#10003; Connected</p><p class="sub">Your extension is signed in as <b>\'+(session.user.email||"")+\'</b>. Close this tab and head back to Premiere.</p>\':\'<p class="big">Almost there</p><p class="sub">Couldn&#39;t reach the local bridge. Make sure the Claude Bridge app is running, then reload this page.</p>\');return;}'
+ 'show(\'<p class="big">Connect your extension</p><p class="sub">Sign in with Google to link this device. Free plan includes 5 renders a month.</p><button id="g" class="gbtn">\'+GSVG+\' Continue with Google</button>\');'
+ 'document.getElementById("g").onclick=async function(){var r=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+"/connect",queryParams:{prompt:"select_account"}}});if(r.error)show(\'<p class="big">Error</p><p class="sub">\'+r.error.message+\'</p>\');};'
+ '})();'
+ '<\/script></body></html>';

// Plan → feature map (mirrors the panel). Auto-Edit is Studio-only.
const PLAN_FEATURES = { free: { autoedit: false }, creator: { autoedit: false }, studio: { autoedit: true } };
let _planCache = { plan: null, at: 0 };

// ── Parallel multi-version helpers ──────────────────────────────────────────
// Isolated copy of the Remotion project for one parallel version, so concurrent
// builds don't collide on Root.tsx / src. node_modules is SYMLINKED (shared,
// ~0 cost); only the tiny src/config is copied. Returns the workspace path.
function setupVersionWorkspace(tag, idx) {
  const base = path.join(WORK_DIR, 'remotion-intro');
  const ws = path.join(WORK_DIR, '.versions', String(tag).slice(0, 8) + '-v' + idx);
  try { fs.rmSync(ws, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(ws, { recursive: true });
  try { fs.symlinkSync(path.join(base, 'node_modules'), path.join(ws, 'node_modules'), 'dir'); } catch {}
  for (const f of ['package.json', 'remotion.config.ts', 'tsconfig.json']) {
    const s = path.join(base, f);
    if (fs.existsSync(s)) { try { fs.copyFileSync(s, path.join(ws, f)); } catch {} }
  }
  fs.cpSync(path.join(base, 'src'), path.join(ws, 'src'), { recursive: true });
  return ws;
}
// Run async thunks with a concurrency cap; results returned in order.
async function runWithConcurrency(thunks, limit) {
  const results = new Array(thunks.length);
  let next = 0;
  const worker = async () => {
    while (next < thunks.length) {
      const i = next++;
      try { results[i] = await thunks[i](); } catch { results[i] = null; }
    }
  };
  const n = Math.max(1, Math.min(limit || 1, thunks.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Track in-flight heavy requests so the periodic auto-update never restarts
  // the bridge mid-render. res 'close' fires on normal finish OR client abort.
  if (req.method === 'POST' && (req.url === '/chat' || req.url === '/autoedit' || req.url === '/autoedit/run' || req.url === '/autoedit/analyze' || req.url === '/autocut' || req.url === '/plan/questions')) {
    _heavyInflight++;
    res.on('close', () => { _heavyInflight = Math.max(0, _heavyInflight - 1); });
  }

  // Plan backstop: Auto-Edit / Auto-Cut are Studio-only. Only blocks when we KNOW
  // the plan isn't Studio (cache populated by /auth/status polls) — fail-open
  // otherwise, since the panel already locks the button.
  if (req.method === 'POST' && (req.url === '/autoedit' || req.url === '/autoedit/run' || req.url === '/autoedit/analyze' || req.url === '/autocut')) {
    if (AUTH_ENABLED && _planCache.plan && !(PLAN_FEATURES[_planCache.plan] || {}).autoedit) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Auto-Edit is a Studio feature — upgrade to unlock it.', planBlock: true, need: 'studio' }));
      return;
    }
  }

  // (dev /panel and /dev/reload-stream removed)

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
    res.end(JSON.stringify({ ok: true, session: SESSION_ID, outputDir: OUTPUT_DIR, auth: AUTH_ENABLED }));
    return;
  }

  // ── Account auth ────────────────────────────────────────────────────────
  // GET /connect — the sign-in page the panel opens in the system browser.
  if (req.method === 'GET' && (req.url === '/connect' || req.url.startsWith('/connect?'))) {
    if (!AUTH_ENABLED) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<body style="font-family:system-ui;background:#09090b;color:#fafafa;display:grid;place-items:center;height:100vh"><p>Sign-in isn\'t configured on this bridge yet.</p></body>'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(CONNECT_HTML);
    return;
  }
  // POST /auth/session — the connect page hands us the signed-in session.
  if (req.method === 'POST' && req.url === '/auth/session') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 256 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const p = JSON.parse(body || '{}');
        if (!p.access_token) { res.writeHead(400); res.end('{"error":"no token"}'); return; }
        saveSession({ access_token: p.access_token, refresh_token: p.refresh_token || '', expires_at: p.expires_at || 0, user: p.user || null });
        alog('signed in: ' + ((p.user && p.user.email) || '?'));
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch (e) { res.writeHead(400); res.end('{"error":"bad json"}'); }
    });
    return;
  }
  // GET /auth/status — { enabled, signedIn, email, name, avatar, plan, renders_used, renders_limit }
  if (req.method === 'GET' && req.url === '/auth/status') {
    authStatus()
      .then(st => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(st)); })
      .catch(e => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ enabled: AUTH_ENABLED, signedIn: false, error: String(e) })); });
    return;
  }
  // POST /auth/signout — forget the local session.
  if (req.method === 'POST' && req.url === '/auth/signout') {
    clearSession();
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    return;
  }

  // ── Unified log collector: ingest a log line from any module ──────────
  // The panel POSTs { module, level, msg, data, reqId } here. host.jsx
  // errors come through here too (panel forwards them). Fire-and-forget
  // from the caller's perspective — always 200, never blocks the UI.
  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 64 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const p = JSON.parse(body || '{}');
        clog(p.module || 'panel', p.level || 'info', p.msg || '', p.data, p.reqId);
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
    return;
  }

  // ── Read recent unified log lines — for debugging / Claude to fetch ───
  // GET /logs/recent?n=300&module=panel&level=error
  //   n      max lines to return (default 300, cap 2000)
  //   module filter to one module (panel | bridge | host | render)
  //   level  filter to one level+ (error | warn | info | debug)
  if (req.method === 'GET' && req.url.startsWith('/logs/recent')) {
    try {
      const u = new URL(req.url, 'http://localhost');
      const n = Math.min(2000, Math.max(1, parseInt(u.searchParams.get('n') || '300', 10) || 300));
      const fModule = u.searchParams.get('module');
      const fLevel = u.searchParams.get('level');
      const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
      const minRank = fLevel ? (LEVEL_RANK[fLevel] ?? 0) : 0;

      let raw = '';
      try { raw = fs.readFileSync(UNIFIED_LOG, 'utf8'); } catch {}
      let lines = raw.split('\n').filter(Boolean);
      // Parse + filter
      let recs = [];
      for (const ln of lines) {
        let r; try { r = JSON.parse(ln); } catch { continue; }
        if (fModule && r.module !== fModule) continue;
        if (fLevel && (LEVEL_RANK[r.level] ?? 1) < minRank) continue;
        recs.push(r);
      }
      recs = recs.slice(-n);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: recs.length, logFile: UNIFIED_LOG, lines: recs }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
    }
    return;
  }

  // Panel auto-reload — returns the mtime of the panel's index.html. The
  // panel polls this every 5s; if mtime changes, the panel reloads itself.
  // Single-shot fetch, no persistent connection — safe replacement for the
  // dev SSE we ripped out in v3.3.
  // Compare local panel version vs GitHub raw — used by the panel to
  // show an "Update Available" pill. Returns BOTH versions so the
  // panel can decide whether to nudge.
  if (req.method === 'GET' && req.url === '/check-update') {
    (async () => {
      const out = { ok: true, localVersion: null, remoteVersion: null, updateAvailable: false, source: LOCAL_SOURCE_DIR ? 'local' : 'github' };
      try {
        const installedPath = path.join(PANEL_DIR, 'index.html');
        const installed = fs.readFileSync(installedPath, 'utf8');
        const mInstalled = installed.match(/PANEL_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (mInstalled) out.localVersion = mInstalled[1];

        // Source-of-truth: local repo if present, else GitHub raw.
        let srcText = null;
        if (LOCAL_SOURCE_DIR) {
          try {
            srcText = fs.readFileSync(path.join(LOCAL_SOURCE_DIR, 'extension', 'com.claudebridge.panel', 'index.html'), 'utf8');
          } catch (e) { out.error = 'local source read failed: ' + e.message; }
        } else if (typeof fetch === 'function') {
          const r = await fetch(GITHUB_RAW + '/extension/com.claudebridge.panel/index.html?nc=' + Date.now(),
                               { headers: { 'Cache-Control': 'no-cache' } });
          if (r.ok) srcText = await r.text();
        }
        if (srcText) {
          const mRemote = srcText.match(/PANEL_VERSION\s*=\s*['"]([^'"]+)['"]/);
          if (mRemote) out.remoteVersion = mRemote[1];
        }
        if (out.localVersion && out.remoteVersion && out.localVersion !== out.remoteVersion) {
          out.updateAvailable = true;
        }
      } catch (e) { out.ok = false; out.error = String(e); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    })();
    return;
  }

  if (req.method === 'GET' && req.url === '/version') {
    try {
      const panelPath = path.join(
        process.env.HOME || '',
        'Library/Application Support/Adobe/CEP/extensions/com.claudebridge.panel/index.html'
      );
      const st = fs.statSync(panelPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ mtime: st.mtimeMs, session: SESSION_ID }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
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

      // stdin 'ignore' — otherwise the claude CLI emits a stderr warning
      // ("Warning: no stdin data received in 3s, proceeding without it.")
      // which the panel surfaces as if it were a fatal error.
      const proc = spawnClaude(args, {
        cwd: WORK_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
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
      // stdin 'ignore' — kill the "no stdin data received in 3s" warning.
      const proc = spawnClaude(args, {
        cwd: WORK_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
      });
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

  // PLAN MODE — generate smart multiple-choice questions for a build request.
  // The panel calls this first (when the Plan toggle is on), renders the
  // questions as clickable options, then sends the answers to /chat to build.
  if (req.method === 'POST' && req.url === '/plan/questions') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let p;
      try { p = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const message = (p.message || '').toString();
      if (!message.trim()) { res.writeHead(400); res.end('{"error":"empty message"}'); return; }
      try {
        const questions = await detectPlanQuestions(message, (m) => { console.log('  [planq] ' + m); });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, questions }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e.message || e) }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }

      const message = payload.message;
      const context = payload.context || null;
      const reqId   = payload.reqId || crypto.randomUUID();
      // Tab type — 'animation' (Remotion render pipeline) vs 'chat' (free
      // conversation, no rendering). Free-chat tabs use a different system
      // prompt that lets claude help with anything, not just animations.
      const tabMode = (payload.mode === 'chat') ? 'chat' : 'animation';
      // Render mode — fast / default / slow. Controls self-critique depth
      // and how much exploration Claude does. Backward-compat: old panels
      // send selfCritique:bool, and "mid" was the old name for "default".
      let renderMode = payload.renderMode;
      if (renderMode === 'mid') renderMode = 'default';
      if (!renderMode) {
        renderMode = (payload.selfCritique === false) ? 'fast' : 'default';
      }
      if (!['fast', 'default', 'slow'].includes(renderMode)) renderMode = 'default';
      if (!message) { res.writeHead(400); res.end('{"error":"empty message"}'); return; }

      // Multi-version fan-out — render N distinct takes of one prompt AT ONCE
      // (each in an isolated workspace), instead of one-after-another. Only
      // meaningful for animation tabs. maxParallel caps how many render
      // simultaneously (a Settings dial — rendering pegs the CPU, so bound it).
      let versionCount = parseInt(payload.versions, 10);
      if (!Number.isFinite(versionCount) || versionCount < 1) versionCount = 1;
      versionCount = Math.min(10, versionCount);
      if (tabMode === 'chat' || payload.planMode) versionCount = 1;
      let maxParallel = parseInt(payload.maxParallel, 10);
      if (!Number.isFinite(maxParallel) || maxParallel < 1) maxParallel = 3;
      maxParallel = Math.max(1, Math.min(versionCount, maxParallel));

      // Render metering — only gates actual renders (animation mode), never free chat.
      // Fail-open when auth isn't configured, so existing installs are unaffected.
      if (tabMode === 'animation') {
        const gate = await gateRender();
        if (!gate.allowed) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            reply: gate.reason === 'signin'
              ? "You're not signed in yet. Click the account icon at the top of the panel → **Sign in with Google** (takes 5 seconds), then try again."
              : "You've used all your renders for this month. Open your account from the panel's account menu to upgrade your plan, or wait for the monthly reset.",
            imports: [],
            authBlock: gate.reason || 'limit',
          }));
          return;
        }
      }

      // Resolve the output dir for THIS render. If the panel sent the
      // project's on-disk path, render INTO the project folder so the
      // user can delete a project + all its renders together. Falls back
      // to the global OUTPUT_DIR when no project is saved.
      let renderOutputDir = OUTPUT_DIR;
      let renderOutputNote = '';
      if (context && typeof context.projectPath === 'string' && context.projectPath.trim()) {
        try {
          const projectFolder = path.dirname(context.projectPath);
          // Sanity check: the parent must exist (project file is on disk)
          if (fs.existsSync(projectFolder)) {
            const candidate = path.join(projectFolder, 'Claude Animations');
            fs.mkdirSync(candidate, { recursive: true });
            renderOutputDir = candidate;
            renderOutputNote = ' (next to the open project — easy to delete with the project later)';
          }
        } catch (e) {
          // Fall back to OUTPUT_DIR silently
        }
      }

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
        ctxLines.push('Output dir for any rendered files: ' + renderOutputDir + renderOutputNote);
        ctxLines.push('IMPORTANT: render the final file into THE FOLDER ABOVE, not the global PremiereClaude/output. The user wants renders colocated with the open project.');
        ctxLines.push('');
        fullMessage = ctxLines.join('\n') + '\n' + message;
      }

      // If the user is asking for transparency, inject a hard reminder right
      // into the message — the system prompt covers it, but a direct note
      // where Claude can't skim past it is what actually sticks.
      if (/\b(transparent|transparency|no background|remove (the )?background|alpha channel|overlay|on top of|for v[2-9])\b/i.test(message)) {
        fullMessage = '[TRANSPARENCY REQUIRED] This output must have a real transparent '
          + 'background. (1) The Remotion composition root must NOT paint any '
          + 'background — no backgroundColor, no solid AbsoluteFill behind the '
          + 'content. (2) Render with --codec prores --prores-profile 4444 to a '
          + '.mov file. H.264/.mp4 CANNOT be transparent and will come out black. '
          + 'The final .mov pixel format must be yuva444p10le.\n\n'
          + fullMessage;
      }

      // ──────────────────────────────────────────────────────────────────
      // STYLE — match how plain `claude` in the terminal behaves: RESPECT what
      // the user asked for. The old "variation directive" force-injected a
      // RANDOM palette + font + motion + layout as "non-negotiable anchors" on
      // EVERY render — so "clean white title" came out as forced neon-glitch.
      // That single block is what wrecked small/mid prompts. Now: if the user
      // described any look at all, leave it untouched. Only when the prompt
      // gives NO aesthetic direction do we add a GENTLE nudge to make a
      // deliberate, fresh choice (with a seed so repeats aren't identical) —
      // never a forced, clashing style.
      // ──────────────────────────────────────────────────────────────────
      const _hasStyleCue = /\b(#[0-9a-fA-F]{3,8}|colou?rs?|palette|gradient|theme|styled?|aesthetic|vibe|looks?|mood|minimal|clean|simple|elegant|luxur|premium|sleek|bold|punchy|energetic|calm|soft|playful|serious|corporate|professional|modern|retro|vintage|y2k|neon|cyber|glitch|brutalist|editorial|magazine|pastel|dark|light|bright|moody|grain|gritty|font|serif|sans|mono|typeface|bebas|inter|helvetica|playfair|garamond|white|black|blue|red|green|gold|silver|pink|purple|orange|teal|cyan|magenta|yellow|beige|cream|navy|warm|cool|monochrome)\b/i.test(message);
      // Brand/platform-implied prompts already dictate their colors (a YouTube
      // subscribe is RED, iMessage is blue/green, Spotify is green, etc.). For
      // these, do NOT nudge toward "a fresh look" — that's what made the
      // subscribe button come out yellow instead of YouTube red. Let Claude
      // apply real brand logic.
      // Tightened to strong brand/platform signals only — standalone common
      // words (follow, bell, apple, google, story, notification…) were
      // over-triggering the brand note on ordinary prompts. Phrase forms
      // ("like button", "notification bell") stay because they ARE brand UI.
      const _hasBrandCue = /\b(subscribe|unsubscribe|you ?tube|instagram\b|tiktok|imessage|snapchat|linkedin|twitch|discord|spotify|netflix|whatsapp|facebook|like button|follow button|notification bell|subscribe button|bell icon)\b/i.test(message);
      const _seed = Math.random().toString(36).slice(2, 8);
      // PLAN-FIRST — the terminal gets great results partly because Claude
      // thinks the piece through before coding. Nudge the same here, plus
      // (only for style-less, non-brand prompts) ask for a committed, fresh look.
      const styleNote = (_hasStyleCue || _hasBrandCue) ? '' : (
        'The user did not specify a look. Make a DELIBERATE creative choice that\n' +
        'genuinely fits the content and mood — a palette, type, motion feel and\n' +
        'layout chosen on purpose. Avoid your default look and avoid producing the\n' +
        'same design you\'d give any other prompt (variation seed ' + _seed + '). This is a\n' +
        'nudge to commit to a fresh direction — it does NOT override anything the\n' +
        'request already implies.\n\n');
      // Always remind: when the content implies a real brand/platform, use its
      // real conventions and colors — never randomize away from them.
      const brandNote = _hasBrandCue ? (
        '[BRAND LOGIC] This involves a known brand/platform. Use its REAL colors\n' +
        'and conventions — e.g. a YouTube subscribe button is RED (#FF0000-ish) on\n' +
        'a clean light/white card, not a random color. Match what the brand\n' +
        'actually looks like; do not invent an off-brand palette.\n\n') : '';
      fullMessage =
        '[APPROACH] First, think the piece through before writing any code: the ONE\n' +
        'core idea, the 2-4 key beats, the motion feel, and the look. A clear plan\n' +
        'up front is what separates a great animation from a generic one. Build a\n' +
        'fresh component (unique name, don\'t reuse an old one), follow the\n' +
        'remotion-best-practices skill, then verify the result before finishing.\n\n' +
        brandNote +
        styleNote +
        '────────────────────────────────────────────────\n\n' +
        fullMessage;

      // Stream-JSON output gives us a JSONL feed of system/tool/assistant
      // events as they happen, so the bridge can push real-time progress to
      // the panel via SSE. The final assistant message is collected and
      // returned to the panel in the original /chat response shape.
      //
      // The SELF_CRITIQUE_BEGIN/END markers wrap the visual auto-fix loop
      // instructions. Render mode decides whether to keep that block and
      // what extra mode-specific guidance to prepend.
      //
      //   fast    — strip self-critique entirely; template-only, no exploration
      //   default — keep self-critique (1 retry); custom-built composition,
      //             written from scratch (no templates)
      //   slow    — keep self-critique + ask for 2 retries, 3-frame checks,
      //             and deliberate library exploration
      let resolvedSystemPrompt;
      if (tabMode === 'chat') {
        // Free-chat tab — short, focused system prompt. Claude is a chat
        // partner, not a render pipeline. Still gets Premiere context so it
        // can reason about the project / selected clip when relevant.
        resolvedSystemPrompt = [
          'You are Claude, running inside an Adobe Premiere Pro extension panel as a FREE-CHAT assistant.',
          '',
          'This is a CHAT tab. The user does NOT want a rendered video right now. They want to ask you questions, get advice, work through editing logic, debug scripts, brainstorm — anything.',
          '',
          'Each user message MAY be prefixed with a [PREMIERE CONTEXT] block describing the active project, sequence, playhead, and any selected clips. Use that context to give grounded answers when it\'s relevant; ignore it when the question is general.',
          '',
          'Hard rules:',
          '- DO NOT write Remotion compositions, DO NOT emit [[IMPORT:...]] markers, DO NOT render any files. Those belong in animation tabs.',
          '- DO NOT spawn rendering tools or write .tsx files. Just answer.',
          '- If the user asks for an actual rendered animation, tell them to switch to an animation tab (the + button next to the chat-bubble + button at the top).',
          '- Answer in plain markdown. Concise, useful, no filler. The user is editing video — they don\'t want a 5-paragraph essay; they want the answer.',
        ].join('\n');
      } else if (renderMode === 'slow') {
        // SLOW is the only mode that keeps the self-critique (render a middle
        // still, read it, check centering/clipping/contrast, one retry).
        // Strip just the markers, keep the block.
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__\n?/g, '')
          .replace(/__SELF_CRITIQUE_END__\n?/g, '');
      } else {
        // FAST and DEFAULT skip the self-critique entirely. The user asked to
        // drop the middle-frame "is everything centered" check from default —
        // it added ~20-30s + a retry per render. Best-practices rules (now
        // injected every time) cover the common layout mistakes up front, so
        // the check is no longer worth the wait on the default path. Use the
        // SLOW mode when you want the full verify-and-retry pass.
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__[\s\S]*?__SELF_CRITIQUE_END__\n?/g, '');
      }

      // The modes differ in CREATIVE AMBITION, not just QA rigor. The whole
      // point: Fast = one simple move; Slow = a layered, choreographed piece.
      // If Slow just critiques the same simple result harder, it's pointless.
      const MODE_HEADERS = {
        fast: [
          '═══════════════════════════════════════════════════════════════════════════',
          'MODE: FAST — quick + simple. Target ~1 minute of your time.',
          '═══════════════════════════════════════════════════════════════════════════',
          'AMBITION: deliberately LOW. The user wants something usable back fast,',
          'not impressive. Keep it minimal:',
          '- Copy the closest src/templates/ file, change ONLY the text/colors,',
          '  register, render. Done.',
          '- Composition duration: SHORT — 2-2.5 seconds (60-75 frames @ 30fps).',
          '- ONE simple motion only: a fade-in or a single pop. Nothing layered.',
          '- Do NOT read other library files. Do NOT add components. Do NOT',
          '  choreograph multiple moments. Do NOT animate the background.',
          '- Skip the self-critique step. Render once and ship.',
          '- One-sentence reply + import marker.',
          '═══════════════════════════════════════════════════════════════════════════',
          '',
        ].join('\n'),
        default: [
          '═══════════════════════════════════════════════════════════════════════════',
          'MODE: DEFAULT — build the animation yourself, from scratch.',
          '═══════════════════════════════════════════════════════════════════════════',
          'Do NOT copy a template. IGNORE the TEMPLATES section below entirely —',
          'it is only for Fast mode. Write a fresh, custom Remotion composition',
          'using your own judgment for the design and motion. You MAY use the',
          'style library (easings, palettes, typography, motion helpers) as',
          'building blocks, but the composition itself is yours — a real,',
          'purpose-built animation, not a template with the text swapped.',
          'Render once and ship — NO self-critique / still-frame check on',
          'Default (it added ~20-30s). Get the layout right the first time by',
          'following the best-practices rules above. Use Slow mode when you',
          'want the full verify-and-retry pass.',
          '═══════════════════════════════════════════════════════════════════════════',
          '',
        ].join('\n'),
        slow: [
          '═══════════════════════════════════════════════════════════════════════════',
          'MODE: SLOW — a layered, choreographed piece. Take 3-5 minutes.',
          '═══════════════════════════════════════════════════════════════════════════',
          'AMBITION: deliberately HIGH. This is the mode where the output should',
          'be VISIBLY more impressive than Fast/Mid — not the same thing rendered',
          'slower. If your Slow result looks like the Fast result, you failed.',
          '',
          'What "more impressive" actually means — build a CHOREOGRAPHED SEQUENCE,',
          'not a static card with one fade. The composition must have 3-4 DISTINCT',
          'animated moments that play out over time, each with its own timing:',
          '',
          '  1. The container/background arrives (scale-in, wipe, draw-on border,',
          '     or a subtle moving backdrop — pick ONE, do it well).',
          '  2. The text reveals as its own beat — word-by-word, line-by-line, or',
          '     kerning-in. NOT just appearing with the container.',
          '  3. An accent element does something — a rule draws across, an icon',
          '     pops, a number ticks, a highlight sweeps. One small detail that',
          '     a junior would skip and a senior would add.',
          '  4. A HOLD (everything sits still 15-30 frames so it can be read),',
          '     then optionally a small exit flourish.',
          '',
          'Concretely for THIS mode:',
          '- Composition duration: LONGER — 4-6 seconds (120-180 frames @ 30fps).',
          '  You need the runtime for choreography. A 2s clip cannot be layered.',
          '- Start from a template for the BASE, but you MUST then read 2-3 lib',
          '  files (motion-extra, presets, effects, backgrounds) and genuinely',
          '  add layers. The restraint rules still apply — every layer must EARN',
          '  its place and read clearly — but "restraint" here means "3-4 things',
          '  choreographed", not "1 thing". Slow is allowed more than Mid.',
          '- Stagger the timing. Moment 1 at frame 0-15, moment 2 at frame 12-30,',
          '  moment 3 at frame 25-45, hold from ~50, etc. Things should NOT all',
          '  happen on frame 0.',
          '- Think before writing: what is the ONE idea, then how do 3-4 elements',
          '  choreograph to deliver it over the full duration.',
          '',
          'Self-critique HARDER: render stills at THREE points — early (~20%),',
          'middle (~50%), late (~85%). A choreographed piece looks DIFFERENT at',
          'each — if all three look identical, your animation is too static, go',
          'add motion. Check all three against the 8 rules. You get up to TWO',
          'fix-and-re-render iterations. Use them to add craft, not just fix bugs.',
          '═══════════════════════════════════════════════════════════════════════════',
          '',
        ].join('\n'),
      };
      // Render-mode headers only apply to animation tabs (the headers explain
      // ambition/depth for compositions). Chat tabs skip them entirely.
      // Best-practices rules go FIRST (most authoritative), then the mode
      // header, then the base system prompt.
      if (tabMode !== 'chat') {
        resolvedSystemPrompt = (MODE_HEADERS[renderMode] || '') + resolvedSystemPrompt;
        resolvedSystemPrompt = buildBestPracticesBlock(renderMode) + resolvedSystemPrompt;
      }

      // PLAN MODE — the user flipped the header "Plan" toggle. This is a hard
      // override that goes at the VERY FRONT of the system prompt so it beats
      // the build-everything instructions below it. For this turn the agent
      // must interview + plan and STOP — no code, no files, no render.
      if (payload.planMode && tabMode !== 'chat') {
        const PLAN_MODE_BLOCK = [
          '═══════════════════════════════════════════════════════════════════════════',
          'PLAN MODE IS ACTIVE — THIS SECTION OVERRIDES EVERYTHING BELOW IT.',
          '═══════════════════════════════════════════════════════════════════════════',
          'The user turned ON Plan mode for THIS turn. You MUST NOT build anything now:',
          '  • Do NOT write or edit any .tsx/.ts/.js files.',
          '  • Do NOT run Remotion, npx, or any render command.',
          '  • Do NOT emit an [[IMPORT:...]] marker or produce a rendered file.',
          'Every instruction below about creating and rendering a composition is',
          'SUSPENDED for this one turn.',
          '',
          'Instead, do EXACTLY this and then end your turn:',
          '  1. Ask the user the clarifying questions you genuinely need to nail the',
          '     request — aspect ratio, duration, style/mood, exact colors, exact',
          '     text/content, how many graphics, and where they go. Only ask what is',
          '     actually unclear; do not interrogate.',
          '  2. Give a SHORT numbered plan of what you will build once they answer.',
          'Then STOP and wait for their reply. Keep it concise and in plain markdown.',
          '',
          'Do NOT render even if the request already sounds complete and detailed.',
          'The user will answer in their next message, and ONLY THEN do you build.',
          '═══════════════════════════════════════════════════════════════════════════',
          '',
          '',
        ].join('\n');
        resolvedSystemPrompt = PLAN_MODE_BLOCK + resolvedSystemPrompt;
        clog('bridge', 'info', 'plan mode active — interview+plan, no render', { reqId }, reqId);
      }

      console.log('  [chat] render mode: ' + renderMode + (payload.planMode ? ' [PLAN MODE]' : ''));
      clog('bridge', 'info', 'chat request', { renderMode, tabMode, msgLen: (message || '').length, hasContext: !!context }, reqId);

      console.log('\n> ' + message.slice(0, 80));
      broadcastProgress('Thinking', null, reqId);

      // Run claude once. Returns { ok, reply, error, idleKilled }. The caller
      // can retry if idleKilled=true and reply is empty.
      // opts (multi-version fan-out): { sysPrompt, message, cwd, quiet, procs }
      // override the shared single-render params so each parallel version runs
      // in its own isolated workspace, silently (no per-line progress spam),
      // and registers its child proc with the orchestrator for group-abort.
      function runClaudeOnce(retry, opts) {
        opts = opts || {};
        const useSys = opts.sysPrompt || resolvedSystemPrompt;
        const useMsg = opts.message   || fullMessage;
        const useCwd = opts.cwd       || WORK_DIR;
        const quiet  = !!opts.quiet;
        const args = [
          '-p',
          '--output-format', 'stream-json',
          '--verbose',
          '--permission-mode', 'bypassPermissions',
          '--append-system-prompt', useSys,
          '--no-session-persistence',
          useMsg,
        ];
        return new Promise(resolve => {
          // stdin 'ignore' — without it the claude CLI emits a benign stderr
          // warning ("Warning: no stdin data received in 3s") that the panel
          // surfaces as an error mid-animation. This is the main /chat path,
          // so it was the most visible offender.
          const proc = spawnClaude(args, {
            cwd: useCwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
          });
          if (opts.procs) opts.procs.push(proc);
          let stderr = '';
          let lineBuf = '';
          let finalReply = '';
          let lastActivity = Date.now();
          let idleKilled = false;
          let resolved = false;
          let aborted = false;

          const onAbort = () => {
            aborted = true;
            try { proc.kill('SIGKILL'); } catch {}
          };
          // In fan-out mode the orchestrator kills every child via opts.procs,
          // so skip the per-proc listener (keeps us under Node's listener cap).
          if (!opts.procs) req.once('aborted', onAbort);

          // Filter out the benign "no stdin data received in 3s" warning — it
          // is harmless (claude proceeds anyway) but if it ever leaks through
          // it surfaces in the panel as an "Error:" alarm. Belt-and-braces
          // alongside stdio:['ignore',...].
          proc.stderr.on('data', d => {
            const s = d.toString();
            if (/no stdin data received in \d+s/i.test(s)) return;
            stderr += s;
          });
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
              if (status && !quiet) broadcastProgress(status, null, reqId);
              if (evt.type === 'result' && typeof evt.result === 'string') finalReply = evt.result;
              if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
                for (const blk of evt.message.content) {
                  if (blk.type === 'text' && typeof blk.text === 'string') finalReply = blk.text;
                }
              }
            }
          });

          // No idle watchdog — complex prompts (HIGH extend with 7-12
          // components, multi-act compositions, long renders) legitimately
          // think and tool-use for many minutes between visible output.
          // The 90s "idle-killed" watchdog was punishing those. Only a
          // generous hard timeout remains as the absolute safety net so a
          // genuinely runaway process can't pin a slot forever.
          const HARD_TIMEOUT_MS = 30 * 60 * 1000;
          const hardKiller = setTimeout(() => {
            if (resolved) return;
            console.log('  [chat] hard timeout (30 min) — killing claude');
            try { proc.kill('SIGKILL'); } catch {}
          }, HARD_TIMEOUT_MS);

          const done = (obj) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(hardKiller);
            if (!opts.procs) { try { req.off('aborted', onAbort); } catch {} }
            resolve(obj);
          };

          proc.on('error', err => done({ ok:false, error:'claude CLI not found: ' + err.message }));
          proc.on('close', code => {
            if (aborted) return done({ ok:false, aborted:true });
            if (code !== 0) {
              // Build the best error message we can — stderr if present,
              // else mine the last few stream-json lines for an error event,
              // else fall back to the generic 'exit code N' so at least the
              // user knows what kind of failure to retry against.
              let err = stderr.trim();
              if (!err && lineBuf) {
                // Sometimes the final partial line in lineBuf has the error
                err = ('partial: ' + lineBuf.slice(-400)).trim();
              }
              if (!err) {
                err = 'Claude exited with code ' + code + '. Possible causes: quota / network / auth. Try again.';
              }
              return done({
                ok: false,
                reply: finalReply,
                idleKilled,
                error: err,
              });
            }
            done({ ok:true, reply: finalReply });
          });
        });
      }

      let chatDone = false;
      const sendErr = (m) => {
        if (chatDone) return; chatDone = true;
        broadcastProgressDone(reqId);
        try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: m, reqId })); } catch {}
      };
      const sendOk = (obj) => {
        if (chatDone) return; chatDone = true;
        broadcastProgressDone(reqId);
        try { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(Object.assign({ reqId }, obj))); } catch {}
      };

      // ── MULTI-VERSION FAN-OUT — render N distinct takes in parallel ────────
      // One prompt → N isolated workspaces → N claude builds running at once
      // (capped by maxParallel) → every render returned in a single response.
      // The panel drops one card per import. Each version is told to make a
      // genuinely different take and to suffix its output filename so the
      // concurrent renders don't collide in the shared output dir.
      if (versionCount > 1 && tabMode !== 'chat') {
        const REMOTION_BASE = WORK_DIR + '/remotion-intro';
        // Metering: version 1's credit was already consumed by gateRender()
        // above. Consume one more per additional version; stop when the user
        // runs out, so a 10-version ask gracefully degrades to "as many as you
        // can afford" instead of failing the whole batch.
        let allowedN = 1;
        if (AUTH_ENABLED) {
          for (let i = 2; i <= versionCount; i++) {
            const g = await gateRender();
            if (g && g.allowed) allowedN++; else break;
          }
        } else {
          allowedN = versionCount;
        }
        const N = Math.max(1, allowedN);
        const par = Math.max(1, Math.min(maxParallel, N));
        clog('bridge', 'info', 'multi-version fan-out', { requested: versionCount, rendering: N, parallel: par }, reqId);
        broadcastProgress('Building ' + N + ' versions in parallel', null, reqId);

        try { req.setMaxListeners(0); } catch {}
        const procs = [];
        let batchAborted = false;
        const onAbortAll = () => { batchAborted = true; for (const p of procs) { try { p.kill('SIGKILL'); } catch {} } };
        req.once('aborted', onAbortAll);

        const wsPaths = [];
        let doneCount = 0;
        const thunks = [];
        for (let i = 1; i <= N; i++) {
          const idx = i;
          thunks.push(async () => {
            let ws;
            try { ws = setupVersionWorkspace(reqId, idx); wsPaths.push(ws); }
            catch (e) { return { ok: false, error: 'workspace setup failed: ' + e.message }; }
            const vSys = resolvedSystemPrompt.split(REMOTION_BASE).join(ws);
            const seed = Math.random().toString(36).slice(2, 6);
            const vMsg =
                '[VERSION ' + idx + ' OF ' + N + ' — the user wants ' + N + ' DIFFERENT versions of this to '
              + 'choose from. Make THIS one a distinct take: a different composition, layout, motion feel and '
              + 'detailing from the other versions. Commit to one strong direction. Keep whatever the prompt '
              + 'explicitly specified (text, colors, ratio); vary everything it left open. Variation seed '
              + idx + '/' + N + '-' + seed + '.]\n'
              + '[OUTPUT FILENAME: end the rendered file name with "_v' + idx + '_' + seed + '" so it does not '
              + 'collide with the other versions rendering at the same time.]\n'
              + fullMessage;
            const rr = await runClaudeOnce(false, { sysPrompt: vSys, message: vMsg, cwd: ws, quiet: true, procs });
            doneCount++;
            broadcastProgress(doneCount + '/' + N + ' versions done', null, reqId);
            if (!rr.ok) return { ok: false, error: rr.error };
            const vReply = (rr.reply || '').trim();
            const imports = [];
            const reV = /\[\[IMPORT:([^\]]+)\]\]/g; let mv;
            while ((mv = reV.exec(vReply)) !== null) imports.push(mv[1].trim());
            return { ok: true, reply: vReply, imports };
          });
        }

        const results = await runWithConcurrency(thunks, par);
        try { req.off('aborted', onAbortAll); } catch {}

        // Best-effort cleanup of just THIS request's workspaces — never nuke the
        // whole .versions dir, a concurrent /chat may own siblings in there.
        for (const w of wsPaths) { try { fs.rmSync(w, { recursive: true, force: true }); } catch {} }

        if (batchAborted) { chatDone = true; broadcastProgressDone(reqId); clog('bridge', 'info', 'multi-version aborted by user', null, reqId); return; }

        const rawImports = [];
        for (const rr of results) { if (rr && rr.ok && Array.isArray(rr.imports)) rawImports.push(...rr.imports); }
        let safe;
        try { safe = (await Promise.all(rawImports.map(p => ensurePremiereImportable(p)))).filter(Boolean); }
        catch { safe = rawImports; }

        const made = safe.length;
        clog('bridge', 'info', 'multi-version done', { requested: versionCount, rendered: made }, reqId);
        let reply;
        if (made === 0) {
          reply = "I tried to make those versions but none rendered — give it another go.";
        } else {
          reply = (made === 1 ? "Here's your take" : "Here are " + made + " different takes")
            + " — preview each and import the one you like"
            + (made < versionCount ? " (rendered " + made + " of " + versionCount + " — you're out of renders for the rest this month)" : "")
            + ".";
        }
        sendOk({ reply, imports: safe, versions: made });
        return;
      }

      let r = await runClaudeOnce(false);
      // If claude was idle-killed and produced no output, the bridge process is
      // probably degraded. Auto-retry ONCE — the second attempt almost always
      // works because claude takes a fresh internal path.
      if (!r.ok && r.idleKilled && !(r.reply || '').trim()) {
        console.log('  [chat] auto-retrying after idle kill');
        broadcastProgress('Retrying', null, reqId);
        r = await runClaudeOnce(true);
      }

      if (r.aborted) { chatDone = true; broadcastProgressDone(reqId); clog('bridge', 'info', 'chat aborted by user', null, reqId); return; }
      if (!r.ok) { clog('bridge', 'error', 'chat failed', { error: r.error || 'claude failed', idleKilled: !!r.idleKilled }, reqId); return sendErr(r.error || 'claude failed'); }

      const reply = (r.reply || '').trim() || '(no response)';
      const rawImports = [];
      const re = /\[\[IMPORT:([^\]]+)\]\]/g;
      let m;
      while ((m = re.exec(reply)) !== null) rawImports.push(m[1].trim());
      console.log('< ' + String(reply).slice(0, 80));
      if (rawImports.length) console.log('  imports: ' + rawImports.join(', '));
      clog('bridge', 'info', 'chat done', { replyLen: reply.length, imports: rawImports.length }, reqId);

      try {
        const safePaths = await Promise.all(rawImports.map(p => ensurePremiereImportable(p)));
        sendOk({ reply, imports: safePaths.filter(Boolean) });
      } catch (err) {
        console.error('transcode error:', err.message);
        sendOk({ reply, imports: rawImports });
      }
    });
    return;
  }

  // Manual update trigger from the panel — pulls latest files from GitHub raw
  if (req.method === 'POST' && req.url === '/update') {
    handleUpdateRequest(req, res);
    return;
  }

  // ────────────────────────────────────────────────────────────────────────
  // CONFIG — auto-update flag. GET returns current value; POST { enabled }
  // writes a sentinel file to persist the preference across bridge
  // restarts. checkForUpdates() reads this file at launch.
  // ────────────────────────────────────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/config/auto-update') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: !isAutoUpdateDisabled(),
      envForced: process.env.CLAUDE_BRIDGE_NO_UPDATE === '1',
    }));
    return;
  }
  if (req.method === 'POST' && req.url === '/config/auto-update') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch {}
      const enabled = !!payload.enabled;
      try {
        if (enabled) {
          // Remove the disable flag → auto-update resumes
          try { if (fs.existsSync(NO_AUTO_UPDATE_FLAG)) fs.unlinkSync(NO_AUTO_UPDATE_FLAG); } catch {}
        } else {
          // Write the disable flag → auto-update skipped on next launch
          try { fs.writeFileSync(NO_AUTO_UPDATE_FLAG, 'disabled at ' + new Date().toISOString() + '\n'); } catch {}
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, enabled, envForced: process.env.CLAUDE_BRIDGE_NO_UPDATE === '1' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // ────────────────────────────────────────────────────────────────────────
  // SELF-RESTART — spawn a detached copy of this process, then exit. The new
  // process inherits the parent's stdio so the user still sees logs in their
  // terminal. ~300ms delay between response and process.exit gives the
  // response time to flush before the port is released.
  // ────────────────────────────────────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/restart') {
    try {
      // Spawn the replacement BEFORE we respond — if spawning fails we want
      // to error out cleanly and stay alive.
      //
      // CRITICAL: pass CLAUDE_BRIDGE_NO_UPDATE=1 to the replacement. /restart
      // means "refresh the running node process so my code edits take effect",
      // NOT "re-sync files from the source repo to disk". The user was
      // clicking /restart and getting their install reverted to whatever was
      // in the repo at the time (because the new bridge ran auto-update on
      // launch and copied repo→install). Now /restart leaves the install
      // file alone and just reloads node. Use the manual ↻ Update button if
      // you actually want auto-update to run.
      const childEnv = Object.assign({}, process.env);
      childEnv.CLAUDE_BRIDGE_NO_UPDATE = '1';
      const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
        cwd: process.cwd(),
        env: childEnv,
        detached: true,
        stdio: 'inherit',
      });
      child.unref();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, restartingIn: 300 }));

      // Give the response a moment to flush, then quit so the new process
      // can bind the port. The new bridge needs to wait for port to be free
      // — it has a small retry loop on listen() failure, but the OS
      // typically releases an SO_REUSEADDR socket immediately.
      setTimeout(() => {
        try { server.close(); } catch {}
        process.exit(0);
      }, 300);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
    return;
  }

  // Self-test: run several claude-spawn variants from INSIDE the bridge
  // process to find which one actually works here. Every variant works when
  // run standalone — so the failure is specific to this process context.
  if (req.method === 'GET' && req.url === '/testclaude') {
    const prompt = 'Reply ONLY with the JSON {"ok":true} and nothing else.';
    const baseArgs = ['-p', '--output-format', 'json', '--model', 'claude-haiku-4-5-20251001',
                      '--permission-mode', 'bypassPermissions', '--no-session-persistence'];
    const variants = [
      { name: 'A: stdio[ignore,pipe,pipe] cwd=tmp', opts: { cwd: os.tmpdir(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] }, useFile: false },
      { name: 'B: stdio default (all pipes) cwd=tmp', opts: { cwd: os.tmpdir(), env: process.env }, useFile: false },
      { name: 'C: stdout/stderr to FILES cwd=tmp', opts: { cwd: os.tmpdir(), env: process.env }, useFile: true },
      { name: 'D: detached + stdio[ignore,pipe,pipe]', opts: { cwd: os.tmpdir(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }, useFile: false },
      { name: 'E: minimal env {HOME,PATH,USER}', opts: { cwd: os.tmpdir(), env: { HOME: process.env.HOME, PATH: process.env.PATH, USER: process.env.USER }, stdio: ['ignore', 'pipe', 'pipe'] }, useFile: false },
    ];
    const runVariant = (v) => new Promise((resolve) => {
      const t0 = Date.now();
      const el = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
      let proc, outFile;
      try {
        if (v.useFile) {
          outFile = path.join(os.tmpdir(), 'testclaude-' + Date.now() + '.out');
          const fd = fs.openSync(outFile, 'w');
          proc = spawnClaude([...baseArgs, prompt], { ...v.opts, stdio: ['ignore', fd, fd] });
        } else {
          proc = spawnClaude([...baseArgs, prompt], v.opts);
        }
      } catch (e) {
        return resolve({ name: v.name, result: 'spawn threw: ' + e.message });
      }
      let out = '';
      if (proc.stdout) proc.stdout.on('data', d => out += d);
      if (proc.stderr) proc.stderr.on('data', d => out += d);
      let done = false;
      const finish = (r) => { if (done) return; done = true; clearTimeout(t); try { proc.kill('SIGKILL'); } catch {} resolve({ name: v.name, result: r }); };
      const t = setTimeout(() => finish('HUNG (killed at 30s)'), 30000);
      proc.on('exit', (code) => {
        let captured = out;
        if (v.useFile) { try { captured = fs.readFileSync(outFile, 'utf8'); fs.unlinkSync(outFile); } catch {} }
        finish('exit code=' + code + ' in ' + el() + ' — ' + (captured.length ? 'GOT ' + captured.length + 'B: ' + captured.slice(0, 80) : 'NO OUTPUT'));
      });
      proc.on('error', (e) => finish('proc error: ' + e.message));
    });
    (async () => {
      const results = [];
      for (const v of variants) results.push(await runVariant(v));
      // Variant F: call the REAL analyseTranscriptWithClaude with a realistic
      // 127-segment transcript — the exact code path the autocut uses.
      const fakeTranscript = [];
      let tt = 0;
      const words = 'the boxing match was really intense and he wanted to win the fight badly that day you know'.split(' ');
      for (let i = 0; i < 127; i++) {
        const d = 0.4 + Math.random() * 2;
        const txt = Array.from({ length: 3 + Math.floor(Math.random() * 7) }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
        fakeTranscript.push({ start: tt, end: tt + d, text: txt });
        tt += d;
      }
      const fT0 = Date.now();
      let fLog = [];
      try {
        const analysis = await analyseTranscriptWithClaude(fakeTranscript, {
          findFillers: true, findRepeats: true, log: (s) => fLog.push(s),
        });
        results.push({ name: 'F: REAL analyseTranscriptWithClaude (127 segs)', result: 'returned ' + (analysis.cuts ? analysis.cuts.length : '?') + ' cuts in ' + ((Date.now() - fT0) / 1000).toFixed(1) + 's, summary=' + analysis.summary, log: fLog });
      } catch (e) {
        results.push({ name: 'F: REAL analyseTranscriptWithClaude', result: 'THREW: ' + e.message, log: fLog });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bridgePid: process.pid, results }, null, 2));
    })();
    return;
  }

  // Add Edit via keyboard shortcut Cmd+Shift+K (default Premiere binding
  // for "Add Edit to All Tracks"). Sometimes works when menu-click doesn't.
  if (req.method === 'POST' && req.url === '/addedit-keystroke') {
    const osaLines = [
      'tell application "System Events"',
      '  set ppList to (every process whose name contains "Premiere Pro")',
      '  if (count of ppList) is 0 then error "Premiere not running"',
      '  set pp to item 1 of ppList',
      '  set frontmost of pp to true',
      '  delay 0.05',
      '  keystroke "k" using {command down, shift down}',
      'end tell',
    ];
    const args = [];
    for (const l of osaLines) { args.push('-e', l); }
    let errOut = '';
    let osa;
    try { osa = spawn('osascript', args); }
    catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
      return;
    }
    osa.stderr.on('data', d => { errOut += d; });
    osa.on('error', (e) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
    });
    osa.on('close', (code) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (code === 0) res.end(JSON.stringify({ ok: true }));
      else res.end(JSON.stringify({ ok: false, error: errOut.trim() || ('exit ' + code) }));
    });
    return;
  }

  // Add Edit — same as Cmd+K / Shift+C in Premiere. We use osascript to
  // click the Sequence > "Add Edit to All Tracks" menu item directly, which
  // is the SAME path Premiere takes when the user hits the shortcut.
  // Bypasses the QE razor() API entirely (which was a silent no-op on this
  // Premiere build). The panel calls this AFTER positioning the playhead.
  if (req.method === 'POST' && req.url === '/addedit') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      // Two candidates — "Add Edit to All Tracks" is the all-tracks variant
      // (Cmd+Shift+K). "Add Edit" (Cmd+K) only razors targeted tracks. We
      // try the all-tracks one first; fall through to "Add Edit" if not found.
      const osaLines = [
        'tell application "System Events"',
        '  set ppList to (every process whose name contains "Premiere Pro")',
        '  if (count of ppList) is 0 then error "Premiere not running"',
        '  set pp to item 1 of ppList',
        '  set frontmost of pp to true',
        '  tell pp',
        '    try',
        '      click menu item "Add Edit to All Tracks" of menu "Sequence" of menu bar 1',
        '    on error',
        '      try',
        '        click menu item "Add Edit" of menu "Sequence" of menu bar 1',
        '      on error errMsg',
        '        error "Add Edit menu item not found: " & errMsg',
        '      end try',
        '    end try',
        '  end tell',
        'end tell',
      ];
      const args = [];
      for (const l of osaLines) { args.push('-e', l); }

      let errOut = '';
      let osa;
      try {
        osa = spawn('osascript', args);
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
        return;
      }
      osa.stderr.on('data', d => { errOut += d; });
      osa.on('error', (e) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      });
      osa.on('close', (code) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (code === 0) {
          res.end(JSON.stringify({ ok: true }));
        } else {
          const msg = errOut.trim();
          const isPerm = /not allowed|assistive|accessibility|-1719|-25211/i.test(msg);
          res.end(JSON.stringify({
            ok: false,
            error: isPerm
              ? 'macOS blocked the Add Edit click — grant Accessibility permission. System Settings > Privacy & Security > Accessibility.'
              : (msg || ('osascript exited ' + code)),
          }));
        }
      });
    });
    return;
  }

  // Debug-log sink. ExtendScript's File.write proved unreliable (0-byte
  // files), so host.jsx returns its debug.steps to the panel and the panel
  // POSTs them here to be written where they can actually be read.
  if (req.method === 'POST' && req.url === '/applylog') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const steps = Array.isArray(payload.steps) ? payload.steps : [];
        const file = path.join(OUTPUT_DIR, 'autocut-apply-' + Date.now() + '.log');
        fs.writeFileSync(file, steps.join('\n') + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  // Reliable cross-app Undo. The panel calls this when the in-process
  // ccUndo (app.executeCommand) isn't available. We drive Premiere's
  // Edit > Undo menu item via osascript run as a REAL process — not via
  // ExtendScript File.execute(), which opens the .sh file in the user's
  // default editor instead of running it.
  //
  // Clicking menu item 1 of the Edit menu (always "Undo …", whatever the
  // last action was named) is more robust than sending a Cmd+Z keystroke,
  // which can land in a text field instead of the timeline.
  //
  // Requires macOS Accessibility permission for the process running node.
  if (req.method === 'POST' && req.url === '/undo') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let count = 1;
      try { count = parseInt(JSON.parse(body || '{}').count, 10) || 1; } catch {}
      count = Math.max(1, Math.min(200, count));

      const osaLines = [
        'tell application "System Events"',
        '  set ppList to (every process whose name contains "Premiere Pro")',
        '  if (count of ppList) is 0 then error "Premiere Pro is not running"',
        '  set pp to item 1 of ppList',
        '  set frontmost of pp to true',
        '  delay 0.25',
        '  set editMenu to menu 1 of (menu bar item "Edit" of menu bar 1 of pp)',
        '  repeat ' + count + ' times',
        '    click menu item 1 of editMenu',
        '    delay 0.06',
        '  end repeat',
        'end tell',
      ];
      const args = [];
      for (const l of osaLines) { args.push('-e', l); }

      let errOut = '';
      let osa;
      try {
        osa = spawn('osascript', args);
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
        return;
      }
      osa.stderr.on('data', d => { errOut += d; });
      osa.on('error', (e) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      });
      osa.on('close', (code) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (code === 0) {
          res.end(JSON.stringify({ ok: true, count }));
        } else {
          const msg = errOut.trim();
          const isPerm = /not allowed|assistive|accessibility|-1719|-25211/i.test(msg);
          res.end(JSON.stringify({
            ok: false,
            error: isPerm
              ? 'macOS blocked the undo — grant Accessibility permission to the bridge. System Settings > Privacy & Security > Accessibility.'
              : (msg || ('osascript exited ' + code)),
          }));
        }
      });
    });
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
      const { clipPath, clipDuration, clipIn, clipOut, useTranscript, includeSilence, findFillers, findRepeats } = payload;
      const reqId = payload.reqId || crypto.randomUUID();
      // includeSilence defaults to true for backwards compat with older panels
      const wantSilence = (includeSilence === undefined) ? true : !!includeSilence;
      // Granular flags (new). If neither granular flag is set, fall back to
      // the legacy `useTranscript` bool meaning "find both".
      const wantFillers = (findFillers !== undefined) ? !!findFillers : !!useTranscript;
      const wantRepeats = (findRepeats !== undefined) ? !!findRepeats : !!useTranscript;
      const wantTranscript = wantFillers || wantRepeats;
      if (!clipPath) { res.writeHead(400); res.end('{"error":"missing clipPath"}'); return; }
      if (!fs.existsSync(clipPath)) { res.writeHead(404); res.end('{"error":"file not found"}'); return; }

      const logPath = path.join(OUTPUT_DIR, `autocut-${reqId}.log`);
      // Per-request file log AND the unified collector (so cross-module
      // debugging sees autocut events inline with panel + chat events).
      const log = (s) => {
        try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {}
        clog('autocut', /error|fail/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId);
      };
      log(`AUTOCUT start clip=${clipPath} clipDuration=${clipDuration} clipIn=${clipIn} clipOut=${clipOut} silence=${wantSilence} fillers=${wantFillers} repeats=${wantRepeats}`);

      try {
        // Silence-only by default. Fast, reliable, doesn't involve Claude.
        // useTranscript is opt-in from Settings (false until user enables it).
        broadcastProgress('Detecting silences', 5, reqId);
        const allSilences = await detectSilences(clipPath, clipDuration, (p) => {
          broadcastProgress('Detecting silences', 5 + p * 90, reqId);
        });
        log(`ffmpeg silencedetect returned ${allSilences.length} silences across full source media`);
        for (let i = 0; i < Math.min(allSilences.length, 20); i++) {
          const s = allSilences[i];
          log(`  raw[${i}] ${s.start.toFixed(2)}s -> ${s.end.toFixed(2)}s (${(s.end - s.start).toFixed(2)}s)`);
        }

        // CRITICAL — ffmpeg scans the whole source media, but the clip on the
        // timeline only uses [clipIn, clipOut]. Silences outside that range
        // are NOT cuts to apply; they map to content that isn't even on the
        // timeline, and applying them would ripple-delete the wrong things.
        const inP  = (typeof clipIn  === 'number') ? clipIn  : 0;
        const outP = (typeof clipOut === 'number') ? clipOut : Number.MAX_SAFE_INTEGER;
        log(`clip used range in source: [${inP.toFixed(3)}, ${outP.toFixed(3)}] (${(outP - inP).toFixed(2)}s on timeline)`);
        // Leave a small breath at each end of a silence instead of removing
        // the whole thing — cutting a pause to zero makes a hard jump-cut.
        // 0.15s is enough to soften the cut without leaving dead air.
        const SILENCE_PAD = 0.15;
        const silenceCuts = allSilences
          .map(c => {
            // Clip the silence to the [inP, outP] window, then pad inward.
            const start = Math.max(c.start, inP) + SILENCE_PAD;
            const end   = Math.min(c.end,   outP) - SILENCE_PAD;
            if (end - start < 0.4) return null;  // too short after padding — skip
            const dur = end - start;
            return {
              start, end, duration: dur, kind: 'silence',
              reason: 'long pause (' + dur.toFixed(1) + 's)',
            };
          })
          .filter(Boolean);
        log(`silenceCuts after clamp to clip range: ${silenceCuts.length}`);
        for (let i = 0; i < Math.min(silenceCuts.length, 30); i++) {
          const s = silenceCuts[i];
          log(`  cut[${i}] source ${s.start.toFixed(2)}->${s.end.toFixed(2)} (${s.duration.toFixed(2)}s)`);
        }
        console.log('  [autocut] silences in source: ' + allSilences.length + ', within clip [' + inP.toFixed(2) + ',' + outP.toFixed(2) + ']: ' + silenceCuts.length);

        // Honor includeSilence — if user only wants repeats, drop silence cuts
        // but still keep them around for the transcript-merge logic.
        let finalCuts = wantSilence ? silenceCuts : [];
        let transcribed = false;
        let summary = (wantSilence && silenceCuts.length)
          ? ('Found ' + silenceCuts.length + ' pauses. Cutting ' + silenceCuts.reduce((s,c) => s + (c.end-c.start), 0).toFixed(1) + 's total.')
          : (wantSilence ? 'No pauses detected.' : null);

        if (wantTranscript) {
          // Local pipeline: ffmpeg → parakeet-mlx → claude (text in,
          // JSON out). What Claude looks for is governed by `wantFillers` and
          // `wantRepeats` so the user can opt into them independently.
          log(`running transcript analysis — fillers=${wantFillers} repeats=${wantRepeats}`);
          const baseSilences = wantSilence ? silenceCuts : [];
          const analysisResult = await transcriptCutsLocal(
            clipPath, clipDuration, inP, outP, baseSilences, reqId,
            { findFillers: wantFillers, findRepeats: wantRepeats, log }
          );
          log(`transcript result: ${analysisResult ? JSON.stringify({ transcribed: analysisResult.transcribed, cuts: (analysisResult.cuts || []).length, summary: analysisResult.summary }) : 'null'}`);
          if (analysisResult.cuts && analysisResult.cuts.length) {
            finalCuts = analysisResult.cuts;
            transcribed = !!analysisResult.transcribed;
            summary = analysisResult.summary || summary;
          } else {
            log(`transcript step returned 0 cuts — falling back to silence-only`);
          }
        }
        // Full dump of the final cut list so the log is enough to diagnose
        // any "didn't cut X" complaint.
        log(`==== FINAL CUT LIST (${finalCuts.length} cuts) ====`);
        for (let i = 0; i < finalCuts.length; i++) {
          const c = finalCuts[i];
          log(`  [${i}] ${c.start.toFixed(2)}->${c.end.toFixed(2)} (${(c.end - c.start).toFixed(2)}s) kind=${c.kind || '?'} reason=${(c.reason || '').slice(0, 80)}`);
        }

        let totalCut = 0;
        for (const c of finalCuts) totalCut += (c.end - c.start);
        log(`FINAL: ${finalCuts.length} cuts totalling ${totalCut.toFixed(2)}s, method=${transcribed ? 'silence+transcript' : 'silence-only'}`);

        broadcastProgressDone(reqId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          reqId, cuts: finalCuts, totalCut, transcribed, summary, logFile: logPath,
          method: transcribed ? 'silence+transcript' : 'silence-only',
        }));
      } catch (e) {
        log(`ERROR ${e.message || e}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      }
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTO EDIT — read transcript, identify key moments, generate motion
  //  graphics, return list of {file, atSec, type, track} for the panel to
  //  drop on the timeline.
  //
  //  Moment schema (the contract between Claude and the renderer):
  //    {
  //      id: string,                          // uuid
  //      type: 'stat'|'quote'|'name'|'list'|'callout'|'question'|'section'|'fact',
  //      startSec: number,                    // when the underlying speech starts
  //      endSec: number,                      // when it ends
  //      label: string,                       // short human description
  //      payload: object,                     // template-specific fields
  //      trendPack: string,                   // optional override
  //      confidence: number                   // 0..1
  //    }
  // ═══════════════════════════════════════════════════════════════════════

  if (req.method === 'POST' && req.url === '/autoedit-cancel') {
    let killed = 0;
    if (_activeAutoedit) {
      _activeAutoedit.aborted = true;
      for (const c of _activeAutoedit.children) {
        try { c.kill('SIGKILL'); killed++; } catch {}
      }
      _activeAutoedit.children.clear();
      broadcastProgressDone();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, killed }));
    return;
  }

  if (req.method === 'POST' && req.url === '/autoedit') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }

      const {
        clipPath,
        clipDuration,
        clipIn,
        clipOut,
        density = 'moderate',       // sparse | moderate | dense
        styleOverride = 'auto',     // 'auto' | trend pack name
        premiereCaptions = null,    // [{ startSec, endSec, text }] in source-media time, from Premiere's captions
      } = payload;
      const reqId = payload.reqId || crypto.randomUUID();

      if (!clipPath) { res.writeHead(400); res.end('{"error":"missing clipPath"}'); return; }
      if (!fs.existsSync(clipPath)) { res.writeHead(404); res.end('{"error":"file not found"}'); return; }

      _activeAutoedit = { children: new Set(), aborted: false };
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      // Per-request file log AND the unified collector.
      const log = (s) => {
        try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {}
        clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId);
      };

      try {
        const inP  = (typeof clipIn  === 'number') ? clipIn  : 0;
        const outP = (typeof clipOut === 'number') ? clipOut : (clipDuration || 600);
        const totalDur = outP - inP;

        log(`AUTO EDIT start clip=${clipPath} in=${inP} out=${outP} dur=${totalDur} density=${density} style=${styleOverride} premiereCaptions=${premiereCaptions ? premiereCaptions.length : 'null'}`);

        // ── Preflight ─────────────────────────────────────────────────────
        if (totalDur < 30) {
          broadcastProgressDone(reqId);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Clip is too short (need at least 30s)', reqId }));
          _activeAutoedit = null;
          return;
        }

        // ── 1. Get transcript. Prefer Premiere's own captions (instant) ───
        //      and only fall back to parakeet (~5-10s) if they're missing.
        let sentences;
        if (Array.isArray(premiereCaptions) && premiereCaptions.length >= 3) {
          log(`using Premiere captions: ${premiereCaptions.length} sentences`);
          broadcastProgress('Using Premiere captions', 15, reqId);
          sentences = premiereCaptions
            .filter(s => s && typeof s.startSec === 'number' && typeof s.endSec === 'number' && s.text && s.startSec >= inP - 0.5 && s.endSec <= outP + 0.5)
            .map((s, i) => ({ i, startSec: s.startSec, endSec: s.endSec, text: String(s.text).trim() }))
            .filter(s => s.text.length > 0);
          log(`normalised from captions: ${sentences.length} sentence units`);
        } else {
          // Transcribe fallback when Premiere captions aren't available
          broadcastProgress('Extracting audio', 5, reqId);
          if (_activeAutoedit.aborted) throw new Error('cancelled');
          const wavPath = await extractAudioForTranscription(clipPath, inP, outP);

          broadcastProgress('Transcribing', 12, reqId);
          if (_activeAutoedit.aborted) throw new Error('cancelled');
          const transcriptRaw = await runTranscribe(wavPath, totalDur);
          log(`parakeet transcript: ${(transcriptRaw || []).length} sentence segments`);

          if (!transcriptRaw || transcriptRaw.length < 3) {
            broadcastProgressDone(reqId);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Couldn\'t hear much speech in this clip', reqId }));
            _activeAutoedit = null;
            return;
          }
          // The transcriber returns segments as { start, end, text } with
          // start/end already in seconds.
          sentences = transcriptRaw.map((seg, i) => ({
            i,
            startSec: inP + (typeof seg.start === 'number' ? seg.start : 0),
            endSec:   inP + (typeof seg.end   === 'number' ? seg.end   : 0),
            text:     (seg.text || '').trim(),
          })).filter(s => s.text.length > 0);
          log(`normalised from parakeet: ${sentences.length} sentence units`);
        }

        if (sentences.length < 3) {
          broadcastProgressDone(reqId);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Not enough speech in this clip', reqId }));
          _activeAutoedit = null;
          return;
        }

        // ── 3. Ask Claude to identify moments ─────────────────────────────
        broadcastProgress('Finding key moments', 28, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const moments = await detectMoments(sentences, density, styleOverride, reqId, log);
        log(`moments raw: ${moments.length}`);

        // ── 4. Anti-collision + spacing (or gap-fill for full coverage) ───
        let filtered;
        if (density === 'full') {
          // Full coverage: don't drop anything for spacing. Instead, GUARANTEE
          // no gaps — fill every uncovered span with a moment built from the
          // transcript. Light de-dup only (drop exact-overlap duplicates).
          const sorted = [...moments].sort((a, b) => a.startSec - b.startSec);
          const deduped = [];
          let lastEnd = -Infinity;
          for (const m of sorted) {
            if (m.startSec < lastEnd - 0.3) continue;   // overlapping dupe
            deduped.push(m);
            lastEnd = m.endSec;
          }
          filtered = fillGaps(deduped, sentences, inP, outP, 2.0);
          log(`full coverage: ${deduped.length} key moments + gap-fill → ${filtered.length} total`);
        } else {
          const minGapSec = density === 'sparse' ? 8 : density === 'dense' ? 2 : 4;
          const maxPerMin = density === 'sparse' ? 3 : density === 'dense' ? 10 : 6;
          filtered  = spaceMoments(moments, minGapSec, maxPerMin, totalDur);
          log(`moments after spacing: ${filtered.length}`);
        }

        if (!filtered.length) {
          broadcastProgressDone(reqId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, reqId, applied: [], skipped: [], summary: 'No suitable moments found.' }));
          _activeAutoedit = null;
          return;
        }

        // ── 5. Custom-generate each moment's graphic ──────────────────────
        // Claude writes a fresh Remotion composition per moment — no
        // templates. Slow (minutes each) but every graphic is bespoke.
        broadcastProgress('Generating motion graphics', 40, reqId);
        const renderResults = await generateMomentsParallel(filtered, reqId, log, (done, total) => {
          const pct = 40 + Math.floor((done / total) * 50);
          broadcastProgress(`Generating motion graphics (${done}/${total})`, pct, reqId);
        });

        const applied = renderResults.filter(r => r.ok);
        const skipped = renderResults.filter(r => !r.ok);
        log(`render done: ok=${applied.length} skipped=${skipped.length}`);

        broadcastProgressDone(reqId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          reqId,
          applied,
          skipped,
          summary: `${applied.length}/${filtered.length} graphics ready` + (skipped.length ? ` (${skipped.length} skipped)` : ''),
          logFile: logPath,
        }));
      } catch (e) {
        log(`ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      } finally {
        _activeAutoedit = null;
      }
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AUTO EDIT v2 — two-phase: /analyze (transcribe + ask questions) then
  //  /run (answer-steered plan → fit-check → generate). Supports multi-clip
  //  selection and nested sequences (segments come pre-resolved from host.jsx).
  // ═══════════════════════════════════════════════════════════════════════
  if (req.method === 'POST' && req.url === '/autoedit/analyze') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId || crypto.randomUUID();
      const segments = Array.isArray(payload.segments) ? payload.segments : null;
      const density = payload.density || 'moderate';
      const style = payload.style || 'auto';
      if (!segments || !segments.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing segments', reqId })); return; }
      for (const s of segments) {
        if (!s || !s.path || !fs.existsSync(s.path)) { res.writeHead(404); res.end(JSON.stringify({ error: 'media file not found: ' + ((s && s.path) || '?'), reqId })); return; }
      }
      _activeAutoedit = { children: new Set(), aborted: false };
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId); };
      try {
        const spanStart = (payload.span && typeof payload.span.start === 'number') ? payload.span.start : Math.min(...segments.map(s => Number(s.timelineStart) || 0));
        let spanEnd = (payload.span && typeof payload.span.end === 'number') ? payload.span.end : null;
        log(`AUTO EDIT analyze reqId=${reqId} segs=${segments.length} density=${density}`);

        broadcastProgress('Extracting audio', 6, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const { wavPath, totalDur, timeMap } = await extractConcatAudio(segments, reqId, log);
        if (spanEnd == null) spanEnd = spanStart + totalDur;
        if (totalDur < 5) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: 'Selection is too short (need at least ~5s of audio)', reqId })); _activeAutoedit = null; return; }

        broadcastProgress('Transcribing', 16, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const transcriptRaw = await runTranscribe(wavPath, totalDur);
        log(`parakeet: ${(transcriptRaw || []).length} segments`);
        if (!transcriptRaw || transcriptRaw.length < 3) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: "Couldn't hear much speech in the selection", reqId })); _activeAutoedit = null; return; }

        const sentences = transcriptRaw.map((seg, i) => {
          const cs = (typeof seg.start === 'number') ? seg.start : 0;
          let ce = (typeof seg.end === 'number') ? seg.end : cs;
          // Keep the sentence inside the clip its start belongs to. Without
          // this, a sentence that straddles a multi-clip concat boundary would
          // map its end into the NEXT clip — producing a graphic that spans the
          // timeline gap between two non-adjacent selected clips.
          const si = concatSegIndex(timeMap, cs);
          const segEnd = timeMap[si].concatStart + timeMap[si].dur;
          if (ce > segEnd) ce = segEnd;
          return {
            i,
            startSec: concatToTimeline(timeMap, cs),
            endSec:   concatToTimeline(timeMap, ce),
            text:     (seg.text || '').trim(),
          };
        }).filter(s => s.text.length > 0);
        if (sentences.length < 3) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: 'Not enough speech in the selection', reqId })); _activeAutoedit = null; return; }

        broadcastProgress('Reading the speech', 24, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const questions = await detectInterviewQuestions(sentences, density, log);
        _aeCacheSet(reqId, { sentences, span: { start: spanStart, end: spanEnd }, density, style });
        log(`analyze done: ${sentences.length} sentences, ${questions.length} questions`);

        broadcastProgressDone(reqId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, reqId, questions, sentenceCount: sentences.length, durationSec: (spanEnd - spanStart) }));
      } catch (e) {
        log(`analyze ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      } finally { _activeAutoedit = null; }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/autoedit/run') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId;
      const answers = (payload.answers && typeof payload.answers === 'object') ? payload.answers : {};
      const cached = reqId && _autoeditCache.get(reqId);
      if (!cached) { res.writeHead(400); res.end(JSON.stringify({ error: 'Auto-Edit session expired — run analyze again', reqId })); return; }
      _activeAutoedit = { children: new Set(), aborted: false };
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId); };
      try {
        const { sentences, span } = cached;
        const density = payload.density || cached.density || 'moderate';
        const style = payload.style || cached.style || 'auto';
        const spanStart = span.start, spanEnd = span.end, totalDur = spanEnd - spanStart;
        const styleMode = (answers.styleConsistency === 'vary') ? 'vary' : 'same';
        const tone = answers.tone || 'minimal';
        const styleSpec = buildStyleSpec(tone);
        // Aspect ratio → overlay resolution. Default landscape 1920x1080.
        const rm = String(answers.ratio || '1920x1080').match(/(\d{3,4})\s*x\s*(\d{3,4})/);
        let vidW = rm ? parseInt(rm[1], 10) : 1920;
        let vidH = rm ? parseInt(rm[2], 10) : 1080;
        if (!(vidW >= 240 && vidW <= 4096)) vidW = 1920;
        if (!(vidH >= 240 && vidH <= 4096)) vidH = 1080;
        log(`AUTO EDIT run reqId=${reqId} density=${density} styleMode=${styleMode} tone=${tone} res=${vidW}x${vidH} answers=${JSON.stringify(answers)}`);

        // ── Plan (answer-steered) ─────────────────────────────────────────
        broadcastProgress('Planning the edit', 30, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const guidance = buildMomentGuidance(answers);
        const moments = await detectMoments(sentences, density, style, reqId, log, guidance);
        log(`moments raw: ${moments.length}`);

        let filtered;
        if (density === 'full') {
          const sorted = [...moments].sort((a, b) => a.startSec - b.startSec);
          const deduped = []; let lastEnd = -Infinity;
          for (const m of sorted) { if (m.startSec < lastEnd - 0.3) continue; deduped.push(m); lastEnd = m.endSec; }
          filtered = fillGaps(deduped, sentences, spanStart, spanEnd, 2.0);
        } else {
          const minGapSec = density === 'sparse' ? 8 : density === 'dense' ? 2 : 4;
          const maxPerMin = density === 'sparse' ? 3 : density === 'dense' ? 10 : 6;
          filtered = spaceMoments(moments, minGapSec, maxPerMin, totalDur);
        }
        log(`after spacing: ${filtered.length}`);

        // ── Fit-check (the "double check it fits the video" step) ─────────
        broadcastProgress('Double-checking the plan fits', 38, reqId);
        if (_activeAutoedit.aborted) throw new Error('cancelled');
        const verified = await verifyPlan(filtered, sentences, spanStart, spanEnd, log);
        log(`verify: ${verified.report}`);
        let plan = verified.moments;
        // FULL coverage: tile the final plan so verify-dropped moments can't
        // re-open a gap. Every second of the span ends up under a graphic.
        if (density === 'full' && plan.length) {
          plan = makeContiguous(plan, spanStart, spanEnd);
          log(`full coverage: tiled ${plan.length} moments contiguous ${spanStart.toFixed(1)}-${spanEnd.toFixed(1)}s`);
        }
        if (!plan.length) {
          broadcastProgressDone(reqId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, reqId, applied: [], skipped: [], summary: 'No suitable moments found.', planReport: verified.report }));
          _activeAutoedit = null;
          return;
        }

        // ── Generate (style-locked or varied per the answers) ─────────────
        broadcastProgress('Generating motion graphics', 42, reqId);
        const renderResults = await generateMomentsParallel(plan, reqId, log, (done, total) => {
          broadcastProgress(`Generating motion graphics (${done}/${total})`, 42 + Math.floor((done / total) * 48), reqId);
        }, { styleMode, styleSpec, width: vidW, height: vidH });

        const applied = renderResults.filter(r => r && r.ok).map(r => ({ ...r, timelineSec: r.atSec }));
        const skipped = renderResults.filter(r => r && !r.ok);
        log(`render done ok=${applied.length} skipped=${skipped.length}`);

        broadcastProgressDone(reqId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true, reqId, applied, skipped, planReport: verified.report,
          summary: `${applied.length}/${plan.length} graphics ready` + (skipped.length ? ` (${skipped.length} skipped)` : ''),
          logFile: logPath,
        }));
      } catch (e) {
        log(`run ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      } finally { _activeAutoedit = null; }
    });
    return;
  }

  res.writeHead(404); res.end();
});

// Auto-update — on launch, the bridge pulls the latest panel + bridge files
// from a SOURCE and diffs against on-disk; rewrite only if changed.
//
// Source resolution order:
//   1. CLAUDE_BRIDGE_LOCAL_SOURCE env var (an absolute repo path)
//   2. Auto-detect: ~/All Claude Work/claude-extension-premiere-pro-2026/
//      (the canonical dev path) — used IF the dir exists and has the
//      expected structure on disk
//   3. GitHub raw (fallback for installer users who don't have the repo)
//
// Skip the whole thing with CLAUDE_BRIDGE_NO_UPDATE=1 in the env.
const GITHUB_RAW = 'https://raw.githubusercontent.com/iprincemax72-maker/claude-extension-premiere-pro-2026/main';

function _resolveLocalSourceDir() {
  const candidates = [];
  if (process.env.CLAUDE_BRIDGE_LOCAL_SOURCE) candidates.push(process.env.CLAUDE_BRIDGE_LOCAL_SOURCE);
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, 'All Claude Work', 'claude-extension-premiere-pro-2026'));
    candidates.push(path.join(process.env.HOME, 'claude-extension-premiere-pro-2026'));
  }
  for (const dir of candidates) {
    try {
      // Validate it looks like the right repo — must have bridge/bridge.js
      // and extension/com.claudebridge.panel/index.html
      if (fs.existsSync(path.join(dir, 'bridge', 'bridge.js')) &&
          fs.existsSync(path.join(dir, 'extension', 'com.claudebridge.panel', 'index.html'))) {
        return dir;
      }
    } catch {}
  }
  return null;
}
const LOCAL_SOURCE_DIR = _resolveLocalSourceDir();

// Each target now has a `relPath` (relative path WITHIN the source repo) and
// a `dest` (where to write on disk). The reader picks local file or GitHub
// URL based on whether LOCAL_SOURCE_DIR is set.
const UPDATE_TARGETS = [
  { relPath: 'extension/com.claudebridge.panel/index.html',     dest: path.join(PANEL_DIR, 'index.html'),     label: 'panel UI' },
  { relPath: 'extension/com.claudebridge.panel/jsx/host.jsx',   dest: path.join(PANEL_DIR, 'jsx', 'host.jsx'), label: 'ExtendScript', needsPremRestart: true },
  { relPath: 'extension/com.claudebridge.panel/CSXS/manifest.xml', dest: path.join(PANEL_DIR, 'CSXS', 'manifest.xml'), label: 'manifest' },
  { relPath: 'bridge/bridge.js',                                 dest: __filename, label: 'bridge', needsBridgeRestart: true },
];

// Read a single target's source bytes — local first, GitHub fallback.
async function _readUpdateSource(target) {
  if (LOCAL_SOURCE_DIR) {
    const localSrc = path.join(LOCAL_SOURCE_DIR, target.relPath);
    try { return fs.readFileSync(localSrc); }
    catch (e) { throw new Error('local source read failed: ' + e.message); }
  }
  if (typeof fetch !== 'function') throw new Error('Node fetch unavailable');
  const r = await fetch(GITHUB_RAW + '/' + target.relPath + '?t=' + Date.now(),
                        { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('GitHub returned ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Persistent auto-update flag — written by the panel's settings toggle so
// the preference survives bridge restarts. File present = auto-update OFF.
const NO_AUTO_UPDATE_FLAG = path.join(WORK_DIR, '.no-auto-update');
function isAutoUpdateDisabled() {
  if (process.env.CLAUDE_BRIDGE_NO_UPDATE === '1') return true;
  try { return fs.existsSync(NO_AUTO_UPDATE_FLAG); } catch { return false; }
}

async function checkForUpdates(opts) {
  const force = !!(opts && opts.force);
  const result = { ok: true, updated: [], bridgeChanged: false, premiereRestartNeeded: false, skipped: false, source: LOCAL_SOURCE_DIR ? 'local' : 'github' };
  // The .no-auto-update sentinel is the user's explicit "leave my files
  // alone" signal — it MUST win even when force=true (manual ↻). The user
  // was losing local dev edits whenever the panel called /update with
  // force, so we treat the sentinel as the absolute opt-out.
  if (isAutoUpdateDisabled()) {
    console.log('Auto-update skipped (disabled via env var or settings flag).\n');
    result.skipped = true;
    return result;
  }
  if (!LOCAL_SOURCE_DIR && typeof fetch !== 'function') {
    console.log('Auto-update skipped — no local source and Node fetch unavailable (upgrade to Node 18+).\n');
    result.skipped = true;
    result.error = 'no source';
    return result;
  }
  if (LOCAL_SOURCE_DIR) {
    console.log('Checking for updates from local repo: ' + LOCAL_SOURCE_DIR);
  } else {
    console.log('Checking for updates from GitHub raw (no local repo detected — set CLAUDE_BRIDGE_LOCAL_SOURCE to override)');
  }
  for (const target of UPDATE_TARGETS) {
    try {
      const remote = await _readUpdateSource(target);
      let local = null;
      try { local = fs.readFileSync(target.dest); } catch {}
      const bytesDiffer = !local || !local.equals(remote);
      // When force=true (manual ↻ click), ALWAYS rewrite — this is the
      // original defense against GitHub CDN stale-byte caching. With a
      // local-source setup it's a no-op (bytes match), but it still
      // doesn't hurt to be defensive against any partial-write disasters.
      // CRITICAL: only flag bridgeChanged/premiereRestartNeeded if the
      // bytes ACTUALLY differ. Otherwise a force-rewrite of byte-identical
      // files spuriously tells the panel "restart your bridge" — which
      // the user spammed 4-5 times on a manual update click because the
      // toast kept coming back. Restart-required must be real, not forced.
      if (force || bytesDiffer) {
        fs.mkdirSync(path.dirname(target.dest), { recursive: true });
        // Atomic write: temp file + rename. A rename within the same dir is
        // atomic, so a kill mid-write can never leave a truncated/corrupt
        // install file (critical now that startup force-kills other bridges).
        const tmp = target.dest + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, remote);
        fs.renameSync(tmp, target.dest);
        if (bytesDiffer) {
          result.updated.push(target.label);
          if (target.needsBridgeRestart) result.bridgeChanged = true;
          if (target.needsPremRestart) result.premiereRestartNeeded = true;
        }
      }
    } catch (e) {
      console.error('  update check failed for ' + target.label + ': ' + e.message);
    }
  }
  if (!result.updated.length) {
    console.log('Up to date.\n');
    return result;
  }
  console.log('Updated ' + result.updated.length + ' file' + (result.updated.length === 1 ? '' : 's') + ' from ' + result.source + ':');
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
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    let force = false;
    try {
      const payload = body ? JSON.parse(body) : {};
      force = !!payload.force;
    } catch {}
    try {
      // A button click in the panel passes force:true so it bypasses
      // CLAUDE_BRIDGE_NO_UPDATE (which exists only to stop automatic pulls).
      const result = await checkForUpdates({ force });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ ok: false, error: String(e) }));
    }
  });
}

// Self-respawn the bridge process so on-disk code edits take effect. Spawns a
// detached replacement (inherits stdio so terminal logs continue), then exits
// after the response/flush window. Reused by /restart and by the launch-time
// auto-update when bridge.js itself changed.
function _selfRespawn(opts) {
  try {
    const childEnv = Object.assign({}, process.env);
    if (opts && opts.forUpdate) {
      // One-shot guard: the replacement must NOT auto-restart again even if it
      // (somehow) still sees a bridge diff — prevents any restart loop.
      childEnv.CLAUDE_BRIDGE_JUST_RESTARTED_FOR_UPDATE = '1';
      delete childEnv.CLAUDE_BRIDGE_NO_UPDATE; // let it keep syncing other files
    } else {
      // Plain /restart = reload node, do NOT re-sync files from source.
      childEnv.CLAUDE_BRIDGE_NO_UPDATE = '1';
    }
    const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
      cwd: process.cwd(), env: childEnv, detached: true, stdio: 'inherit',
    });
    child.unref();
    setTimeout(() => { try { server.close(); } catch {} process.exit(0); }, 300);
    return true;
  } catch (e) {
    console.error('self-respawn failed:', e.message);
    return false;
  }
}

// Restart the bridge to load a freshly-written bridge.js. Behaviour depends on
// how the bridge is supervised:
//   • Under launchd (CLAUDE_BRIDGE_LAUNCHD=1): exit NON-ZERO. The LaunchAgent's
//     KeepAlive{Crashed:true} relaunches ONE fresh instance with the new code.
//     (exit 0 would NOT relaunch because SuccessfulExit:false.) This avoids the
//     spawn-a-child-then-exit race that fights launchd for the port.
//   • Otherwise (manual `node bridge.js` in a terminal): spawn a replacement.
// A 25s sentinel prevents a relaunch storm if the on-disk write keeps failing.
function _autoRestartForBridgeUpdate(result) {
  // Never restart mid-render — defer; the next periodic check will retry.
  if (_bridgeBusy()) {
    console.log('Bridge update ready, but a render is in flight — will restart when idle.');
    clog('bridge', 'info', 'bridge restart deferred (busy)', { updated: result && result.updated });
    return;
  }
  // Also defer if an Auto-Edit /analyze just cached a transcript that's likely
  // still awaiting its /run (the interview window). Restarting now would wipe
  // the in-memory _autoeditCache and strand the user at "session expired".
  try {
    const now = Date.now();
    for (const v of _autoeditCache.values()) {
      if (now - (v.createdAt || 0) < 3 * 60 * 1000) {
        console.log('Bridge update ready, but an Auto-Edit interview is pending — deferring restart.');
        clog('bridge', 'info', 'bridge restart deferred (autoedit interview pending)', null);
        return;
      }
    }
  } catch {}
  try {
    const sent = path.join(WORK_DIR, '.last-update-restart');
    let recent = false;
    try { recent = (Date.now() - fs.statSync(sent).mtimeMs) < 25000; } catch {}
    if (recent) {
      console.log('Bridge update detected, but a restart already happened <25s ago — skipping to avoid a loop.');
      clog('bridge', 'warn', 'auto-restart suppressed (recent restart)', { updated: result && result.updated });
      return;
    }
    try { fs.writeFileSync(sent, new Date().toISOString() + '\n'); } catch {}
  } catch {}
  clog('bridge', 'info', 'restarting to apply bridge update', { updated: result && result.updated, launchd: process.env.CLAUDE_BRIDGE_LAUNCHD === '1' });
  if (process.env.CLAUDE_BRIDGE_LAUNCHD === '1') {
    console.log('\nBridge code was updated — exiting so launchd relaunches the new version…\n');
    setTimeout(() => { try { server.close(); } catch {} process.exit(1); }, 200);
  } else {
    console.log('\nBridge code was updated — respawning to load it…\n');
    _selfRespawn({ forUpdate: true });
  }
}

// Retry listen() up to ~10x if the port is still held by the previous
// instance — used during /restart self-replacement so the new bridge can
// bind cleanly even if the old one hasn't fully released the socket yet.
// THERE CAN BE ONLY ONE. Orphaned bridges (PPID 1) that launchd lost track of
// were squatting the port and serving stale code, blocking every update — and
// `kickstart` only kills the job's tracked pid, not the orphan. So on startup
// (and on any EADDRINUSE) we forcibly SIGKILL every OTHER bridge.js process,
// then bind. The newest instance always wins; zombies/orphans/double-spawns can
// never persist. Matches the install path so it never touches a dev `node
// bridge/bridge.js` running from the repo.
function _killOtherBridges() {
  let killed = 0;
  try {
    const out = require('child_process').execSync(
      "pgrep -f 'PremiereClaude/bridge.js' 2>/dev/null || true",
      { encoding: 'utf8' },
    );
    const pids = out.split('\n').map(s => s.trim()).filter(Boolean).map(Number)
      .filter(p => p && p !== process.pid);
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); killed++; } catch {}
    }
  } catch {}
  if (killed) {
    console.log('Evicted ' + killed + ' other bridge process' + (killed === 1 ? '' : 'es') + ' (single-instance enforce).');
    clog('bridge', 'warn', 'evicted other bridge instances on startup', { killed });
  }
  return killed;
}

let _listenAttempts = 0;
function _tryListen() {
  server.listen(PORT, '127.0.0.1', () => {
    _listenAttempts = 0;
    console.log('Claude Bridge v2 running at http://localhost:' + PORT);
    console.log('Session ID: ' + SESSION_ID);
    console.log('Work dir:   ' + WORK_DIR);
    console.log('Output dir: ' + OUTPUT_DIR);
    console.log('Open Premiere Pro → Window → Extensions → Claude');
    console.log('(keep this terminal open)\n');
    clog('bridge', 'info', 'bridge started', { port: PORT, workDir: WORK_DIR, node: process.version });
    const _applyUpdateResult = (result, label) => {
      if (!result) return;
      if (result.updated && result.updated.length) {
        clog('bridge', 'info', label + ': applied update', { updated: result.updated });
        console.log(label + ': updated ' + result.updated.join(', '));
      }
      // Panel/host/manifest changes are picked up automatically — the panel's
      // /version mtime poll reloads it (when safe). Only a bridge.js change
      // needs a process restart.
      if (result.bridgeChanged) _autoRestartForBridgeUpdate(result);
    };
    checkForUpdates()
      .then((r) => _applyUpdateResult(r, 'launch update'))
      .catch(e => { clog('bridge', 'error', 'update check threw', { error: e.message }); console.error('Update check error:', e.message); });

    // PERIODIC auto-update — re-check every 3 min so a long-running bridge
    // actually picks up new code without a manual restart. This is the piece
    // that was missing: checkForUpdates() previously ran ONLY at launch, so an
    // already-running bridge never saw pushed changes. No-op when nothing
    // changed (checkForUpdates only writes on byte diff) and skipped while a
    // render is in flight (bridge restart is deferred to the next tick).
    if (!_updatePoll) {
      _updatePoll = setInterval(() => {
        if (isAutoUpdateDisabled()) return;
        checkForUpdates()
          .then((r) => _applyUpdateResult(r, 'periodic update'))
          .catch(e => clog('bridge', 'error', 'periodic update threw', { error: e.message }));
      }, 3 * 60 * 1000);
      if (_updatePoll.unref) _updatePoll.unref();
    }
  });
}
let _updatePoll = null;
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && _listenAttempts < 10) {
    _listenAttempts++;
    // A squatter holds the port — evict it (it's an orphan we lost track of),
    // then retry. This is what makes the newest bridge always win.
    _killOtherBridges();
    console.log('Port ' + PORT + ' busy (try ' + _listenAttempts + '/10) — evicted squatters, retrying in 400ms…');
    setTimeout(_tryListen, 400);
  } else {
    console.error('Bridge listen failed:', err);
    process.exit(1);
  }
});
// Kill any pre-existing bridge before the first bind so we start from a clean
// single-instance state.
_killOtherBridges();
setTimeout(_tryListen, 250);

