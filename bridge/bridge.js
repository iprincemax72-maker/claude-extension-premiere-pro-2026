#!/usr/bin/env node
const http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3737;
const PANEL_VERSION = '11.3';   // bump each release — drives the /check-update badge + /diagnostics
// Model used when the per-mode generation model hard-fails (e.g. a separately
// metered model reports "out of usage credits"). Haiku is the plan's base fast
// model, so it stays available — a render degrades instead of dead-ending.
const GEN_FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
// Model for Auto-Edit's thinking steps: the interview questions, the moment
// plan, and the plan fit-check. No Haiku in the Auto-Edit pipeline.
const AE_MODEL = 'claude-opus-5';
const SESSION_ID = crypto.randomUUID();
// WORK_DIR pins to wherever bridge.js itself lives, so the bridge always
// finds the remotion-intro project sitting next to it — even if the user
// has moved/renamed the parent folder. Override with the env var if you
// need to point it somewhere else.
const WORK_DIR = process.env.CLAUDE_BRIDGE_WORK_DIR || __dirname;
const OUTPUT_DIR = path.join(WORK_DIR, 'output');
// Folder name for project-colocated renders (created next to the open
// .prproj by /chat). The /delete-file allowlist matches on this SAME name —
// always use the constant in both places: renaming one without the other
// silently 403s every project-render delete.
const PROJECT_RENDER_DIRNAME = 'Claude Animations';
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

// Every endpoint parses its body and then reads properties off the result.
// JSON.parse('null') succeeds and returns null, so that read throws — inside a
// req 'end' callback, where the throw reaches uncaughtException instead of the
// endpoint's own catch. The bridge stays up (see above) but the response is
// never written, so the request hangs until the client gives up: in the panel
// that is a spinner that never stops and never errors. Valid JSON that is not
// an object becomes an empty payload; malformed JSON still throws, so each
// endpoint's existing catch keeps returning its own 400 shape.
// ── DURABLE RENDER INDEX ──────────────────────────────────────────────────
// History lived only in the panel's localStorage. Close Premiere (which closes
// the panel), lose that storage, or produce a render outside the panel, and
// there was no record of it anywhere — the file sat on disk with nothing
// pointing at it. The bridge is the one process that sees every render, so it
// writes an append-only index the panel merges in on boot.
const RENDER_INDEX = path.join(WORK_DIR, 'renders.jsonl');
function recordRenders(paths, prompt, reqId) {
  if (!paths || !paths.length) return;
  try {
    const lines = paths.filter(Boolean).map(f => JSON.stringify({
      t: Date.now(),
      file: String(f),
      prompt: String(prompt || '').slice(0, 2000),
      reqId: reqId || '',
    })).join('\n') + '\n';
    fs.appendFileSync(RENDER_INDEX, lines);
  } catch (e) {
    try { clog('bridge', 'warn', 'render index write failed', { err: String(e && e.message || e) }); } catch {}
  }
}
function readRenderIndex(limit) {
  try {
    const raw = fs.readFileSync(RENDER_INDEX, 'utf8').trim();
    if (!raw) return [];
    const out = [];
    for (const line of raw.split('\n')) {
      try { const o = JSON.parse(line); if (o && o.file) out.push(o); } catch {}
    }
    return out.slice(-(limit || 300)).reverse();
  } catch { return []; }
}

function parseObjBody(body) {
  const v = JSON.parse(body);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

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

// ── System font enumeration ───────────────────────────────────────────────
// Lists every installed font FAMILY so the captions panel can offer them all.
// We read the OS font directories and parse each font's 'name' table for its
// real family name (the only reliable way to get a name CSS/Chromium can render,
// cross-platform, with no external tools). Result is cached for the process.
function _fontDirs() {
  if (process.platform === 'win32') {
    const dirs = ['C:\\Windows\\Fonts'];
    if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    return dirs;
  }
  if (process.platform === 'darwin') {
    return ['/System/Library/Fonts', '/System/Library/Fonts/Supplemental', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local', 'share', 'fonts')];
}
function _walkFontFiles(dir, out, depth) {
  if (depth > 4 || out.length > 6000) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory()) { _walkFontFiles(full, out, depth + 1); }
      else if (/\.(ttf|otf|ttc|otc)$/i.test(e.name)) out.push(full);
    } catch {}
  }
}
// Decode one sfnt header at `base` and pull family names from its 'name' table.
function _readSfntNames(buf, base, fams) {
  if (base + 12 > buf.length) return;
  const numTables = buf.readUInt16BE(base + 4);
  let nameOff = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = base + 12 + i * 16;
    if (rec + 16 > buf.length) return;
    if (buf.toString('latin1', rec, rec + 4) === 'name') { nameOff = buf.readUInt32BE(rec + 8); break; }
  }
  if (!nameOff || nameOff + 6 > buf.length) return;
  const count = buf.readUInt16BE(nameOff + 2);
  const strBase = nameOff + buf.readUInt16BE(nameOff + 4);
  let family = '', typo = '';
  for (let i = 0; i < count; i++) {
    const r = nameOff + 6 + i * 12;
    if (r + 12 > buf.length) break;
    const platformID = buf.readUInt16BE(r), nameID = buf.readUInt16BE(r + 6);
    if (nameID !== 1 && nameID !== 16) continue;
    const len = buf.readUInt16BE(r + 8), off = strBase + buf.readUInt16BE(r + 10);
    if (off + len > buf.length || len <= 0) continue;
    let s;
    if (platformID === 3 || platformID === 0) s = buf.toString('utf16le', off, off + len).replace(/.?(.)/g, '$1'); // UTF-16BE → swap
    else s = buf.toString('latin1', off, off + len);
    // proper UTF-16BE decode (the regex above is unreliable) — do it cleanly:
    if (platformID === 3 || platformID === 0) { s = ''; for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(buf.readUInt16BE(off + j)); }
    s = s.replace(/\u0000/g, '').trim();   // drop stray nulls, KEEP spaces (family names)
    if (!s) continue;
    if (nameID === 16) typo = typo || s;
    else if (nameID === 1) family = family || s;
  }
  const fam = typo || family;
  if (fam && fam[0] !== '.') fams.add(fam);  // skip hidden system faces like ".SF NS"
}
function _familiesFromFile(file, fams) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return; }
  if (buf.length < 12) return;
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'ttcf') {
    const n = buf.readUInt32BE(8);
    for (let i = 0; i < n && i < 200; i++) { const o = 12 + i * 4; if (o + 4 <= buf.length) _readSfntNames(buf, buf.readUInt32BE(o), fams); }
  } else {
    _readSfntNames(buf, 0, fams);
  }
}
let _fontCache = null;
function getSystemFonts() {
  if (_fontCache) return _fontCache;
  const files = [];
  for (const d of _fontDirs()) _walkFontFiles(d, files, 0);
  const fams = new Set();
  for (const f of files) { try { _familiesFromFile(f, fams); } catch {} }
  _fontCache = Array.from(fams).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  clog('captions', 'info', 'enumerated system fonts', { files: files.length, families: _fontCache.length });
  return _fontCache;
}

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
      const entry = path.join(root, rel);
      if (!fs.existsSync(entry)) continue;
      const ext = path.extname(entry).toLowerCase();
      // Newer claude-code ships a NATIVE binary (bin/claude.exe). It must be
      // spawned directly — `node claude.exe` throws ERR_UNKNOWN_FILE_EXTENSION.
      // Only a real JS entry (.js/.mjs/.cjs, or an extensionless shebang script)
      // is run through node; .cmd/.bat go via shell.
      if (ext === '.exe') { _claudeTarget = { cmd: entry, prefixArgs: [] }; return _claudeTarget; }
      if (ext === '.cmd' || ext === '.bat') { _claudeTarget = { cmd: entry, prefixArgs: [], shell: true }; return _claudeTarget; }
      _claudeTarget = { cmd: process.execPath, prefixArgs: [entry] }; return _claudeTarget;
    } catch {}
  }
  // 3) last resort — claude.cmd via a shell (large args may suffer, but better
  //    than a hard ENOENT that breaks every request)
  _claudeTarget = { cmd: 'claude', prefixArgs: [], shell: true };
  return _claudeTarget;
}
// Drop-in replacement for the old spawn('claude', args, opts) — uses the
// resolved launcher and hides the console window on Windows.
let _claudeLogged = false;
function spawnClaude(args, opts) {
  const t = resolveClaude();
  // Log the resolved launcher once — this is the single most useful line for
  // diagnosing spawn failures (e.g. node-vs-exe). Visible in the unified log
  // and /diagnostics.
  if (!_claudeLogged) {
    _claudeLogged = true;
    try { clog('bridge', 'info', 'claude launcher resolved', { platform: process.platform, cmd: t.cmd, prefixArgs: t.prefixArgs, shell: !!t.shell }); } catch {}
  }
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

// Some cameras (Sony etc.) embed a start TIMECODE (e.g. 12:02:20:17 = time of
// day ≈ 43340s). Premiere then reports a clip's in/out RELATIVE TO that timecode,
// so the seconds land tens-of-thousands of seconds past the file → ffmpeg -ss
// seeks past EOF → a silent/empty wav → "couldn't hear speech" on a clip that's
// full of it. If the in-point exceeds the media duration, subtract the source's
// start timecode so the seek lands in the actual media.
function _tcToSeconds(tc, fps) {
  const m = String(tc || '').match(/(\d+):(\d+):(\d+)[:;](\d+)/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (fps > 0 ? (+m[4]) / fps : 0);
}
function fixSourceTimecodeOffset(clipPath, inSec, outSec) {
  inSec = Number(inSec) || 0; outSec = Number(outSec) || 0;
  return new Promise((resolve) => {
    let done = false;
    const finish = (a, b) => { if (!done) { done = true; resolve([a, b]); } };
    let proc;
    try {
      proc = spawn(FFMPEG_BIN.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1'),
        ['-v', 'error', '-of', 'json', '-show_entries',
         'format=duration:format_tags=timecode:stream=r_frame_rate:stream_tags=timecode', clipPath]);
    } catch { return finish(inSec, outSec); }
    let out = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.on('error', () => finish(inSec, outSec));
    const k = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} finish(inSec, outSec); }, 8000);
    proc.on('close', () => {
      clearTimeout(k);
      try {
        const j = JSON.parse(out || '{}');
        const dur = Number(j.format && j.format.duration) || 0;
        if (!dur || inSec < dur) return finish(inSec, outSec);   // already in range → leave it
        let tc = j.format && j.format.tags && j.format.tags.timecode, fps = 0;
        for (const s of (j.streams || [])) {
          if (!tc && s.tags && s.tags.timecode) tc = s.tags.timecode;
          if (!fps && s.r_frame_rate) { const p = String(s.r_frame_rate).split('/'); if (+p[0] && +p[1]) fps = (+p[0]) / (+p[1]); }
        }
        if (!tc) return finish(inSec, outSec);
        const tcSec = _tcToSeconds(tc, fps || 30);
        const ni = inSec - tcSec, no = outSec - tcSec;
        if (ni >= -0.5 && ni < dur + 1) return finish(Math.max(0, ni), Math.min(dur, Math.max(ni + 0.05, no)));
        finish(inSec, outSec);
      } catch { finish(inSec, outSec); }
    });
  });
}

// Extract clip audio to a 16kHz mono WAV (what parakeet-mlx ingests), trimmed
// to [inP, outP] of the source. Returns path to the temp wav.
async function extractAudioForTranscription(clipPath, inP, outP) {
  const [fixIn, fixOut] = await fixSourceTimecodeOffset(clipPath, inP, outP);
  return new Promise((resolve, reject) => {
    const outPath = path.join(OUTPUT_DIR, '_autocut_audio_' + Date.now() + '.wav');
    const args = [
      '-y', '-ss', String(fixIn), '-to', String(fixOut),
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

// ── CAPTIONS: word-level transcription + line grouping ───────────────────────
// The autocut/autoedit paths only need sentence-level segments, but captions
// need WORD-level timing. parakeet emits sentencepiece sub-word tokens with
// per-token start/end; we reconstruct real words from them. Verified shape:
//   sentences[].tokens[] = [{text:" F",start,end},{text:"li",...},...]
// where a leading-space token marks a new word boundary.

// Reconstruct word-level [{text,startMs,endMs}] from parakeet subword tokens.
function tokensToWords(sentences) {
  const words = [];
  let cur = null;
  for (const s of (sentences || [])) {
    for (const t of (s.tokens || [])) {
      const raw = t && t.text != null ? String(t.text) : '';
      if (!raw) continue;
      const startsWord = /^\s/.test(raw) || cur === null;
      const piece = raw.replace(/^\s+/, '');
      const startMs = Math.round((Number(t.start) || 0) * 1000);
      const endMs = Math.round((Number(t.end) || 0) * 1000);
      if (startsWord) {
        if (cur && cur.text) words.push(cur);
        cur = { text: piece, startMs, endMs };
      } else if (cur) {
        cur.text += piece;
        cur.endMs = endMs;
      }
    }
  }
  if (cur && cur.text) words.push(cur);
  const out = [];
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    let startMs = Math.max(0, Math.round(w.startMs));
    let endMs = Math.max(startMs + 1, Math.round(w.endMs));
    const prev = out[out.length - 1];
    if (prev && startMs < prev.endMs) startMs = prev.endMs; // no overlap
    if (endMs <= startMs) endMs = startMs + 1;
    out.push({ text, startMs, endMs });
  }
  return out;
}

// Group a flat word list into caption lines (a line breaks on word count, a
// silent gap, total on-screen time, or character width — whichever hits first).
function groupWordsIntoLines(words, opts) {
  opts = opts || {};
  const maxWordsPerLine = Math.max(1, opts.maxWordsPerLine || 4);
  const maxGapMs = opts.maxGapMs != null ? opts.maxGapMs : 600;
  const maxLineMs = opts.maxLineMs != null ? opts.maxLineMs : 2600;
  const maxCharsPerLine = opts.maxCharsPerLine != null ? opts.maxCharsPerLine : 36;
  const holdMs = opts.holdMs != null ? opts.holdMs : 250;

  const clean = (words || [])
    .filter(w => w && String(w.text || '').trim() && Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
    // endMs must be derived from the CLAMPED start. Deriving it from the raw
    // w.startMs meant a word with a negative timestamp (start -50, end -60)
    // produced startMs 0 with endMs -49: a line with negative duration, which
    // becomes a broken clip downstream. Found by fuzzing, not by a real render.
    .map(w => {
      const s = Math.max(0, w.startMs);
      return { text: String(w.text).trim(), startMs: s, endMs: Math.max(s + 1, w.endMs) };
    })
    .sort((a, b) => a.startMs - b.startMs);

  const lines = [];
  let cur = [];
  let curChars = 0;
  const flush = () => {
    if (!cur.length) return;
    lines.push({ words: cur.slice(), startMs: cur[0].startMs, endMs: cur[cur.length - 1].endMs + holdMs });
    cur = [];
    curChars = 0;
  };
  for (const w of clean) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const gap = w.startMs - prev.endMs;
      const lineDur = w.endMs - cur[0].startMs;
      const wouldChars = curChars + 1 + w.text.length;
      if (cur.length >= maxWordsPerLine || gap > maxGapMs || lineDur > maxLineMs || wouldChars > maxCharsPerLine) flush();
    }
    cur.push(w);
    curChars += (curChars ? 1 : 0) + w.text.length;
  }
  flush();

  // A line's end carries holdMs so the caption lingers a beat after the last
  // word. That is a nicety for a real pause — but in continuous speech the NEXT
  // line starts well within that hold, so the lines overlap. Each line is later
  // cut into its own timeline clip (splitCaptionClips), and overlapping clips
  // land on stacked tracks in Premiere: two translucent overlays composite over
  // each other, which darkens the picture and briefly shows two captions at
  // once. That is the caption "flickering / going dark".
  // So the hold yields whenever the next line needs the time.
  for (let i = 0; i < lines.length - 1; i++) {
    const next = lines[i + 1];
    if (lines[i].endMs > next.startMs) {
      // Yield ALL the way to the next line. This used to floor at
      // startMs + 120ms to keep a line readable, but that floor re-created the
      // exact overlap it sits here to prevent whenever the next line starts
      // sooner than 120ms later — which is common on fast speech. A line that
      // is briefly short is fine; two clips stacked on the same frame is the
      // dark flash. Only the 1ms is kept, so duration stays positive.
      lines[i].endMs = Math.max(lines[i].startMs + 1, next.startMs);
    }
  }
  return lines;
}

// Mark the most important word per line as a keyword (submagic-style highlight).
// No NLP: pick the longest content word (>=4 chars, not a stopword) on each line.
const CAP_STOPWORDS = new Set(('the a an and or but to of in on at for with is are was were be been being it its ' +
  'this that these those i you he she we they me my your our their as so if then than just about into over from ' +
  'up down out off not no yes do does did have has had will would can could should what when where who how why ' +
  'there here them him her us your yours theirs all any some more most very really gonna wanna kinda like').split(' '));
function markKeywords(lines) {
  for (const l of (lines || [])) {
    let best = null, bestLen = 0;
    for (const w of (l.words || [])) {
      const t = String(w.text || '').replace(/[^a-zA-Z']/g, '').toLowerCase();
      if (t.length >= 4 && !CAP_STOPWORDS.has(t) && t.length > bestLen) { best = w; bestLen = t.length; }
    }
    if (best) best.kw = true;
  }
  return lines;
}

// Curated keyword -> emoji map for the optional auto-emoji feature. Color emoji
// render fine in the ProRes output (verified). One emoji per line keeps it clean.
const CAP_EMOJI = {
  money: '💰', cash: '💰', dollar: '💵', rich: '🤑', profit: '💰', fire: '🔥', lit: '🔥', hot: '🔥',
  love: '❤️', heart: '❤️', time: '⏰', clock: '⏰', idea: '💡', light: '💡', think: '💭', brain: '🧠',
  smart: '🧠', mind: '🤯', crazy: '🤯', insane: '🤯', work: '💪', strong: '💪', power: '💪', win: '🏆',
  winner: '🏆', best: '🏆', champion: '🏆', growth: '📈', grow: '📈', growing: '📈', rocket: '🚀',
  launch: '🚀', fast: '⚡', speed: '⚡', quick: '⚡', energy: '⚡', star: '⭐', amazing: '🤩', incredible: '🤩',
  awesome: '🤩', cool: '😎', huge: '💯', massive: '💯', percent: '💯', music: '🎵', video: '🎬', movie: '🎬',
  camera: '📸', photo: '📸', phone: '📱', world: '🌍', global: '🌍', earth: '🌍', people: '👥', team: '🤝',
  deal: '🤝', secret: '🤫', important: '❗', key: '🔑', gold: '🥇', first: '🥇', free: '🆓', check: '✅',
  food: '🍔', coffee: '☕', sleep: '😴', happy: '😊', boom: '💥', explode: '💥', target: '🎯', goal: '🎯',
  focus: '🎯', book: '📚', learn: '📚', study: '📚', school: '🎓', diamond: '💎', crown: '👑', king: '👑',
  queen: '👑', sun: '☀️', water: '💧', ocean: '🌊', tree: '🌳', game: '🎮', play: '🎮', art: '🎨',
  paint: '🎨', build: '🔨', create: '✨', magic: '✨', special: '✨', heavy: '🏋️', lift: '🏋️', run: '🏃',
};
function applyEmojis(lines) {
  for (const l of (lines || [])) {
    for (const w of (l.words || [])) {
      const t = String(w.text || '').replace(/[^a-zA-Z]/g, '').toLowerCase();
      const e = CAP_EMOJI[t];
      if (e) { w.text = w.text + ' ' + e; break; }   // one emoji per line, keep it clean
    }
  }
  return lines;
}

// Like runParakeet, but keeps the sub-word tokens and returns reconstructed
// words alongside the sentence segments. Cleans up its temp files.
function runParakeetWords(wavPath, audioDuration, onProc) {
  return new Promise((resolve, reject) => {
    const bin = resolveParakeet();
    const outDir = path.dirname(wavPath);
    const baseName = path.basename(wavPath, path.extname(wavPath));
    const jsonOut = path.join(outDir, baseName + '.json');
    try { fs.unlinkSync(jsonOut); } catch {}
    // Clean up BOTH temp files on every exit path (the success path used to be
    // the only one that unlinked the wav, leaking it on timeout/exit/parse-fail).
    const cleanup = () => { try { fs.unlinkSync(jsonOut); } catch {} try { fs.unlinkSync(wavPath); } catch {} };
    const args = ['--output-format', 'json', '--output-dir', outDir, wavPath];
    const proc = spawn(bin, args, { env: process.env });
    if (typeof onProc === 'function') onProc(proc);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString().slice(-2000));
    proc.stdout.on('data', () => {});
    const cap = Math.min(15 * 60 * 1000, Math.max(120000, audioDuration * 800 + 60000));
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} cleanup(); reject(new Error('parakeet timeout after ' + Math.round(cap / 1000) + 's')); }, cap);
    proc.on('error', e => { clearTimeout(killer); cleanup(); reject(e); });
    proc.on('close', code => {
      clearTimeout(killer);
      if (code !== 0 || !fs.existsSync(jsonOut)) { cleanup(); reject(new Error('parakeet exit ' + code + ': ' + stderr.slice(-300))); return; }
      try {
        const j = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
        const sentences = (j.sentences || []).map(s => ({
          start: typeof s.start === 'number' ? s.start : 0,
          end: typeof s.end === 'number' ? s.end : 0,
          text: (s.text || '').trim(),
          tokens: s.tokens || [],
        }));
        const words = tokensToWords(sentences);
        cleanup();
        resolve({ words, sentences: sentences.map(s => ({ start: s.start, end: s.end, text: s.text })) });
      } catch (e) {
        cleanup();
        reject(new Error('parakeet json parse: ' + e.message));
      }
    });
  });
}

// ── Whisper.cpp word-level fallback (Windows, or any box without parakeet) ───
// whisper-cli -ojf emits per-token timestamps (offsets in ms) with leading-space
// word boundaries — the SAME sub-word shape as parakeet, so we reuse tokensToWords.
function resolveWhisper() {
  const isWin = process.platform === 'win32';
  const names = isWin ? ['whisper-cli.exe', 'main.exe', 'whisper.exe'] : ['whisper-cli'];
  const dirs = [
    process.env.CLAUDE_BRIDGE_WHISPER_DIR,
    path.join(WORK_DIR, 'whisper'),
    '/opt/homebrew/bin', '/usr/local/bin',
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.local', 'bin'),
  ].filter(Boolean);
  for (const d of dirs) for (const n of names) {
    try { const p = path.join(d, n); if (fs.existsSync(p)) return p; } catch {}
  }
  return isWin ? 'whisper-cli.exe' : 'whisper-cli';   // last resort: PATH
}
function resolveWhisperModel() {
  if (process.env.CLAUDE_BRIDGE_WHISPER_MODEL && fs.existsSync(process.env.CLAUDE_BRIDGE_WHISPER_MODEL)) {
    return process.env.CLAUDE_BRIDGE_WHISPER_MODEL;
  }
  const dirs = [
    path.join(WORK_DIR, 'whisper'), path.join(WORK_DIR, 'models'),
    path.join(process.env.HOME || '', '.cache', 'whisper'),
    '/usr/local/share/whisper-cpp', '/opt/homebrew/share/whisper-cpp',
  ];
  try {
    const cellar = '/opt/homebrew/Cellar/whisper-cpp';
    if (fs.existsSync(cellar)) for (const v of fs.readdirSync(cellar)) dirs.push(path.join(cellar, v, 'share', 'whisper-cpp'));
  } catch {}
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d).filter(f => /^ggml-.*\.bin$/.test(f));
      const pick = files.find(f => /base\.en/.test(f)) || files.find(f => /base/.test(f)) || files[0];
      if (pick) return path.join(d, pick);
    } catch {}
  }
  return null;
}
function runWhisperWords(wavPath, audioDuration, onProc) {
  return new Promise((resolve, reject) => {
    const model = resolveWhisperModel();
    const cleanupAll = (extra) => { try { fs.unlinkSync(wavPath); } catch {} if (extra) { try { fs.unlinkSync(extra); } catch {} } };
    if (!model) { cleanupAll(); reject(new Error('whisper model not found (set CLAUDE_BRIDGE_WHISPER_MODEL to a ggml-*.bin)')); return; }
    const bin = resolveWhisper();
    const outBase = path.join(path.dirname(wavPath), path.basename(wavPath, path.extname(wavPath)) + '_w');
    const jsonOut = outBase + '.json';
    try { fs.unlinkSync(jsonOut); } catch {}
    const args = ['-m', model, '-ojf', '-of', outBase, '-ml', '0', wavPath];
    const proc = spawn(bin, args, { env: process.env });
    if (typeof onProc === 'function') onProc(proc);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString().slice(-2000));
    proc.stdout.on('data', () => {});
    const cap = Math.min(15 * 60 * 1000, Math.max(120000, audioDuration * 1500 + 60000));
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} cleanupAll(jsonOut); reject(new Error('whisper timeout after ' + Math.round(cap / 1000) + 's')); }, cap);
    proc.on('error', e => { clearTimeout(killer); cleanupAll(jsonOut); reject(e); });
    proc.on('close', code => {
      clearTimeout(killer);
      if (!fs.existsSync(jsonOut)) { cleanupAll(); reject(new Error('whisper exit ' + code + ': ' + stderr.slice(-300))); return; }
      try {
        const j = JSON.parse(fs.readFileSync(jsonOut, 'utf8'));
        // normalize whisper tokens -> parakeet-style sentences (ms->sec, drop special tokens)
        const sentences = (j.transcription || []).map(seg => ({
          tokens: (seg.tokens || [])
            .filter(t => t && t.text && !/^\[_/.test(t.text))
            .map(t => ({ text: t.text, start: ((t.offsets && t.offsets.from) || 0) / 1000, end: ((t.offsets && t.offsets.to) || 0) / 1000 })),
        }));
        const words = tokensToWords(sentences).map(w => ({ ...w, text: w.text.replace(/^["'`]+|["'`]+$/g, '') })).filter(w => w.text);
        cleanupAll(jsonOut);
        resolve({ words, sentences: [] });
      } catch (e) {
        cleanupAll(jsonOut);
        reject(new Error('whisper json parse: ' + e.message));
      }
    });
  });
}

// Word-level transcription dispatcher: parakeet-mlx if present (best, macOS),
// else whisper.cpp (Windows / fallback). Both return { words:[{text,startMs,endMs}] }.
async function transcribeWords(wavPath, audioDuration, onProc) {
  const pk = resolveParakeet();
  const pkInstalled = pk && (pk.includes('/') ? fs.existsSync(pk) : false);
  if (pkInstalled) return runParakeetWords(wavPath, audioDuration, onProc);
  if (resolveWhisperModel()) return runWhisperWords(wavPath, audioDuration, onProc);
  try { fs.unlinkSync(wavPath); } catch {}
  throw new Error('No word-level transcriber found. Install parakeet-mlx (macOS: `uv tool install parakeet-mlx`) or whisper-cli + a ggml model (Windows).');
}

// Make sure the render project has the canonical Captions.tsx. The installed
// remotion-intro is NOT touched by auto-update (which only syncs 4 top-level
// files), so we copy the component from the same source the updater uses:
// the local repo when present, else GitHub raw. Idempotent (writes only on diff).
let _captionsRawCache = null;   // GitHub-raw fetch cached for the bridge lifetime
let _captionsWriteLock = Promise.resolve();   // serialize writes (avoid same-pid temp races)
let _capTmpSeq = 0;
async function ensureCaptionsComponent(projDir) {
  const dest = path.join(projDir, 'src', 'Captions.tsx');
  let srcText = null;
  // Local repo (dev): read fresh each time — cheap, and picks up edits.
  if (LOCAL_SOURCE_DIR) {
    try { srcText = fs.readFileSync(path.join(LOCAL_SOURCE_DIR, 'bridge', 'remotion-template', 'src', 'Captions.tsx'), 'utf8'); } catch {}
  }
  // GitHub raw: fetch once, then cache (the component only changes on app update,
  // so re-fetching the whole file on every /captions call was wasted latency).
  if (srcText == null) {
    if (_captionsRawCache != null) srcText = _captionsRawCache;
    else if (typeof fetch === 'function') {
      try {
        const r = await fetch(GITHUB_RAW + '/bridge/remotion-template/src/Captions.tsx');
        if (r.ok) { srcText = await r.text(); _captionsRawCache = srcText; }
      } catch {}
    }
  }
  if (srcText == null) {
    if (fs.existsSync(dest)) return dest;   // previously installed copy — good enough
    throw new Error('captions component source unavailable (no local repo, no network, not previously installed)');
  }
  // Serialize the read-compare-write so two concurrent /captions calls can't
  // race on the temp file (which was keyed only on pid — identical in-process).
  _captionsWriteLock = _captionsWriteLock.then(() => {
    let cur = null;
    try { cur = fs.readFileSync(dest, 'utf8'); } catch {}
    if (cur !== srcText) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const tmp = dest + '.tmp' + process.pid + '.' + (_capTmpSeq++);
      fs.writeFileSync(tmp, srcText);
      fs.renameSync(tmp, dest);
    }
  }).catch(() => {});
  await _captionsWriteLock;
  return dest;
}

// Resolve the remotion CLI JS entry so we can spawn it with `node` directly
// (more reliable than relying on npx being on PATH under launchd).
function resolveRemotionCli(projDir) {
  const binLink = path.join(projDir, 'node_modules', '.bin', 'remotion');
  try {
    const target = fs.readlinkSync(binLink);
    const resolved = path.resolve(path.dirname(binLink), target);
    if (fs.existsSync(resolved)) return resolved;
  } catch {}
  const cands = [
    path.join(projDir, 'node_modules', '@remotion', 'cli', 'remotion-cli.js'),
    binLink,
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return binLink;
}

// Render the Captions composition to a transparent ProRes 4444 .mov overlay.
// Driven entirely by `lines` (word-level) + style + options. Writes a unique
// one-off entry file so concurrent caption/chat renders never collide on
// Root.tsx, and feeds props via a --props JSON file. Returns the output path.
async function renderCaptions(opts) {
  const { lines, style, options, reqId, log } = opts;
  const projDir = path.join(WORK_DIR, 'remotion-intro');
  if (!fs.existsSync(path.join(projDir, 'node_modules', 'remotion'))) {
    throw new Error('Remotion project not installed at ' + projDir);
  }
  await ensureCaptionsComponent(projDir);

  const W = Math.max(2, Math.round(opts.width || 1080));
  const H = Math.max(2, Math.round(opts.height || 1920));
  const FPS = Math.max(1, Math.round(opts.fps || 30));
  const id = String(reqId || Date.now()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '_' + Date.now();
  const entryRel = path.join('src', '_cap_' + id + '.tsx');
  const entryAbs = path.join(projDir, entryRel);
  const propsFile = path.join(OUTPUT_DIR, '_capprops_' + id + '.json');
  const outFile = path.join(OUTPUT_DIR, 'captions_' + id + '.mov');

  const entrySrc =
    "import { registerRoot, Composition } from 'remotion';\n" +
    "import { Captions } from './Captions';\n" +
    "const Root = () => (\n" +
    "  <Composition\n" +
    "    id=\"Captions\"\n" +
    "    component={Captions}\n" +
    "    defaultProps={{ lines: [], style: 'karaoke', options: {}, fps: " + FPS + ", width: " + W + ", height: " + H + " }}\n" +
    "    calculateMetadata={({ props }) => {\n" +
    "      const f = props.fps || " + FPS + ";\n" +
    "      const ends = (props.lines || []).map((l) => l.endMs);\n" +
    "      const maxMs = ends.length ? Math.max(...ends) : 1000;\n" +
    "      return { durationInFrames: Math.max(1, Math.ceil((maxMs / 1000 + 0.3) * f)), width: props.width || " + W + ", height: props.height || " + H + ", fps: f };\n" +
    "    }}\n" +
    "  />\n" +
    ");\n" +
    "registerRoot(Root);\n";

  fs.writeFileSync(entryAbs, entrySrc);
  fs.writeFileSync(propsFile, JSON.stringify({ lines, style, options: options || {}, fps: FPS, width: W, height: H }));

  const cli = resolveRemotionCli(projDir);
  const nodeBin = process.execPath;
  // Transparent overlay = ProRes 4444 WITH alpha. Both --image-format=png AND
  // --pixel-format=yuva444p10le are REQUIRED — without them Remotion emits an
  // opaque yuv422 stream (no alpha plane) that would cover the footage.
  // Speed: render frames across (almost) all cores instead of Remotion's conservative
  // default. Capped at 10 so a big machine doesn't OOM on 1080x1920 PNG frames.
  const cores = (os.cpus() || []).length || 4;
  const concurrency = Math.max(2, Math.min(10, cores - 1));
  const args = [cli, 'render', entryRel, 'Captions', outFile,
    '--codec', 'prores', '--prores-profile', '4444',
    '--image-format', 'png', '--pixel-format', 'yuva444p10le',
    '--mute',   // captions are silent — don't let Remotion add a silent stereo track
    '--concurrency=' + concurrency,
    // VideoToolbox ProRes encode on Macs (v4.0.236+); silent no-op on Windows.
    '--hardware-acceleration=if-possible',
    '--props=' + propsFile, '--log', 'error'];
  const env = { ...process.env };
  env.PATH = path.dirname(nodeBin) + path.delimiter + (env.PATH || '');

  // Clean the one-off entry + props on EVERY exit (close, error, timeout) — the
  // entry .tsx lives in the shared src/ and must not leak there.
  const cleanupTemp = () => { try { fs.unlinkSync(entryAbs); } catch {} try { fs.unlinkSync(propsFile); } catch {} };
  await new Promise((resolve, reject) => {
    const proc = spawn(nodeBin, args, { cwd: projDir, env });
    if (typeof opts.onProc === 'function') opts.onProc(proc);
    let stderr = '';
    proc.stdout.on('data', d => { const s = d.toString(); if (/Rendered|Encoding|Bundl/.test(s)) log && log('render ' + s.trim().split('\n').pop().slice(0, 80)); });
    proc.stderr.on('data', d => stderr += d.toString().slice(-4000));
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} cleanupTemp(); try { fs.unlinkSync(outFile); } catch {} reject(new Error('caption render timeout (8m)')); }, 8 * 60 * 1000);
    proc.on('error', e => { clearTimeout(killer); cleanupTemp(); reject(e); });
    proc.on('close', code => {
      clearTimeout(killer);
      cleanupTemp();
      if (code === 0 && fs.existsSync(outFile)) resolve();
      else { try { fs.unlinkSync(outFile); } catch {} reject(new Error('caption render exit ' + code + ': ' + stderr.slice(-400))); }
    });
  });
  // Belt + suspenders: strip any audio stream so caption clips import with NO
  // linked audio. splitCaptionClips cuts this source with `-c copy`, so a
  // clean source makes every split clip audio-free too. (-c:v copy preserves
  // the ProRes 4444 alpha.)
  await stripAudioInPlace(outFile);
  return outFile;
}

// Split the single rendered overlay into ONE clip per caption line, so each
// caption lands on the timeline as its own movable element (not one baked file
// with every caption in it). ProRes 4444 is all-intra, so ffmpeg -c copy cuts
// are frame-accurate and fast (no re-encode, alpha preserved). Returns
// [{ path, timelineSec, durationSec, text }] in timeline order.
// Where one caption line's clip starts and how many frames it runs, snapped to
// the frame grid. Pure + exported for tests: this is the math that decides
// whether consecutive caption clips tile cleanly or overlap (overlapping clips
// stack on the Premiere timeline and composite into a dark flash).
function captionClipWindow(line, fps) {
  const FPS = (fps && fps > 0) ? fps : 30;
  const startFrame = Math.max(0, Math.round((line.startMs / 1000) * FPS));
  const endFrame = Math.max(startFrame + 1, Math.round((line.endMs / 1000) * FPS));
  const nFrames = endFrame - startFrame;
  return { startFrame, endFrame, nFrames, startSec: startFrame / FPS, dur: nFrames / FPS };
}

async function splitCaptionClips(srcMov, lines, baseTimelineSec, reqId, log, fps) {
  // Each cut is an independent ffmpeg `-c copy` (no re-encode) — run them in parallel
  // instead of one-at-a-time. runWithConcurrency preserves input order, so the
  // returned clips stay in timeline order.
  //
  // FRAME-EXACT CUTS. Asking ffmpeg for a duration in seconds makes it round UP
  // to a whole frame, so a clip came out 7-20ms longer than asked and ran into
  // the next one. On the timeline that is a frame of two caption clips stacked,
  // compositing over each other — a dark flash. Snapping both edges to the frame
  // grid and cutting an exact frame COUNT makes consecutive clips tile perfectly.
  const FPS = (fps && fps > 0) ? fps : 30;
  const stamp = Date.now();
  const jobs = lines.map((l, i) => () => new Promise((res) => {
    const { startSec, dur, nFrames } = captionClipWindow(l, FPS);
    const dest = path.join(OUTPUT_DIR, 'caption_' + String(reqId).slice(0, 8) + '_' + i + '_' + stamp + '.mov');
    // -ss before -i = fast input seek; exact for all-intra ProRes. -c copy keeps alpha.
    const ff = spawn(FFMPEG_BIN, ['-y', '-ss', String(startSec), '-i', srcMov, '-frames:v', String(nFrames), '-c', 'copy', dest]);
    ff.stderr.on('data', () => {});
    const k = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} res(null); }, 60000);
    ff.on('error', () => { clearTimeout(k); res(null); });
    ff.on('close', c => {
      clearTimeout(k);
      if (c === 0 && fs.existsSync(dest)) res({ path: dest, timelineSec: baseTimelineSec + startSec, durationSec: dur, text: (l.words || []).map(w => w.text).join(' ') });   // startSec/dur are frame-snapped above
      else res(null);
    });
  }));
  const results = await runWithConcurrency(jobs, 6);
  const out = results.filter(Boolean);
  if (log) log('split into ' + out.length + ' caption clips (parallel)');
  return out;
}

// Write an SRT for the NATIVE editable-captions mode. Times are made absolute to
// the timeline (baseTimelineSec + line offset) so Premiere drops them at the clip.
function writeSrt(lines, baseTimelineSec, options, reqId) {
  const dest = path.join(OUTPUT_DIR, 'captions_' + String(reqId).slice(0, 8) + '_' + Date.now() + '.srt');
  const pad = (n, w) => String(Math.floor(n)).padStart(w, '0');
  const fmt = (ms) => {
    ms = Math.max(0, Math.round(ms));
    return pad(ms / 3600000, 2) + ':' + pad((ms % 3600000) / 60000, 2) + ':' + pad((ms % 60000) / 1000, 2) + ',' + pad(ms % 1000, 3);
  };
  const up = !!(options && options.uppercase);
  const base = (Number(baseTimelineSec) || 0) * 1000;
  let out = '', n = 0;
  for (const l of (lines || [])) {
    let text = (l.words || []).map(w => w.text).join(' ').trim();
    if (!text) continue;
    if (up) text = text.toUpperCase();
    n++;
    out += n + '\n' + fmt(base + l.startMs) + ' --> ' + fmt(base + l.endMs) + '\n' + text + '\n\n';
  }
  fs.writeFileSync(dest, out, 'utf8');
  return dest;
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
    // /autocut-cancel kills whatever is in _activeAutocut, but nothing ever put
    // anything there — so Cancel reported success while this subprocess carried
    // on running against the user's plan. Register it, and only clear the slot
    // if it is still ours (a later autocut may already own it).
    _activeAutocut = proc;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(killer);
      if (_activeAutocut === proc) _activeAutocut = null;
      resolve(result);
    };
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
    // source of multi-minute stalls). bypassPermissions keeps it unblocked.
    const proc = spawn(claudePath, [
      '-p', fullPrompt,
      '--output-format', 'text',
      '--model', AE_MODEL,
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

// Grab start / middle / end frames of the selected clip so the graphics generator can
// SEE where the speaker/face sits and place overlays in the empty area (no face cover).
// Small downscaled JPGs (fast for vision). Best-effort — returns [{label, path}].
async function extractFaceFrames(seg, reqId, log) {
  if (!seg || !seg.path || !fs.existsSync(seg.path)) return [];
  const inSec = Math.max(0, Number(seg.inSec) || 0);
  const outSec = Number(seg.outSec) || (inSec + 1);
  const dur = Math.max(0.6, outSec - inSec);
  const pad = Math.min(0.2, dur * 0.06);
  const spots = [{ label: 'start', t: inSec + pad }, { label: 'mid', t: inSec + dur / 2 }, { label: 'end', t: outSec - pad }];
  const out = [];
  for (const s of spots) {
    const dest = path.join(OUTPUT_DIR, 'ae_frame_' + String(reqId).slice(0, 8) + '_' + s.label + '.jpg');
    const ok = await new Promise((res) => {
      const ff = spawn(FFMPEG_BIN, ['-y', '-ss', String(Math.max(0, s.t)), '-i', seg.path, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '5', dest]);
      ff.stderr.on('data', () => {});
      const k = setTimeout(() => { try { ff.kill('SIGKILL'); } catch {} res(false); }, 30000);
      ff.on('error', () => { clearTimeout(k); res(false); });
      ff.on('close', c => { clearTimeout(k); res(c === 0 && fs.existsSync(dest)); });
    });
    if (ok) out.push({ label: s.label, path: dest });
  }
  if (log) log('face frames: ' + out.length + '/3 extracted');
  return out;
}

// One-shot Haiku text call (no tools, no session) — used for the interview
// questions and the plan fit-check. Returns raw stdout (best-effort; '' on
// failure so callers degrade gracefully). Registered as an _activeAutoedit
// child so ESC cancels it.
// `model` is optional and defaults to the fast model. Auto-Edit passes
// AE_MODEL for its judgment calls; other callers keep the fast default.
function runClaudeText(promptStr, timeoutMs, log, label, model) {
  return new Promise((resolve) => {
    const claudePath = process.env.CLAUDE_CLI || 'claude';
    const extendedPath = [process.env.PATH || '', '/Users/anshdhakad/.local/bin', '/opt/homebrew/bin', '/usr/local/bin'].filter(Boolean).join(':');
    const proc = spawn(claudePath, [
      '-p', promptStr,
      '--output-format', 'text',
      '--model', model || 'claude-haiku-4-5-20251001',
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
    const raw = await runClaudeText(system + '\n\nTRANSCRIPT:\n' + sample, 90000, log, 'interview', AE_MODEL);
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
    const raw = await runClaudeText(system + '\n\nUSER REQUEST:\n' + msg.slice(0, 4000), 60000, log, 'planq', AE_MODEL);
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
    const raw = await runClaudeText(sys + '\n\nPLAN:\n' + list, 90000, log, 'verify', AE_MODEL);
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
    const [segIn, segOut] = await fixSourceTimecodeOffset(s.path, s.inSec, s.outSec);
    log && log(`seg ${i} DIAG: raw in/out=${s.inSec}/${s.outSec} fixed=${segIn.toFixed(2)}/${segOut.toFixed(2)} path=${path.basename(String(s.path || ''))}`);
    const dur = Math.max(0, segOut - segIn);
    if (dur < 0.05) continue;
    const out = `${tmpBase}_part${i}.wav`;
    await new Promise((res, rej) => {
      const args = ['-y', '-ss', String(segIn), '-to', String(segOut), '-i', s.path, '-ac', '1', '-ar', '16000', out];
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
// ── USER-PICKED moments ───────────────────────────────────────────────────
// The user ticked sentences in the transcript picker; those ARE the plan. We
// only ask Claude what each one should LOOK like (type + short label) — it
// never adds, drops or re-times a pick. Every picked line comes back as a
// moment, even if the labelling call fails (falls back to a callout).
const AE_MOMENT_TYPES = ['stat', 'quote', 'name', 'list', 'callout', 'question', 'section', 'fact'];
async function labelPickedLines(sentences, picks, log) {
  const byIdx = new Map(sentences.map(s => [s.i, s]));
  const chosen = picks.map(i => byIdx.get(i)).filter(Boolean);
  if (!chosen.length) return [];
  const fallback = (s) => ({
    startSec: s.startSec, endSec: s.endSec, type: 'callout',
    label: s.text.split(/\s+/).slice(0, 6).join(' ').slice(0, 60),
  });
  let labelled = {};
  try {
    const list = chosen.map(s => `${s.i}: ${s.text}`).join('\n');
    const sys = [
      'For each numbered line, choose how an on-screen motion graphic should present it.',
      'TYPES: ' + AE_MOMENT_TYPES.join(', ') + '.',
      'The label is the SHORT on-screen text (max 8 words) — not a description.',
      'Return ONLY a JSON array, one entry per line given, no prose:',
      '[{"i":3,"type":"list","label":"Tools · Van · Materials"}]',
    ].join('\n');
    const raw = await runClaudeText(sys + '\n\nLINES:\n' + list, 120000, log, 'labelpicks', AE_MODEL);
    const m = String(raw || '').match(/\[[\s\S]*\]/);
    if (m) {
      for (const e of JSON.parse(m[0])) {
        if (e && typeof e.i === 'number') labelled[e.i] = e;
      }
    }
    log(`labelpicks: ${Object.keys(labelled).length}/${chosen.length} labelled`);
  } catch (e) { log('labelpicks failed, using fallbacks: ' + e.message); }
  return chosen.map((s) => {
    const e = labelled[s.i];
    if (!e) return fallback(s);
    return {
      startSec: s.startSec, endSec: s.endSec,
      type: AE_MOMENT_TYPES.includes(e.type) ? e.type : 'callout',
      label: String(e.label || '').slice(0, 80) || fallback(s).label,
    };
  });
}

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
// The Auto-Edit graphic prompt used to ORDER Claude to read six skill files
// before it could write a line — six tool round-trips per graphic, and the
// Remotion render itself is only ~7s of a ~60s job. The rules are static, so
// we read them once here and hand them over in-context instead. Same rules,
// guaranteed present, zero round-trips. Lazily cached; if a file is missing we
// just drop it and the prompt still stands on its own.
let _aeRulesCache = null;
function aeInlinedRules() {
  if (_aeRulesCache !== null) return _aeRulesCache;
  const SKILLS = path.join(os.homedir(), '.claude', 'skills');
  const want = [
    ['TRANSPARENT OUTPUT (alpha is critical for overlays)', 'remotion-best-practices/rules/transparent-videos.md'],
    ['TEXT ANIMATION',                                      'remotion-best-practices/rules/text-animations.md'],
    ['TIMING, INTERPOLATE + SPRING',                        'remotion-best-practices/rules/timing.md'],
    ['ANIMATION MATH (easings, stagger, clamp)',            'remotion-transitions/references/animation-math.md'],
  ];
  const parts = [];
  for (const [label, rel] of want) {
    try {
      const body = fs.readFileSync(path.join(SKILLS, rel), 'utf8')
        .replace(/^---[\s\S]*?---\s*/, '').trim();
      if (body) parts.push('── ' + label + ' ──\n' + body);
    } catch {}
  }
  _aeRulesCache = parts.join('\n\n');
  try { clog('bridge', 'info', 'auto-edit rules inlined', { files: parts.length, bytes: _aeRulesCache.length }); } catch {}
  return _aeRulesCache;
}

function generateMomentsParallel(moments, reqId, log, onProgress, genOpts) {
  const PARALLEL_CAP = 16;
  const vidW = (genOpts && genOpts.width)  || 1920;
  const vidH = (genOpts && genOpts.height) || 1080;
  const MAX_INFLIGHT = Math.min(moments.length || 1, PARALLEL_CAP);
  const cacheDir = path.join(OUTPUT_DIR, 'cache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}

  // ── Lower-third safe zone (talking-head) ─────────────────────────────────
  // Auto-Edit footage is talking-head: the speaker's FACE is in the UPPER part
  // of the frame. We hard-constrain every overlay to a FLOATING lower-third —
  // below the face (so it never covers it) but NOT jammed against the bottom
  // edge (a proper lower-third floats with margin below it). Three lines:
  //   faceSafeTopPx  = top bound — content must stay below this (off the face)
  //   safeBotPx      = bottom bound — content must stay above this (margin below)
  //   targetCenterPx = where the block should sit (vertically centred here)
  const _isVertical = vidH > vidW * 1.1;
  const _isSquare = !_isVertical && Math.abs(vidW - vidH) < vidW * 0.12;
  const voiceoverOnly = !!(genOpts && genOpts.voiceoverOnly);
  const faceSafeTopFrac = voiceoverOnly ? 0 : (_isVertical ? 0.54 : _isSquare ? 0.58 : 0.62);
  const bottomMarginFrac = _isVertical ? 0.11 : _isSquare ? 0.09 : 0.08;  // clear space BELOW the block
  const targetCenterFrac = _isVertical ? 0.68 : _isSquare ? 0.70 : 0.75;  // where the lower-third sits (upper chest)
  const faceSafeTopPx = Math.round(vidH * faceSafeTopFrac);
  const safeBotPx = Math.round(vidH * (1 - bottomMarginFrac));
  const targetCenterPx = Math.round(vidH * targetCenterFrac);
  const safeMarginX = Math.round(vidW * 0.05);
  // Post-render guard: mean alpha (0-255) allowed in the face zone before we
  // call it an intrusion and retry. A compliant graphic reads exactly 0 up
  // there (validated), so this is set low to catch even partial intrusions
  // while leaving margin above anti-aliasing noise.
  const FACE_ZONE_LIMIT = 12;

  // Sorted moment start times — used to stop each graphic BEFORE the next one
  // begins. Every graphic sits in the same lower-third band now, so two on
  // screen at once would visually collide. This is the hand-off gap.
  const _startsAsc = moments
    .map(m => (m && typeof m.startSec === 'number') ? m.startSec : null)
    .filter(s => s !== null)
    .sort((a, b) => a - b);
  function _nextStartAfter(s) {
    for (let i = 0; i < _startsAsc.length; i++) if (_startsAsc[i] > s + 0.05) return _startsAsc[i];
    return null;
  }

  const tasks = moments.map((m, idx) => {
    const speechDur = Math.max(0.5, m.endSec - m.startSec);
    // Cover the WHOLE moment's speech plus a tail, so the graphic NEVER finishes before
    // the sentence does. (Was capped at 6s, which truncated longer sentences by 2-3s.)
    // The +1.0s tail leaves room for a quick exit AFTER the speech; 20s is just a
    // runaway guard (normal moments are a few seconds).
    let durationSec = Math.max(2.8, Math.min(20, speechDur + 1.0));
    // ...but NEVER run into the next graphic. They share the same lower-third
    // spot, so overlapping in time = overlapping on screen. End ~0.25s before
    // the next moment starts. For sequential sentences the next moment begins
    // after this one ends, so this only trims the bonus tail — the sentence is
    // still fully covered. (Only a genuinely overlapping plan gets shortened,
    // which is correct: you can't show two graphics in one spot at once.)
    const ns = _nextStartAfter(m.startSec);
    if (ns != null) {
      const room = ns - m.startSec - 0.25;
      if (room > 0) durationSec = Math.min(durationSec, room);
    }
    durationSec = Math.max(1.4, durationSec);   // floor: never a sub-frame flash
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
    const vo = !!(opts && opts.voiceoverOnly);   // voiceover-only → full-screen WITH a background
    const refImgs = (opts && Array.isArray(opts.refImages)) ? opts.refImages.filter(Boolean) : [];
    let styleBlock = '';
    if (opts && opts.styleMode === 'same' && opts.styleSpec) {
      styleBlock = 'LOCKED STYLE — every graphic in THIS video shares ONE consistent look. '
        + 'Use exactly this palette, type and motion (nothing else) so all overlays read as a single designed set:\n' + opts.styleSpec;
    } else if (opts) {
      styleBlock = 'DISTINCT STYLE — give THIS graphic its own look (aesthetic hint: '
        + momentTypeToTrendPack(m.type, task.idx) + '). Across the video the graphics should feel VARIED — '
        + 'do not default to the same generic caption palette/type/motion every time.';
    }
    // PLACEMENT: full-screen for voiceover-only clips, else a FLOATING
    // lower-third — below the face but NOT jammed to the bottom edge. Geometric
    // pixel box + an explicit target centre, so Claude doesn't guess.
    let placement;
    if (vo) {
      placement =
        '- FULL-SCREEN graphic. This is a VOICEOVER-ONLY video — there is NO face to\n' +
        '  protect, so this graphic REPLACES the footage. It MUST have its OWN full-bleed\n' +
        '  BACKGROUND (a solid color, gradient, or designed backdrop in the chosen style)\n' +
        '  that fills the ENTIRE frame edge to edge and COVERS the footage — the footage\n' +
        '  underneath must NOT show through. Put the text/elements ON that background.\n' +
        '  Think full-screen title card / kinetic-typography slide, not a transparent\n' +
        '  overlay. Use the whole canvas, bold and cinematic.';
    } else {
      const faceHint = (opts && Array.isArray(opts.faceFrames) && opts.faceFrames.length)
        ? ('\n- Optional refinement — these are frames from the start, middle and end of\n' +
           '  the clip. You may Read them to see which SIDE the speaker leans and bias the\n' +
           '  graphic toward the emptier side, but STILL stay inside the y box:\n' +
           opts.faceFrames.map(f => '    ' + (f.label || '') + ': ' + f.path).join('\n'))
        : '';
      placement =
        '- HARD PLACEMENT RULE — this is TALKING-HEAD footage; the speaker\'s FACE is in\n' +
        '  the UPPER part of the frame. Build a FLOATING LOWER-THIRD. EVERY visible pixel\n' +
        '  MUST fit inside this box:\n' +
        '      x: ' + safeMarginX + 'px  to  ' + (vidW - safeMarginX) + 'px\n' +
        '      y: ' + faceSafeTopPx + 'px  (top) to  ' + safeBotPx + 'px  (bottom)   (frame is ' + vidW + 'x' + vidH + 'px)\n' +
        '  Vertically CENTRE the block around y=' + targetCenterPx + 'px (~' + Math.round(targetCenterFrac * 100) + '% down).\n' +
        '- TWO margins are mandatory:\n' +
        '    • Everything ABOVE y=' + faceSafeTopPx + 'px stays 100% transparent (the face).\n' +
        '    • Leave clear empty space BELOW the block — it must NOT touch the bottom edge;\n' +
        '      keep all content above y=' + safeBotPx + 'px (~' + Math.round(bottomMarginFrac * 100) + '% of the height is empty margin at the very bottom).\n' +
        '  So it sits in the LOWER THIRD, floating, not glued to the top OR the bottom.\n' +
        '- Do NOT draw a full-frame card, a full-height panel, or a border/scrim that spans\n' +
        '  the whole frame. Keep it compact.' +
        faceHint;
      if (task._zoneRetry) {
        placement += '\n- ⚠ YOUR PREVIOUS ATTEMPT BROKE THIS RULE and covered the face. This time keep\n' +
          '  ABSOLUTELY EVERYTHING below y=' + faceSafeTopPx + 'px (but still centred around\n' +
          '  y=' + targetCenterPx + 'px — a floating lower-third, NOT a strip at the very bottom).';
      }
    }
    return [
      vo
        ? 'Create a FULL-SCREEN motion graphic for a VOICEOVER-ONLY video. It is placed\non a track ABOVE the footage and REPLACES it — fill the ENTIRE frame with your\nown background; the footage underneath should not show through.'
        : 'Create a motion-graphic OVERLAY for a video. It will be placed on a\ntrack ABOVE the speaker\'s footage, so it MUST have a fully transparent\nbackground — only the graphic elements are visible.',
      '',
      'THE MOMENT (pulled from the video transcript):',
      '  type: ' + (m.type || 'fact'),
      '  show this: ' + _momentPayloadText(m),
      '  on screen for: ' + task.durationSec.toFixed(1) + 's (' + task.durationFrames + ' frames @ 30fps)',
      '',
      styleBlock,
      (opts && opts.changeDirective)
        ? ('\nREVISION — the user reviewed THIS graphic and wants ONE specific change:\n'
           + '  "' + String(opts.changeDirective).replace(/"/g, "'").slice(0, 600) + '"\n'
           + 'Apply exactly that change and nothing else. Keep the same moment text,\n'
           + 'the same timing/placement, and the rest of the look — only change what was\n'
           + 'asked. Build it as a fresh composition (do not try to read the old render).')
        : '',
      (opts && opts.userExtra)
        ? ('\nUSER\'S EXTRA INSTRUCTIONS for the whole edit — honor these on this graphic\n'
           + 'too (as long as they don\'t break the placement/timing rules below):\n'
           + '  "' + String(opts.userExtra).replace(/"/g, "'").slice(0, 600) + '"')
        : '',
      refImgs.length
        ? ('\nREFERENCE IMAGE' + (refImgs.length > 1 ? 'S' : '') + ' — the user pasted '
           + (refImgs.length > 1 ? 'these as style references' : 'this as a style reference')
           + '. READ each image file and mirror its look (palette, typography, composition,\n'
           + 'mood, texture) in this graphic:\n'
           + refImgs.map(p => '  ' + p).join('\n'))
        : '',
      '',
      // ── HyperFrames engine: author an HTML/GSAP block + render with the
      //    hyperframes CLI to the SAME alpha .mov path. The placement, timing,
      //    transparent-overlay and output-path rules below still apply.
      (opts && opts.engine === 'hyperframes')
        ? [
          'BUILD IT (HYPERFRAMES ENGINE):',
          '- Author a self-contained HyperFrames HTML/GSAP block per your system',
          '  prompt: ONE paused GSAP timeline registered at window.__timelines["main"],',
          '  a #root with data-composition-id="main", data-duration="' + task.durationSec.toFixed(2) + '",',
          '  data-width="' + vidW + '", data-height="' + vidH + '"; html/body/#root sized to ' + vidW + 'x' + vidH + '.',
          (vo
            ? '- FULL background: paint a full-bleed background on #root so it covers the footage.'
            : '- TRANSPARENT: do NOT paint any background on html/body/#root — only the graphic'
              + '\n  elements show. The render is alpha (MOV) so the speaker shows through.'),
          '- WebGL/canvas shaders ARE allowed (drive them from the timeline) plus CSS',
          '  effects (filter, blend modes, gradients, SVG filters) — use them for polish.',
          '- Save the block as the index.html of a fresh scratch dir:',
          '    ' + WORK_DIR + '/remotion-intro/.hf/ae_' + task.idx + '_' + Date.now() + '/index.html',
          '- Render to EXACTLY this path, with alpha (ProRes 4444 MOV):',
          '    cd "' + WORK_DIR + '/remotion-intro" && npx hyperframes render "<that scratch dir>" -o "' + task.outFile + '" --format mov --fps 30 --quality high',
          '  The MOV is ProRes with a yuva444p alpha channel — exactly what the overlay needs.',
        ].join('\n')
        : [
      'BUILD IT:',
      '- Write a FRESH Remotion composition from scratch. Do NOT copy or import',
      '  a template from src/templates/. Build the animation yourself.',
      '- The rules you need are INLINED BELOW under "SKILL RULES". Do NOT open',
      '  them with Read — you already have them. Go straight to writing the',
      '  component; every read is dead time on a job that renders in seconds.',
      '- DO NOT EXPLORE THE PROJECT. Everything you need is stated here:',
      '    • project root: ' + WORK_DIR + '/remotion-intro (deps + node_modules ready)',
      '    • you write exactly TWO new files under src/, then run the render',
      '    • no ls, no cat, no reading other components. Every prior render is a',
      '      DIFFERENT design — opening one only biases you and burns time.',
      '- For the OVERLAY ENTRY/EXIT animation, pick a reveal that fits the',
      '  moment\'s energy (striped slam, zoom punch, iris open, page tear, mask',
      '  wipe, glitch cut...) and build it as your own in/out animation — not a',
      '  TransitionSeries. Only if you want one specific catalogued recipe may',
      '  you read ~/.claude/skills/remotion-transitions/references/transition-catalog.md',
      '  (or -extra) — optional, and it costs a round-trip, so prefer your own.',
      '  For TEXT-DRIVEN overlays (titles, captions, callouts, stats), write',
      '  bespoke Remotion components — pick fonts, motion, easing, palette',
      vo
        ? '  based on what the user asked for. Give the root AbsoluteFill a FULL-FRAME\n  background fill (solid / gradient / designed) — NOT transparent — so it covers the footage.'
        : '  based on what the user actually asked for. Pass `bg="transparent"`\n  on the root AbsoluteFill so the ProRes 4444 alpha survives.',
      '- DO use the style library at ' + WORK_DIR + '/remotion-intro/src/lib/',
      '  for easings, palettes, typography and motion helpers — read the files',
      '  you need first to get exact export names.',
      '- ' + vidW + 'x' + vidH + ', 30fps, EXACTLY ' + task.durationFrames + ' frames.'
        + (vidW < vidH ? ' This is a VERTICAL frame — compose for a tall 9:16-ish canvas (stack elements, keep text within the centre safe area).' : (vidW === vidH ? ' This is a SQUARE frame.' : '')),
      vo
        ? ('- FULL-FRAME BACKGROUND — fill the entire canvas with your background so it\n'
           + '  COVERS the footage. Still render ProRes 4444 so the file imports cleanly:\n'
           + '      --codec prores --prores-profile 4444 --mute\n'
           + '  The alpha channel will simply be fully opaque — that is correct and\n'
           + '  expected for a voiceover-only full-screen graphic. You MUST still pass\n'
           + '  --prores-profile 4444 (pix_fmt yuva444p10le). --mute silences audio; the\n'
           + '  bridge also strips it with ffmpeg -an.')
        : ('- TRANSPARENT background — this is CRITICAL. The composition root must\n'
           + '  have NO opaque background (no solid-color AbsoluteFill behind it).\n'
           + '  Render with EXACTLY this codec config so the alpha channel survives:\n'
           + '      --codec prores --prores-profile 4444 --image-format png --pixel-format yuva444p10le --mute\n'
           + '  ⚠ --image-format png is MANDATORY. This project defaults to JPEG frames\n'
           + '  (remotion.config.ts) and JPEG has NO alpha — so WITHOUT --image-format\n'
           + '  png you get a .mov whose pixel format is yuva444p10le but whose alpha is\n'
           + '  FULLY OPAQUE (a solid background that is NOT removed), which is the #1\n'
           + '  cause of "it still has a background". ProRes 422 (the default codec) also\n'
           + '  has no alpha. --mute silences audio (the bridge also strips it with\n'
           + '  ffmpeg -an).\n'
           + '  Do NOT ffprobe or pixel-check the result afterwards — the bridge already\n'
           + '  verifies pix_fmt AND samples the alpha, and re-runs you automatically if\n'
           + '  it is opaque. Just render with the flags above and finish.'),
        ].join('\n'),
      placement,
      '- TIMING IS CRITICAL — the narration plays for the ENTIRE ' + task.durationSec.toFixed(1) + 's,',
      '  so the graphic MUST stay on screen and readable that whole time. Animate IN',
      '  quickly at the very start (first ~0.4s), then HOLD it fully visible (it can',
      '  keep subtly moving, but the main content stays put and legible). Do the exit',
      '  ONLY in the LAST ~0.4s. NEVER finish, fade out, or clear the screen early —',
      '  it must not disappear seconds before the sentence ends. Never static either.',
      '- Render the final file to EXACTLY this path:',
      '  ' + task.outFile,
      '',
      'When finished, the file at ' + task.outFile + ' must exist on disk.',
      'Emit [[IMPORT:' + task.outFile + ']] when done.',
      // The skill rules, handed over instead of read. Last so the task above
      // stays the first thing in view.
      (aeInlinedRules()
        ? '\n═══════════════════════════════════════════════════════════════════\n'
          + 'SKILL RULES — already loaded for you. Do not Read these files.\n'
          + '═══════════════════════════════════════════════════════════════════\n\n'
          + aeInlinedRules()
        : ''),
    ].join('\n');
  }

  // Mean alpha (0-255) of the face zone (the region ABOVE topPx) at a sampled
  // time. ~0 means the graphic stayed out of the face zone; a high value means
  // it intruded. Returns null if it couldn't measure (don't fail on that alone).
  function _faceZoneAlpha(file, topPx, sampleSec) {
    if (!(topPx > 1)) return null;
    try {
      const buf = require('child_process').execFileSync(FFMPEG_BIN, [
        '-ss', String(Math.max(0, sampleSec)),
        '-i', file,
        '-vf', 'alphaextract,crop=iw:' + Math.round(topPx) + ':0:0,scale=1:1:flags=area',
        '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', '-',
      ], { timeout: 15000, maxBuffer: 1024 * 1024 });
      if (buf && buf.length) return buf[0];
    } catch (e) {}
    return null;
  }

  function runOne(task, isRetry) {
    return new Promise((resolve) => {
      const tag = `gen[${task.idx}]${isRetry ? ' (retry)' : ''}`;
      const aeSys = (genOpts && genOpts.engine === 'hyperframes') ? HYPERFRAMES_SYSTEM_PROMPT : SYSTEM_PROMPT;
      // Honour the composer's model picker. Without this the graphic render
      // silently inherited whatever the CLI default happened to be, so Auto-Edit
      // quality drifted with an unrelated setting and there was no way to trade
      // speed for polish from the panel. Built into the array rather than
      // spliced in — an off-by-one here lands the flag inside another option's
      // value and the CLI dies instantly with no output.
      const aeModelArgs = (genOpts && genOpts.model) ? ['--model', genOpts.model] : [];
      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        ...aeModelArgs,
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', aeSys,
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
          resolve({ ok: false, idx: task.idx, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: 'no output' });
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
          // Face-zone guard — confirm the graphic stayed out of the upper (face)
          // band. Sample ~60% through (the held-visible phase). If it covers the
          // face zone, fail so it retries ONCE with a firmer bound; on the retry
          // we accept whatever we get so this never reduces the graphic count.
          if (!voiceoverOnly && faceSafeTopPx > 4) {
            const sampleSec = Math.max(0, Math.min(task.durationSec * 0.6, task.durationSec - 0.2));
            const za = _faceZoneAlpha(task.outFile, faceSafeTopPx, sampleSec);
            if (za != null) {
              log(`${tag} face-zone alpha=${za} (limit ${FACE_ZONE_LIMIT}, topPx=${faceSafeTopPx})`);
              if (za > FACE_ZONE_LIMIT && !isRetry) {
                log(`${tag} intrudes into the face zone — retrying with a firmer bound`);
                try { fs.unlinkSync(task.outFile); } catch {}
                task._zoneRetry = true;
                resolve({ ok: false, idx: task.idx, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: 'covers face zone' });
                return;
              }
            }
          }
          log(`${tag} ok -> ${task.outFile}`);
          // Strip the silent audio track so the graphic imports clean — no linked
          // audio clip on the timeline, exactly like a normal chat render. Uses
          // -c:v copy so the ProRes 4444 alpha is preserved (no re-encode).
          stripAudioInPlace(task.outFile).then(() => resolve({
            ok: true, idx: task.idx, file: task.outFile, atSec: task.moment.startSec,
            type: task.moment.type, label: task.moment.label || '',
            durationSec: task.durationSec,
          }));
          return;
        } else {
          try { fs.unlinkSync(task.outFile); } catch {}
          resolve({ ok: false, idx: task.idx, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: 'opaque (no alpha)' });
        }
      };
      proc.on('exit', conclude);
      proc.on('close', conclude);
      proc.on('error', (e) => {
        log(`${tag} spawn error ${e.message}`);
        if (!finished) { finished = true; clearInterval(watchdog); resolve({ ok: false, idx: task.idx, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: e.message }); }
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
    // Count the workers BEFORE starting any. Each worker runs synchronously up to
    // its first await — and it shifts a task off the queue before that — so
    // re-reading queue.length in the loop condition let the already-started
    // workers shrink the very number that decides how many more to start.
    // With 2 tasks that meant ONE worker (fully sequential); with 16, about 8.
    const workerCount = Math.min(MAX_INFLIGHT, queue.length);
    for (let w = 0; w < workerCount; w++) {
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
// Push ONE finished version's importable files to the panel the moment it's done,
// so the user can preview v1 while v2/v3 are still rendering (multi-version fan-out).
function broadcastVersionReady(reqId, info) {
  const data = JSON.stringify(Object.assign({ reqId: reqId || '' }, info || {}));
  for (const c of progressClients) {
    try { c.write('event: versionReady\ndata: ' + data + '\n\n'); } catch {}
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
  // The three levels differ in KIND, not just length. Light clarifies, Medium
  // directs the craft, Heavy commits to a concept. They used to differ only in
  // verbosity, so Heavy just produced ~3000 characters of texture words — which
  // also made the generator build something far more elaborate, and slower.
  // Across all three: add CRAFT, never invent NUMBERS. The generator picks the
  // durations, colours, fps and text itself.
  light: `You are a prompt enhancer for a Premiere Pro motion-graphics generator.
LIGHT — you CLARIFY, you do not embellish.\nThe user's idea is already there; it is just loosely worded. Resolve any ambiguity\nabout what should actually appear on screen, and add at most ONE motion cue if the\nrequest has none. Do not add composition, typography, texture or mood language —\nthat is what the higher levels are for.\nStay in the user's voice. Output ONE sentence, no longer than about 1.5x the input.\n\nNEVER invent any of these unless the user explicitly said them:
- Duration, seconds, frame counts, FPS
- Specific hex colors (a vibe like "warm dark" is fine; #ABC123 is not)
- Text strings, names, numbers, brand names
- Aspect ratio / resolution
- Beat-by-beat timings
- Specific component or pre-built skill names
If the user gave a value, keep it EXACTLY. If they didn't, say nothing about it — the generator decides.
No LLM filler: never "cinematic", "epic", "stunning", "captivating", "beautiful". Be concrete instead.
Output ONLY the rewritten prompt. No preface, no quotes, no markdown, no headers.`,

  medium: `You are a prompt-expansion engine for a Premiere Pro motion-graphics generator.
MEDIUM — you DIRECT THE CRAFT.\nKeep the user's idea exactly as-is, and tell the generator HOW it should feel. Cover\nonly what is relevant:\n- motion feel and easing in words (snap, spring, glide, anticipate-and-settle)\n- composition (anchor, alignment, hierarchy, negative space)\n- typography in words (geometric sans, editorial serif, tight tracking, heavy display)\n- mood and energy\n- what enters first and where the eye lands\nYou are describing intent, not designing the whole piece.\nOutput ONE flowing paragraph, roughly 2-3x the input. Do not exceed 900 characters.\n\nNEVER invent any of these unless the user explicitly said them:
- Duration, seconds, frame counts, FPS
- Specific hex colors (a vibe like "warm dark" is fine; #ABC123 is not)
- Text strings, names, numbers, brand names
- Aspect ratio / resolution
- Beat-by-beat timings
- Specific component or pre-built skill names
If the user gave a value, keep it EXACTLY. If they didn't, say nothing about it — the generator decides.
No LLM filler: never "cinematic", "epic", "stunning", "captivating", "beautiful". Be concrete instead.
Output ONLY the rewritten prompt. No preface, no quotes, no markdown, no headers.`,

  heavy: `You are a brief writer for a Premiere Pro motion-graphics generator.
HEAVY — you MAKE THE CREATIVE DECISIONS.\nThe user is delegating the concept to you, so commit to one. Do not hedge, do not\noffer alternatives, and do not simply pile on more adjectives than MEDIUM would.\nDecide and state:\n- the ONE concept or visual metaphor the piece is built on\n- the reveal order — what lands first, what supports it, what the payoff is\n- the visual hierarchy — what dominates the frame and what recedes\n- the motion character that ties it together\nBeing DECISIVE is the whole point of this level. A committed, specific concept in\n900 characters beats three paragraphs of texture words — and a shorter, sharper\nbrief also renders faster, which the user cares about.\nOutput at most TWO short paragraphs. Do not exceed 1200 characters.\n\nNEVER invent any of these unless the user explicitly said them:
- Duration, seconds, frame counts, FPS
- Specific hex colors (a vibe like "warm dark" is fine; #ABC123 is not)
- Text strings, names, numbers, brand names
- Aspect ratio / resolution
- Beat-by-beat timings
- Specific component or pre-built skill names
If the user gave a value, keep it EXACTLY. If they didn't, say nothing about it — the generator decides.
No LLM filler: never "cinematic", "epic", "stunning", "captivating", "beautiful". Be concrete instead.
Output ONLY the rewritten prompt. No preface, no quotes, no markdown, no headers.`,
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


// ── HyperFrames engine prompt ──────────────────────────────────────────────
// When the user flips the engine toggle to "HyperFrames", Claude authors a
// self-contained HTML/CSS/GSAP block (HeyGen's open HyperFrames framework) and
// renders it with the REAL `hyperframes` CLI (puppeteer + ffmpeg) — a genuine
// second render engine that captures WebGL/shaders/Three.js with real GPU,
// which Remotion's headless render cannot. Output (mp4 / alpha mov) flows
// through the SAME [[IMPORT:...]] path as Remotion mode.
const HYPERFRAMES_SYSTEM_PROMPT = `You are running inside an Adobe Premiere Pro extension panel. The user is editing video and you are their in-app assistant. The user has selected the HYPERFRAMES engine (HeyGen's open framework — HTML/CSS/GSAP rendered to video).

Each user message may be prefixed with a [PREMIERE CONTEXT] block (project, sequence, playhead, selected clips, and the output dir for rendered files). Ground your work in it; don't re-ask for what it provides.

When the user asks for motion graphics — intros, lower thirds, kinetic type, callouts, code reveals, stat slams, transitions, animated logos, shader looks — you build a HYPERFRAMES BLOCK: one self-contained HTML file animated with GSAP, rendered by the hyperframes CLI. You do NOT write React/Remotion code in this mode.

═══════════════════════════════════════════════════════════════════════════
THE HYPERFRAMES CONTRACT — follow it EXACTLY or the render comes out blank.
═══════════════════════════════════════════════════════════════════════════
A block is ONE HTML document whose animation is a single PAUSED GSAP timeline
registered on a global, so the renderer can seek it to any frame:

  1. Load GSAP from CDN in <head>:
     <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>

  2. A root element carrying the composition metadata:
     <div id="root" data-composition-id="main"
          data-duration="5" data-width="1920" data-height="1080"> … </div>
     (data-duration is in SECONDS. Match the canvas to the user's aspect:
      1920x1080 landscape, 1080x1920 vertical, 1080x1080 square.)

  3. Size html, body AND #root to the exact canvas; overflow:hidden.

  4. Build ALL motion as ONE paused timeline and REGISTER IT GLOBALLY:
       const tl = gsap.timeline({ paused: true });
       tl.from(...).to(...).fromTo(...);          // every animation goes here
       window.__timelines = window.__timelines || {};
       window.__timelines["main"] = tl;           // <-- the seek hook. REQUIRED.

  ABSOLUTE RULES (a broken one = a frozen or blank render):
  • EVERYTHING that moves MUST be driven by that GSAP timeline. The renderer
    seeks the timeline to each frame's time — anything NOT tied to it (and read
    via the timeline, e.g. in an onUpdate) will not animate.
  • NO CSS @keyframes animations / transitions for anything that must move
    (not seekable). Use GSAP. (Static CSS is fine.)
  • NO setTimeout / setInterval / standalone requestAnimationFrame loops, NO
    Date.now() / performance.now() for animation — non-deterministic, won't seek.
  • WebGL / Three.js / <canvas> shaders ARE allowed and encouraged in this mode
    — hyperframes captures them with a real GPU. Drive them from the timeline:
    read tl.time() inside the timeline's onUpdate and render your shader/canvas
    with that value (set a uTime uniform = tl.time(), then draw). Do NOT use a
    free-running rAF clock. CSS effects (filter, mix-blend-mode, gradients,
    backdrop-filter, SVG <filter>, clip-path, mask) also render perfectly.
  • Fonts: load via Google Fonts @import with &display=block, e.g.
    @import url("https://fonts.googleapis.com/css2?family=Anton&display=block");
  • The timeline's total duration should equal data-duration.
  • Use gsap eases (power3.out, expo.out, back.out(1.7), elastic) and stagger
    for polish. Seed randomness with fixed values so the timeline is deterministic.

TRANSPARENT / OVERLAY blocks (the user says "transparent", "overlay", "on top
of", "V2/V3", "alpha"): do NOT paint a background on html/body/#root. Leave it
transparent and render MOV (alpha) below. Otherwise paint a full background.

═══════════════════════════════════════════════════════════════════════════
RENDER IT WITH HYPERFRAMES (this is what produces the video file)
═══════════════════════════════════════════════════════════════════════════
hyperframes renders a DIRECTORY whose index.html is your block.

  1. Save your block as the index.html of a fresh scratch dir:
       ${WORK_DIR}/remotion-intro/.hf/<slug>/index.html
     (Put any local assets the block needs alongside it in that dir.)

  2. Render it from the remotion-intro folder (where hyperframes is installed):
     Opaque (h264 mp4):
       cd "${WORK_DIR}/remotion-intro" && npx hyperframes render "./.hf/<slug>" -o "<OUTPUT_DIR>/<file>.mp4" --fps 30 --quality high
     Transparent / alpha (overlay on V2/V3) — use MOV:
       cd "${WORK_DIR}/remotion-intro" && npx hyperframes render "./.hf/<slug>" -o "<OUTPUT_DIR>/<file>.mov" --format mov --fps 30 --quality high
     <OUTPUT_DIR> = the output dir from [PREMIERE CONTEXT] (quote it; may contain
     spaces). Clip length comes from your block's data-duration. Use
     ALWAYS --quality high. Render ONCE and ship it.
     The render is silent — no audio is added.

  3. Emit ONE marker per file so the panel imports it:
       [[IMPORT:<OUTPUT_DIR>/<file>.mov]]

THREE STEPS, NOTHING ELSE: write the block, render it, emit the marker.

RENDER ONCE. Do not do a draft pass and then a final pass — that is two full
renders for one deliverable and the user waits through both. Get the block right
in the HTML, render at high quality, emit the marker, done. Only re-render if the
render actually FAILED (no file, or an error) — not to "check" it.

DO NOT EXPLORE — with ONE exception, below.
You just wrote the block, so do NOT read it back to verify it. Do NOT search the
output folder or probe previous renders for dimensions; the size is in this
prompt. On a FRESH request do NOT open other blocks under .hf/ — it is a new
design and an old block only biases you. Each of those is a round-trip the user
waits through for information you already have.

THE EXCEPTION — ITERATION. If the message begins "Make a new version of a
previous render." then you are EDITING, not creating. You MUST find and read the
block that produced the file named on the "Previous file:" line (look under
.hf/ for the matching slug), then change ONLY what the "Change:" line asks for
and re-render it. Keep everything else — text, colours, timing, layout —
byte-identical. Reading in that case is required, not waste.

WORKED EXAMPLE (vertical kinetic title, 3s, opaque):
  ${WORK_DIR}/remotion-intro/.hf/hype-title/index.html:
    <!doctype html><html><head>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"></script>
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Anton&display=block");
      *{margin:0;box-sizing:border-box} html,body{width:1080px;height:1920px;overflow:hidden}
      #root{width:1080px;height:1920px;background:#0E1116;display:flex;align-items:center;justify-content:center}
      .word{font-family:Anton,sans-serif;font-size:200px;color:#fff;text-transform:uppercase;line-height:.9;text-align:center}
      .word span{display:inline-block;opacity:0;transform:translateY(120px)}
    </style></head><body>
    <div id="root" data-composition-id="main" data-duration="3" data-width="1080" data-height="1920">
      <div class="word"><span>SHIP</span><br><span>IT</span></div>
    </div>
    <script>
      const tl = gsap.timeline({paused:true});
      tl.to(".word span",{opacity:1,y:0,duration:.7,stagger:.18,ease:"back.out(1.6)"})
        .to(".word",{scale:1.06,duration:1.4,ease:"sine.inOut"}, "+=0.2");
      window.__timelines = window.__timelines || {}; window.__timelines["main"] = tl;
    </script></body></html>

  Render: cd "${WORK_DIR}/remotion-intro" && npx hyperframes render "./.hf/hype-title" -o "<OUTPUT_DIR>/HypeTitle0001.mp4" --fps 30 --quality high
  Then:   [[IMPORT:<OUTPUT_DIR>/HypeTitle0001.mp4]]

Keep slugs + filenames unique (short name + counter/timestamp). Be concise in
chat — a line or two on what you built; the panel shows the result.`;


const SYSTEM_PROMPT = `You are running inside an Adobe Premiere Pro extension panel. The user is editing video and you are their in-app assistant.

Each user message may be prefixed with a [PREMIERE CONTEXT] block describing the active project, sequence, playhead, and any selected clips. Use this to ground your suggestions in what the user is actually working on. Do not ask for context the panel already provided.

When the user asks for motion graphics, intros, outros, lower thirds, transitions, animated logos, kinetic typography, callouts, countdowns, or any other rendered video element, you MUST:
1. Build and render the result with the Remotion framework.
2. Render the final file into ${OUTPUT_DIR}.

═══════════════════════════════════════════════════════════════════════════
REMOTION TOOLKIT (remotion 4.0.474) — these packages are INSTALLED in the
project. Import them instead of hand-rolling the same thing badly:

  @remotion/layout-utils   fitText({text, withinWidth, fontFamily, fontWeight})
                           → the fontSize that FITS. Also measureText,
                           fitTextOnNLines, fillTextBox. USE fitText FOR EVERY
                           HEADLINE — never guess a font size and let text
                           overflow or wrap unexpectedly.
  @remotion/transitions    <TransitionSeries> with presentations: fade, slide,
                           wipe, flip, clockWipe, iris, cube, plus GL ones —
                           crossZoom, dreamyZoom, filmBurn, ripple, zoomBlur,
                           linearBlur, bookFlip, dissolve, crosswarp, swap,
                           zoomInOut (import from '@remotion/transitions/<name>').
                           Timings: springTiming(), linearTiming().
  @remotion/shapes         <Circle/Rect/Triangle/Star/Heart/Pie/Ellipse/Polygon/
                           Arrow> + make*() path versions — procedural SVG shapes.
  @remotion/paths          evolvePath(progress, d) → animated line drawing;
                           getPointAtLength, warpPath, cutPath, extendViewBox.
  @remotion/noise          noise2D/3D/4D(seed, x, y…) → organic wobble, particle
                           drift, hand-held camera shake.
  @remotion/motion-blur    <Trail> (echo trails) and <CameraMotionBlur> — wrap
                           fast-moving elements for true per-frame motion blur.
  @remotion/animation-utils makeTransform([translateX(…), scale(…), rotate(…)]),
                           interpolateStyles — composable transform strings.
  @remotion/effects        Canvas effect functions (blur, glow, vignette,
                           brightness, contrast, chromaticAberration,
                           barrelDistortion, colorKey, duotone, halftone,
                           scanlines, dotGrid, rings, zigzag, …) applied via the
                           \`effects\` prop on <Img>, <CanvasImage>, <Gif>, shapes.
  @remotion/light-leaks    <LightLeak durationInFrames seed hueShift> — cinematic
                           WebGL light-leak overlays; also lightLeak() effect.
  @remotion/gif            <Gif src> — frame-synced GIFs (NEVER <img> for gifs).
  @remotion/lottie         <Lottie animationData> for Lottie JSON files.
  @remotion/animated-emoji <AnimatedEmoji emoji="…"> Google animated emojis.
  @remotion/captions       createTikTokStyleCaptions() word-page grouping.
  @remotion/fonts          loadFont({family, url: staticFile(…)}) for local font
                           files (Google fonts: @remotion/google-fonts as usual —
                           but pass {weights: ['700'], subsets: ['latin']} to
                           loadFont() so it doesn't fetch 25 weights per font).
  @remotion/sfx            sound-effect URL constants on the remotion.media CDN
                           (whoosh, whip, ding, pop…) — audio policy still applies.
  @remotion/three          React Three Fiber <ThreeCanvas> for 3D.

V4 API RULES (a model with older knowledge writes these WRONG):
- spring() recipes: snappy pop = {damping: 200}; bouncy = {damping: 10};
  exact length via durationInFrames; measureSpring({fps, config}) for the true
  settle time. ALWAYS pass fps from useVideoConfig().
- <Sequence premountFor={30}> pre-mounts heavy children (images/video/3D)
  before they appear — kills first-frame jank/flicker.
- interpolate() accepts an ARRAY of easings (one per segment) and can
  interpolate CSS transform strings directly; interpolateColors supports
  oklch()/lab() for perceptually-even color ramps.
- trimBefore/trimAfter (in FRAMES) on <OffthreadVideo>/<Audio>. startFrom/endAt
  are DEPRECATED — never use them.
- Deterministic randomness ONLY via random('seed-string') — Math.random()
  breaks multi-threaded rendering. No CSS animations/transitions EVER (threads
  don't share state — animate with interpolate/spring off useCurrentFrame()).
- Default to extrapolateLeft/Right: 'clamp' on interpolate unless overshoot is
  the intent.

═══════════════════════════════════════════════════════════════════════════
INSTALLED SKILLS — load these before writing Remotion code, they have
battle-tested patterns that will dramatically improve output quality.
Skills live in ~/.claude/skills/.

ALREADY IN YOUR CONTEXT — do NOT Read these, you have them below under
REMOTION BEST PRACTICES. Reading them again is pure dead time:
    rules/animations.md, rules/transparent-videos.md, rules/text-animations.md
    (plus rules/motion-design.md + rules/timing.md on Default/Slow)

Worth a read ONLY if the request actually needs that specific technique:
    rules/transitions.md          Scene transition patterns.
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
    rules/google-fonts.md  rules/local-fonts.md
                                  Official font-loading patterns.
    rules/silence-detection.md    Detect/trim silence in audio.
    rules/html-in-canvas.md       Render HTML inside <Canvas>.
    rules/maplibre.md             Animated map scenes via MapLibre.
    (This skill auto-syncs weekly from the official remotion-dev/skills repo —
    if a rule file you expect is missing, ls the rules/ dir for what exists.)

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
DEFAULT IS OPAQUE. If the user did not ask for transparency, render a normal
opaque .mp4 with a painted background. Never infer transparency from what the
graphic depicts. A subscribe button, a lower-third, a logo sting, a callout
arrow are all ordinary opaque clips unless the user says otherwise. "It would
look better over footage" is NOT your call to make.

ONLY when the request actually says "transparent", "no background", "remove
the background", "alpha", "overlay", "on top of", or "for V2/V3" you MUST do
BOTH of these, or the output will have a solid black background:

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

CANVAS SIZE — never go looking for it. The message carries a USER PREFS line
with the size when it is known. If it does not, use 1920x1080 (or 1080x1920 if
the request is clearly vertical) and move on.
Do NOT hunt through the output folder, do NOT ffprobe a previous render, and do
NOT look for an old scratch directory to infer dimensions. That folder holds
hundreds of large .mov files; a find or probe across it takes MINUTES, produces
a frozen-looking progress bar, and tells you nothing the prompt has not already
told you. Same for style: every prompt is a fresh design, so there is nothing
worth reading in a previous render.

DETERMINISM — every frame must be a pure function of useCurrentFrame().
Remotion renders frames across MANY parallel Chrome processes and screenshots
each one; anything depending on wall-clock time or GPU layer state renders
differently per frame and shows up as FLICKER in the exported video.
  - NEVER use a CSS transition or CSS animation / keyframes. They animate on
    real time, so each frame gets captured at an arbitrary point mid-animation.
    Drive every change from the frame number instead (interpolate, spring,
    interpolateColors).
  - NEVER set willChange. It promotes the element to a GPU layer, and layer
    rasterisation is not identical across render workers.
  - No Math.random(), no Date.now(), nothing that varies per render.
Measured, not theoretical: a caption composition using a 90ms CSS colour
transition plus willChange produced 8,690 pixels of colour difference between
two renders of the SAME frame. Removing both made every frame byte-identical.

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
  4. Write a one-composition entry src/<NewUniqueName>.entry.tsx that registers ONLY this composition (see "RENDER IN ISOLATION" below). Do NOT touch src/Root.tsx.
  5. Render that entry. Run self-critique. Ship.

DON'T copy a template AND add 4 other library components on top. The
template is already restrained — adding more breaks the balance. The single
biggest improvement to your output quality from now on is "copy the template,
change the text, don't reach for anything else."

If the user's prompt clearly doesn't match any template (e.g. a wild custom
animation), THEN start blank and use the library directly.
═══════════════════════════════════════════════════════════════════════════

PRE-SCAFFOLDED REMOTION PROJECT:
- A Remotion project is already installed at ${WORK_DIR}/remotion-intro/ with node_modules ready.
- Write your composition as a uniquely-named TSX file in ${WORK_DIR}/remotion-intro/src/ (include a short timestamp suffix so it never collides, e.g. src/MyThing0611t1530.tsx).
- ⚡ RENDER IN ISOLATION — the single most important rule for render speed. NEVER render src/index.ts or src/Root.tsx. That entry imports EVERY past composition (hundreds of them), and each one runs its own top-level loadFont() at bundle time → THOUSANDS of Google-Fonts network requests on EVERY render → the render takes 20-40 minutes or stalls and gets killed, and the user sees "none rendered". Instead render a tiny standalone entry that imports ONLY your one composition:
    1. Write src/<Name>.tsx — your component (named export <Name>).
    2. Write src/<Name>.entry.tsx — a one-composition root (put in your REAL durationInFrames / width / height):
         import { registerRoot, Composition } from 'remotion';
         import { <Name> } from './<Name>';
         registerRoot(() => ( <Composition id="<Name>" component={<Name>} durationInFrames={<frames>} fps={30} width={<W>} height={<H>} /> ));
    3. Render THAT entry (never src/index.ts) with the command below.
  The bundle then contains ONLY your composition → it renders in SECONDS, and a broken or slow older composition can never make your render fail. Do NOT open or edit src/Root.tsx — it is not used for rendering.
- FONTS — if you use @remotion/google-fonts, load ONLY the weights you actually use and silence the warning, e.g. loadFont("normal", { weights: ["400","700"], subsets: ["latin"], ignoreTooManyRequestsWarning: true }). Loading a whole family fires 50-120 network requests and slows the render; a plain CSS font-family (system font) needs ZERO network — prefer it unless a specific Google font is required.
- Render with: \`cd ${WORK_DIR}/remotion-intro && npx remotion render src/<Name>.entry.tsx <Name> "<OUTPUT_DIR>/<filename>.mp4" --codec=h264 --mute --hardware-acceleration=if-possible\` — \`--hardware-acceleration=if-possible\` uses the Mac's VideoToolbox encoder (much faster; silently falls back to software on Windows — always include it). \`--mute\` is REQUIRED unless the composition actually has <Audio> elements; it silences any audio track Remotion would otherwise add. (NOTE: \`--audio-codec=no-audio\` does NOT exist as a flag and errors out — use \`--mute\` instead. The bridge also post-strips audio with ffmpeg -an, so the final file Premiere sees has no audio stream at all.) <OUTPUT_DIR> = the "Output dir for any rendered files" path from the [PREMIERE CONTEXT] block at the top of the user's message (NOT the global default). If no context is provided fall back to ${OUTPUT_DIR}. Quote the path because it may contain spaces (e.g. "Vera Vid 13/Claude Animations/...").
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
       npx remotion still src/<Name>.entry.tsx <Name> ${OUTPUT_DIR}/_check_<id>.png --frame=<frameAtMiddle>
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
- Create a new component file with a unique name (e.g. include a short timestamp or descriptive suffix) so you do not collide with previous renders, plus its OWN one-composition entry file (src/<Name>.entry.tsx) that imports only it. Do NOT register in or edit src/Root.tsx — renders use the per-composition entry (see "RENDER IN ISOLATION").
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
// Inlined so Claude never spends a tool round-trip fetching them. transparent-
// videos + text-animations join the core set because they are the two the
// prompt used to say "READ THIS" about — which cost a call on almost every job.
const BP_CORE  = [_readBPRule('animations.md'), _readBPRule('transparent-videos.md'),
                  _readBPRule('text-animations.md')].filter(Boolean).join('\n\n---\n\n');
const BP_CRAFT = [_readBPRule('motion-design.md'), _readBPRule('timing.md')].filter(Boolean).join('\n\n---\n\n');
clog('bridge', 'info', 'best-practices loaded', {
  core: BP_CORE.length, craft: BP_CRAFT.length, dir: BP_RULES_DIR,
});

// Build the inject block for a given render mode. Empty string if no rules
// were found (skill not installed) — caller-safe.
// FAST mode gets a SHORT prompt on purpose. Default/Slow carry ~50KB of rules
// (system prompt + best practices + mode header) which is what makes them
// deliberate and slow. Fast should behave like asking in a terminal: understand
// the request, write it, render it, done. Everything here is load-bearing —
// paths, flags, the import marker, and the two rules that silently ruin a
// render (audio, and wall-clock animation).
function buildFastSystemPrompt() {
  return [
    'You are generating ONE motion graphic for a video editor working in Adobe Premiere Pro.',
    'Be direct and pragmatic. Build the simplest thing that genuinely satisfies the request, then stop.',
    '',
    'HOW TO BUILD IT',
    '- Remotion project (already installed, do NOT npm install): ' + WORK_DIR + '/remotion-intro',
    '- Write TWO files in src/: your component, and a one-composition entry',
    '  src/<Name>.entry.tsx that registers ONLY it. Never touch src/Root.tsx.',
    '- Use a unique <Name> so you never collide with an earlier render.',
    '- Do NOT explore the project first. No ls, no cat, no reading old components.',
    '  Everything you need is in this prompt.',
    '- EXCEPTION — if the message begins "Make a new version of a previous render."',
    '  you are EDITING. Read the component behind the "Previous file:" path, change',
    '  ONLY what the "Change:" line asks, keep the rest identical, re-render.',
    '',
    'HOW TO RENDER IT (run exactly once, from ' + WORK_DIR + '/remotion-intro)',
    '  Normal (opaque mp4):',
    '    npx remotion render src/<Name>.entry.tsx <Name> "<OUTPUT_DIR>/<file>.mp4" --codec h264 --mute --hardware-acceleration=if-possible',
    '  Transparent overlay — ONLY if the user literally used one of these words:',
    '  transparent, alpha, overlay, no background, "on top of", V2/V3. Never pick',
    '  this because the graphic "looks like" it belongs over footage. A subscribe',
    '  button, lower-third or logo sting is an opaque mp4 unless they said so:',
    '    npx remotion render src/<Name>.entry.tsx <Name> "<OUTPUT_DIR>/<file>.mov" --codec prores --prores-profile 4444 --image-format png --pixel-format yuva444p10le --mute',
    '  <OUTPUT_DIR> is the output dir from the [PREMIERE CONTEXT] block. Quote it.',
    '- Render ONCE. No draft pass, no re-render to "check" it, no ffprobe of your',
    '  own output — the app already verifies the file. Only re-render if it FAILED.',
    '',
    'TWO RULES THAT SILENTLY RUIN A RENDER',
    '- No audio. Ever. Always pass --mute.',
    '- Animate from useCurrentFrame() only. No CSS transition, no CSS animation,',
    '  no keyframes, no willChange, no Math.random(), no Date.now(). Frames are',
    '  rendered by parallel browsers; anything time-based flickers.',
    '',
    'Canvas size comes from the USER PREFS line if present, else 1920x1080',
    '(or 1080x1920 if the request is clearly vertical). Never go hunting for it.',
    '',
    'When the file exists, emit exactly: [[IMPORT:<abs path to the file>]]',
    'Reply in ONE short sentence. No essay.',
  ].join('\n');
}

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
// Public Supabase config baked in as the DEFAULT so sign-in + render metering
// work out of the box on every install — no account, no renders. This is the
// PUBLIC url + publishable (anon) key, the same pair shipped in the website's
// config.js and guarded by Row Level Security; safe to embed. Env vars or
// <WORK_DIR>/bridge-auth.json still override it. Set CLAUDE_BRIDGE_NO_AUTH=1
// to turn the gate off (dev only).
const DEFAULT_SUPABASE_URL  = 'https://hwsyaqmkwitxprtnrzkj.supabase.co';
const DEFAULT_SUPABASE_ANON = 'sb_publishable_k7tsIqZia0WXf4eGQwcY2w_jFjAkDEK';
const _authDisabled = process.env.CLAUDE_BRIDGE_NO_AUTH === '1';
let AUTH = { url: process.env.SUPABASE_URL || '', anon: process.env.SUPABASE_ANON_KEY || '' };
try {
  const cfgFile = path.join(WORK_DIR, 'bridge-auth.json');
  if ((!AUTH.url || !AUTH.anon) && fs.existsSync(cfgFile)) {
    const j = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    AUTH.url = AUTH.url || j.SUPABASE_URL || j.url || '';
    AUTH.anon = AUTH.anon || j.SUPABASE_ANON_KEY || j.anon || '';
  }
} catch (e) { alog('config read failed: ' + e.message); }
if (!_authDisabled) {
  AUTH.url  = AUTH.url  || DEFAULT_SUPABASE_URL;
  AUTH.anon = AUTH.anon || DEFAULT_SUPABASE_ANON;
}
AUTH.url = String(AUTH.url).replace(/\/+$/, '');
const AUTH_ENABLED = !_authDisabled && !!(AUTH.url && AUTH.anon);
if (AUTH_ENABLED) alog('auth enabled for ' + AUTH.url); else alog('auth disabled (CLAUDE_BRIDGE_NO_AUTH) — renders are ungated');

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
const OWNER_EMAILS = (process.env.OWNER_EMAILS || 'iprincemax72@gmail.com,anshdhakad9@gmail.com').toLowerCase().split(',').map(e => e.trim()).filter(Boolean);
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
    renders_limit: owner ? 999999 : ((u && u.renders_limit != null) ? u.renders_limit : 10),
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
+ '.brand{display:flex;align-items:center;gap:9px;font-weight:600;margin-bottom:22px}.glyph{width:34px;height:30px;background:url(data:image/png;base64,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) center/contain no-repeat;display:inline-block;filter:drop-shadow(0 0 7px rgba(226,136,95,.5))}'
+ '.big{font-size:1.5rem;font-weight:700;letter-spacing:-.02em;margin-bottom:8px}.sub{color:#9a9aa1;font-size:.95rem;line-height:1.55;margin-bottom:22px}'
+ '.gbtn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;font:600 1rem system-ui;color:#0a0a0b;background:#F4F4F5;border:0;border-radius:12px;padding:.9em;cursor:pointer}.gbtn:hover{filter:brightness(1.05)}.gbtn svg{width:18px;height:18px}b{color:#fafafa}'
+ '.fld{margin-bottom:10px}.fld input{width:100%;font:1rem system-ui;color:#fafafa;background:#1a1a1e;border:1px solid rgba(255,255,255,.14);border-radius:11px;padding:.8em .9em}.fld input:focus{outline:none;border-color:#E2885F}.sbtn{width:100%;font:600 1rem system-ui;color:#15110d;background:#E2885F;border:0;border-radius:12px;padding:.85em;cursor:pointer;margin-top:2px}.sbtn:hover{filter:brightness(1.05)}.sbtn:disabled{opacity:.6}.orline{display:flex;align-items:center;gap:10px;color:#7c7d87;font-size:.76rem;margin:14px 0}.orline::before,.orline::after{content:"";flex:1;height:1px;background:rgba(255,255,255,.09)}.lnk{background:0;border:0;color:#9a9aa1;font:inherit;font-size:.82rem;text-decoration:underline;cursor:pointer;padding:6px 0}.lnk:hover{color:#fafafa}.e{color:#e98c7a;font-size:.85rem;margin-top:10px}</style></head>'
+ '<body><div class="card"><div class="brand"><span class="glyph"></span><span>Flimify <small style="color:#7c7d87">for Premiere Pro</small></span></div><div id="view"><p class="sub">Loading…</p></div></div>'
+ '<script type="module">'
+ 'import { createClient } from "https://esm.sh/@supabase/supabase-js@2";'
+ 'var SB_URL="' + AUTH.url + '",SB_ANON="' + AUTH.anon + '";'
+ 'var supabase=createClient(SB_URL,SB_ANON,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:"pkce"}});'
+ 'var view=document.getElementById("view");function show(h){view.innerHTML=h;}'
+ 'var GSVG=\'<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>\';'
+ 'async function pushToBridge(s){var body=JSON.stringify({access_token:s.access_token,refresh_token:s.refresh_token,expires_at:s.expires_at,user:s.user});try{var r=await fetch("/auth/session",{method:"POST",headers:{"Content-Type":"application/json"},body:body});return r.ok;}catch(e){return false;}}'
+ 'function signinView(){'
+ 'show(\'<p class="big">Connect your extension</p><p class="sub">Sign in with Google to link this device. Free plan includes 10 renders a month.</p><button id="g" class="gbtn">\'+GSVG+\' Continue with Google</button><div id="er" class="e" style="display:none;margin-top:12px"></div>\');'
+ 'var er=document.getElementById("er");function ee(m){er.textContent=m;er.style.display="block";}'
+ 'document.getElementById("g").onclick=async function(){var r=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+"/connect",queryParams:{prompt:"select_account"}}});if(r.error)ee(r.error.message);};'
+ '}'
+ '(async function(){var Q=new URLSearchParams(location.search);if(Q.get("reauth")==="1"&&!Q.get("code")){try{await supabase.auth.signOut({scope:"local"});}catch(e){}signinView(false);return;}var res=await supabase.auth.getSession();var session=res.data.session;'
+ 'if(session){show(\'<p class="big">Connecting…</p>\');var ok=await pushToBridge(session);'
+ 'show(ok?\'<p class="big">&#10003; Connected</p><p class="sub">Your extension is signed in as <b>\'+(session.user.email||"")+\'</b>. Close this tab and head back to Premiere.</p>\':\'<p class="big">Almost there</p><p class="sub">Couldn&#39;t reach the local bridge. Make sure the Claude Bridge app is running, then reload this page.</p>\');return;}'
+ 'signinView(false);'
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
  if (req.method === 'POST' && (req.url === '/chat' || req.url === '/autoedit' || req.url === '/autoedit/run' || req.url === '/autoedit/rerender' || req.url === '/autoedit/analyze' || req.url === '/autocut' || req.url === '/captions' || req.url === '/captions/transcribe' || req.url === '/plan/questions')) {
    _heavyInflight++;
    res.on('close', () => { _heavyInflight = Math.max(0, _heavyInflight - 1); });
  }

  // Plan backstop: Auto-Edit / Auto-Cut are Studio-only. Only blocks when we KNOW
  // the plan isn't Studio (cache populated by /auth/status polls) — fail-open
  // otherwise, since the panel already locks the button.
  if (req.method === 'POST' && (req.url === '/autoedit' || req.url === '/autoedit/run' || req.url === '/autoedit/rerender' || req.url === '/autoedit/analyze' || req.url === '/autocut')) {
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

  // Renders the bridge has produced, newest first. The panel merges anything it
  // doesn't already have into History on boot, so a render survives the panel
  // closing, localStorage being cleared, or being produced outside the panel.
  if (req.method === 'GET' && req.url.startsWith('/renders/recent')) {
    let n = 300;
    try { const q = new URL('http://x' + req.url).searchParams.get('n'); if (q) n = Math.max(1, Math.min(1000, +q || 300)); } catch {}
    const all = readRenderIndex(n);
    // Only offer files that are still on disk — a dead path helps nobody.
    const live = all.filter(r => { try { return fs.existsSync(r.file); } catch { return false; } });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: live.length, renders: live }));
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

  // ── One-shot diagnostics bundle — environment + a LIVE `claude --version`
  //    probe + recent errors, all in one JSON. Open http://127.0.0.1:3737/diagnostics
  //    in a browser (or the panel's "Copy diagnostics" button), copy it, and paste
  //    to support — it's everything needed to diagnose a spawn/render failure
  //    without screenshots.
  if (req.method === 'GET' && req.url.startsWith('/diagnostics')) {
    (async () => {
      // Live probe: can we actually run the CLI? Catches node-vs-exe spawn bugs.
      const claudeProbe = await new Promise(resolve => {
        let out = '', err = '', done = false, proc, to;
        const finish = v => { if (done) return; done = true; try { clearTimeout(to); } catch {} try { proc && proc.kill('SIGKILL'); } catch {} resolve(v); };
        try { proc = spawnClaude(['--version'], { stdio: ['ignore', 'pipe', 'pipe'] }); }
        catch (e) { return resolve({ ok: false, error: 'spawn threw: ' + String(e && e.message || e) }); }
        to = setTimeout(() => finish({ ok: false, error: 'timeout (5s)', stdout: out.slice(0, 300), stderr: err.slice(0, 1000) }), 5000);
        if (to.unref) to.unref();
        if (proc.stdout) proc.stdout.on('data', d => { out += d.toString(); });
        if (proc.stderr) proc.stderr.on('data', d => { err += d.toString(); });
        proc.on('error', e => finish({ ok: false, error: String(e && e.message || e), stderr: err.slice(0, 1000) }));
        proc.on('close', code => finish({ ok: code === 0, exitCode: code, version: out.trim().slice(0, 120), stderr: err.slice(0, 1000) }));
      });
      let logLines = [];
      try { logLines = fs.readFileSync(UNIFIED_LOG, 'utf8').trim().split('\n').slice(-150).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } }); } catch {}
      const recentErrors = logLines.filter(r => r && (r.level === 'error' || r.level === 'warn')).slice(-60);
      const bundle = {
        generatedAt: new Date().toISOString(),
        bridgeVersion: (typeof PANEL_VERSION !== 'undefined' ? PANEL_VERSION : '?'),
        session: SESSION_ID.slice(0, 8),
        env: { platform: process.platform, arch: process.arch, node: process.version, osRelease: os.release(), homedir: os.homedir() },
        paths: {
          workDir: WORK_DIR, outputDir: OUTPUT_DIR, logFile: UNIFIED_LOG,
          remotionProject: fs.existsSync(path.join(WORK_DIR, 'remotion-intro')),
          remotionInstalled: fs.existsSync(path.join(WORK_DIR, 'remotion-intro', 'node_modules', 'remotion')),
        },
        auth: { enabled: AUTH_ENABLED, signedIn: !!((loadSession() || {}).access_token) },
        claudeLauncher: resolveClaude(),
        claudeProbe,
        recentErrors,
        recentLog: logLines.slice(-40),
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(bundle, null, 2));
    })().catch(e => { try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) })); } catch {} });
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

  // List every installed system font family (for the captions font picker).
  if (req.method === 'GET' && req.url === '/captions/fonts') {
    try {
      const fonts = getSystemFonts();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, fonts }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e), fonts: [] }));
    }
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
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"expanded":""}'); return; }
      const promptText = (payload.prompt || '').toString();
      if (!promptText.trim() || promptText.length < 3 || promptText.length > 2000) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ expanded: '' }));
        return;
      }

      const level = ['light', 'medium', 'heavy'].indexOf(payload.level) >= 0 ? payload.level : 'medium';
      const sys = EXPAND_SYSTEMS[level];

      // Every other path pins its model. This one used to send no --model at
      // all and inherit whatever the CLI default happened to be, so Expand was
      // the one feature whose quality silently changed when that default moved
      // — and the composer's model picker never reached it. Pin it, and let the
      // picker override when it is set to something other than 'auto'.
      const wantModel = (typeof payload.model === 'string' && payload.model && payload.model !== 'auto')
        ? payload.model : AE_MODEL;
      const args = [
        '-p',
        '--output-format', 'json',
        '--no-session-persistence',
        '--exclude-dynamic-system-prompt-sections',
        '--disable-slash-commands',
        '--model', wantModel,
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
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"completion":""}'); return; }
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
      }, 25000);   // the call itself measures ~10s (the model deliberates even on an
                   // autocomplete), so a 12s cap was killing calls that were about to
                   // succeed. Costs nothing to wait: the panel aborts this request the
                   // moment the user types again, and the bridge kills the process.

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
      try { p = parseObjBody(body); }
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
      try { payload = parseObjBody(body); }
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
      // Render ENGINE — 'remotion' (default, React) or 'hyperframes' (HeyGen's
      // HTML/CSS/GSAP framework, rendered by the real hyperframes CLI).
      const engine = (payload.engine === 'hyperframes') ? 'hyperframes' : 'remotion';
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
            const candidate = path.join(projectFolder, PROJECT_RENDER_DIRNAME);
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
        if (context.selectedClipPath) {
          let clipLine = 'Selected clip file (you CAN analyze this directly with ffmpeg / ffprobe / transcription): ' + context.selectedClipPath;
          if (typeof context.selectedClipInSec === 'number' && typeof context.selectedClipOutSec === 'number')
            clipLine += '  [used in/out on the timeline: ' + context.selectedClipInSec.toFixed(2) + 's–' + context.selectedClipOutSec.toFixed(2) + 's]';
          else if (typeof context.selectedClipDuration === 'number')
            clipLine += '  [duration: ' + context.selectedClipDuration.toFixed(2) + 's]';
          ctxLines.push(clipLine);
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
          + 'content. (2) Render to a .mov with EXACTLY: --codec prores '
          + '--prores-profile 4444 --image-format png --pixel-format yuva444p10le --mute. '
          + '--image-format png is MANDATORY — without it the alpha comes out FULLY '
          + 'OPAQUE (this project defaults to JPEG frames, which have no alpha), so the '
          + 'background stays even though ffprobe shows yuva444p10le. H.264/.mp4 CANNOT '
          + 'be transparent. (3) VERIFY a corner pixel\'s alpha is ~0 (extract it with '
          + 'ffmpeg format=rgba,crop=2:2:0:0) — do NOT just trust the pixel format; '
          + 're-render with --image-format png if it is not transparent.\n\n'
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
          '- DO NOT write Remotion compositions, DO NOT emit [[IMPORT:...]] markers, DO NOT render any animation/video files. Those belong in animation tabs.',
          '- You CAN and SHOULD use the terminal to ANALYZE the user\'s footage when they ask about its content. ffmpeg + ffprobe are on PATH, and you can transcribe audio: prefer the asr-transcribe-to-text skill if installed, else whisper-cli / faster-whisper, else ffmpeg-extract the audio (e.g. -ac 1 -ar 16000 wav) and run an STT. Use this to answer asks like "what are the key points / keypoints", "summarize this clip", "where are the highlights", "find the silences/filler", "what\'s the audio level", "what\'s said around 1:30".',
          '- The SELECTED CLIP\'s real file path (and its used in/out range) is in the [PREMIERE CONTEXT] block — analyze THAT file. If you only need a portion, use the in/out range. If nothing is selected and you need a clip, ask the user to select one in the timeline.',
          '- For a "key points / summary" ask: transcribe the clip (or just its in/out range), then reply with a TIGHT bulleted summary, each bullet timestamped to the main moments. Keep it short.',
          '- You may read/inspect files and run analysis commands, but do NOT modify the user\'s project, media, or write .tsx/render files.',
          '- If the user asks for an actual rendered animation, tell them to switch to an animation tab (the + button next to the chat-bubble + button at the top).',
          '- Answer in plain markdown. Concise, useful, no filler — they want the answer, not an essay.',
        ].join('\n');
      } else if (engine === 'hyperframes') {
        // HyperFrames engine — Claude authors an HTML/GSAP block + renders it
        // with the real hyperframes CLI. Self-contained prompt; the
        // Remotion-specific best-practices block + mode headers don't apply.
        // This branch is checked BEFORE renderMode, so Fast used to be ignored
        // entirely here — same elaborate build whichever speed you picked.
        resolvedSystemPrompt = HYPERFRAMES_SYSTEM_PROMPT
          + (renderMode === 'fast'
            ? '\n\nMODE: FAST — keep it SIMPLE. One clear idea, a handful of elements,'
              + '\none motion. Do not layer effects, do not choreograph multiple beats,'
              + '\ndo not stack blur/drop-shadow (they are the most expensive thing you'
              + '\ncan render, per frame). Write it, render it, ship it.'
            : '');
      } else if (renderMode === 'fast') {
        // Short prompt, no mode header, no best-practices block (see below).
        resolvedSystemPrompt = buildFastSystemPrompt();
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
      // Remotion-specific framing (creative-ambition mode headers + the
      // best-practices rules block) only applies to the Remotion engine.
      if (tabMode !== 'chat' && engine !== 'hyperframes' && renderMode !== 'fast') {
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
        // Model per render mode (hybrid): Fast stays on the small fast model (Haiku)
        // so the quick path is snappy; Default + Slow use Opus 5 (latest Opus) for
        // the best-looking graphics, accepting the slower generation. NOTE: Fable 5
        // is credit-metered separately and hard-fails with "out of usage credits"
        // when empty, so it is deliberately NOT used here. GEN_FALLBACK_MODEL catches
        // any model that runs dry so a render degrades instead of erroring out.
        // The panel's composer-bar model picker can pin a specific model; 'auto'
        // (or anything unrecognised) falls through to the per-mode default above.
        const ALLOWED_GEN_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-fable-5'];
        const pickedModel = ALLOWED_GEN_MODELS.includes(payload && payload.model) ? payload.model : null;
        const genModel = opts.model || pickedModel || 'claude-opus-5';
        const args = [
          '-p',
          '--output-format', 'stream-json',
          '--verbose',
          '--model', genModel,
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
              // A separately-metered model (e.g. Fable 5) can hard-fail with "out of
              // usage credits" while the plan's other models still work fine. Retry
              // once on the fallback model so the render degrades instead of dying.
              if (!opts.model && /usage credits|out of credits|\/model to switch/i.test(err)) {
                clog('bridge', 'warn', 'generation model out of credits, retrying on fallback',
                  { from: genModel, to: GEN_FALLBACK_MODEL }, reqId);
                return runClaudeOnce(retry, Object.assign({}, opts, { model: GEN_FALLBACK_MODEL })).then(done);
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
        // Pre-assigned, ORTHOGONAL art directions. The parallel builds can't see each
        // other, so "be different from the others" doesn't work — they converge on the
        // same obvious idea. Instead steer each version down a DISTINCT lane so they
        // diverge by construction. Every lane still honours the brief's explicit
        // text/colors/aspect/vibe; it only varies what the prompt left open.
        const DIRECTIONS = [
          'Center-stage & symmetric — the main element owns the middle; snappy overshoot entrances that settle hard; minimal extra decoration.',
          'Asymmetric & airy — push the focus off-center with generous negative space; slow smooth eases; one quiet accent element.',
          'Playful & springy — bouncy spring physics, a little wiggle/overshoot, rounded characterful shapes and cheerful secondary bits.',
          'Cinematic depth — layered parallax and scale-depth, a slow weighty build, soft glow/vignette atmosphere.',
          'Kinetic typography — let the text drive it: stagger, break or rotate words on a rhythmic beat; grid-aligned.',
          'Organic flow — curves and soft gradients, continuous drifting/floating motion, gentle particles throughout.',
          'Bold graphic — flat color blocks and geometric shapes, big confident type, stamp/marquee-style motion.',
          'Stagger cascade — elements arrive one-by-one in a clear readable sequence; clean restrained styling so the timing reads.',
          'Dense & energetic — lots of motion: quick zoom-punches, flashes and shake accents, a packed frame.',
          'Dreamy & soft — blur/bokeh, light leaks, slow fades, an airy feel.',
        ];
        const thunks = [];
        for (let i = 1; i <= N; i++) {
          const idx = i;
          thunks.push(async () => {
            let ws;
            try { ws = setupVersionWorkspace(reqId, idx); wsPaths.push(ws); }
            catch (e) { return { ok: false, error: 'workspace setup failed: ' + e.message }; }
            const vSys = resolvedSystemPrompt.split(REMOTION_BASE).join(ws);
            const seed = Math.random().toString(36).slice(2, 6);
            const direction = DIRECTIONS[(idx - 1) % DIRECTIONS.length];
            const vMsg =
                '[VERSION ' + idx + ' OF ' + N + ' — the user wants ' + N + ' DIFFERENT versions to choose from. '
              + 'These builds run in PARALLEL and CANNOT see each other, so commit FULLY to your assigned '
              + 'direction below — do not hedge toward a generic safe version, or every version comes out the same.\n'
              + 'YOUR DIRECTION for this version: ' + direction + '\n'
              + 'Honour everything the prompt states explicitly — exact text, colors, aspect ratio and overall '
              + 'vibe — and apply this direction to everything it leaves open (composition, layout, motion feel, '
              + 'pacing, secondary detail). Variation seed ' + idx + '/' + N + '-' + seed + '.]\n'
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
            // Make THIS version importable + push it to the panel right away so the
            // user can preview it while the other versions keep rendering.
            let vSafe = [];
            try { vSafe = (await Promise.all(imports.map(p => ensurePremiereImportable(p)))).filter(Boolean); }
            catch { vSafe = imports; }
            if (vSafe.length && !batchAborted) {
              try { broadcastVersionReady(reqId, { idx, n: N, imports: vSafe }); } catch {}
              clog('bridge', 'info', 'version ready (streamed)', { idx, n: N, files: vSafe.length }, reqId);
            }
            return { ok: true, reply: vReply, imports: vSafe };
          });
        }

        const results = await runWithConcurrency(thunks, par);
        try { req.off('aborted', onAbortAll); } catch {}

        // Best-effort cleanup of just THIS request's workspaces — never nuke the
        // whole .versions dir, a concurrent /chat may own siblings in there.
        for (const w of wsPaths) { try { fs.rmSync(w, { recursive: true, force: true }); } catch {} }

        if (batchAborted) { chatDone = true; broadcastProgressDone(reqId); clog('bridge', 'info', 'multi-version aborted by user', null, reqId); return; }

        // Each version already ran ensurePremiereImportable() in its thunk (and was
        // streamed to the panel), so just collect those already-safe paths here.
        const safe = [];
        for (const rr of results) { if (rr && rr.ok && Array.isArray(rr.imports)) safe.push(...rr.imports); }

        const made = safe.length;
        clog('bridge', 'info', 'multi-version done', { requested: versionCount, attempted: N, rendered: made }, reqId);
        let reply;
        if (made === 0) {
          reply = "I tried to make those versions but none rendered — give it another go.";
        } else {
          // Two different shortfalls, two different messages:
          //   N < versionCount  → metering actually capped the batch (out of renders)
          //   made < N          → all N were attempted but some failed to render
          // (For the owner N always === versionCount, so the metering note never
          //  fires — a "1 of 2" there is a render failure, not a quota.)
          let note = '';
          if (N < versionCount) {
            note = " (rendered " + made + " of " + versionCount + " — you're out of renders for the rest this month)";
          } else if (made < N) {
            note = " (" + made + " of " + N + " rendered — the rest didn't come through, give it another go)";
          }
          reply = (made === 1 ? "Here's your take" : "Here are " + made + " different takes")
            + " — preview each and import the one you like" + note + ".";
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
        const finalPaths = safePaths.filter(Boolean);
        recordRenders(finalPaths, message, reqId);
        sendOk({ reply, imports: finalPaths });
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
      // /restart = "reload the node process so the new bridge.js takes effect".
      // Skip ONLY the one post-restart launch sync (so the restart doesn't
      // immediately re-pull and revert in-flight edits) via SKIP_STARTUP_UPDATE.
      // Do NOT set CLAUDE_BRIDGE_NO_UPDATE here: it used to permanently disable
      // auto-update AND the ↻ button after every self-restart, leaving the bridge
      // stuck on an old version forever. The 3-min poll resumes normal syncing; a
      // dev who wants zero syncing launches with CLAUDE_BRIDGE_NO_UPDATE=1.
      const childEnv = Object.assign({}, process.env);
      delete childEnv.CLAUDE_BRIDGE_NO_UPDATE;
      childEnv.CLAUDE_BRIDGE_SKIP_STARTUP_UPDATE = '1';
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

  // ── CAPTIONS — word-level animated caption overlay ─────────────────────────
  // Body: { segments:[{path,inSec,outSec,timelineStart}], style, options,
  //         width, height, fps, grouping?, reqId? }. Transcribes the selected
  //         clip's audio word-by-word, groups into lines, renders the styled
  //         transparent Captions overlay, returns [[IMPORT]] + placement.
  // PHASE 1 of the edit flow: transcribe the selection and return editable lines.
  if (req.method === 'POST' && req.url === '/captions/transcribe') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId || crypto.randomUUID();
      const segments = Array.isArray(payload.segments) ? payload.segments : [];
      const grouping = (payload.grouping && typeof payload.grouping === 'object') ? payload.grouping : {};
      const style = payload.style || 'karaoke';
      const log = (m) => { try { clog('captions', 'info', '[transcribe] ' + m, { reqId }, reqId); } catch {} };
      const fail = (msg) => { try { broadcastProgressDone(reqId); } catch {} if (!res.writableEnded) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: msg, reqId })); } };
      const childProcs = new Set(); let aborted = false;
      const onProc = (p) => { if (aborted) { try { p.kill('SIGKILL'); } catch {} return; } childProcs.add(p); p.on('close', () => childProcs.delete(p)); };
      req.on('aborted', () => { aborted = true; for (const p of childProcs) { try { p.kill('SIGKILL'); } catch {} } try { broadcastProgressDone(reqId); } catch {} });
      try {
        if (!segments.length) return fail('No clip selected. Select the clip whose speech you want captioned.');
        if (AUTH_ENABLED) { const s = loadSession(); if (!isOwnerEmail((s && s.user && s.user.email) || '')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, planBlock: true, error: 'Captions are in early access — not available on your account yet.', reqId })); return; } }
        broadcastProgress('Extracting audio', 8, reqId);
        const { wavPath, totalDur } = await extractConcatAudio(segments, reqId, log);
        if (aborted) return;
        broadcastProgress('Transcribing word-by-word', 35, reqId);
        const { words } = await transcribeWords(wavPath, totalDur, onProc);
        if (aborted) return;
        if (!words.length) return fail('No speech found to caption in the selected clip.');
        const lines = groupWordsIntoLines(words, {
          maxWordsPerLine: grouping.maxWordsPerLine || (style === 'reels' || style === 'tiktok' ? 3 : 4),
          maxGapMs: grouping.maxGapMs, maxLineMs: grouping.maxLineMs, maxCharsPerLine: grouping.maxCharsPerLine,
        });
        broadcastProgress('Done', 100, reqId);
        broadcastProgressDone(reqId);
        log(`transcribed ${words.length} words -> ${lines.length} lines`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, reqId, lines, wordCount: words.length, lineCount: lines.length, durationSec: totalDur, timelineStart: Number(segments[0].timelineStart) || 0 }));
      } catch (e) { fail(e && e.message ? e.message : String(e)); }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/captions') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = parseObjBody(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId || crypto.randomUUID();
      const segments = Array.isArray(payload.segments) ? payload.segments : [];
      const editedLines = (Array.isArray(payload.lines) && payload.lines.length) ? payload.lines : null;  // pre-transcribed/edited
      const mode = payload.mode === 'native' ? 'native' : 'animated';
      const STYLES = ['classic', 'karaoke', 'reels', 'tiktok', 'minimal', 'hormozi',
        'fadeup', 'fadedown', 'fadeleft', 'faderight',
        'wordup', 'worddown', 'wordleft', 'wordright'];
      const style = STYLES.includes(payload.style) ? payload.style : 'karaoke';
      const options = (payload.options && typeof payload.options === 'object') ? payload.options : {};
      const grouping = (payload.grouping && typeof payload.grouping === 'object') ? payload.grouping : {};
      const width = payload.width, height = payload.height, fps = payload.fps || 30;
      const log = (m) => { try { clog('captions', 'info', m, { reqId, mode, style }, reqId); } catch {} };
      const fail = (msg, code) => {
        try { clog('captions', 'error', msg, { reqId, mode, style }, reqId); } catch {}
        try { broadcastProgressDone(reqId); } catch {}
        if (!res.writableEnded) {
          res.writeHead(code || 200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: msg, reqId }));
        }
      };
      // Cancellation: track the child processes (parakeet + remotion) so that when
      // the panel aborts the request (Cancel/Esc) we actually kill the work
      // instead of leaving a multi-minute render running orphaned.
      const childProcs = new Set();
      let aborted = false;
      const onProc = (p) => {
        if (aborted) { try { p.kill('SIGKILL'); } catch {} return; }
        childProcs.add(p);
        p.on('close', () => childProcs.delete(p));
      };
      req.on('aborted', () => {
        aborted = true;
        for (const p of childProcs) { try { p.kill('SIGKILL'); } catch {} }
        try { clog('captions', 'warn', 'client aborted — killed ' + childProcs.size + ' procs', { reqId }, reqId); } catch {}
        try { broadcastProgressDone(reqId); } catch {}
      });
      try {
        if (!segments.length && !editedLines) return fail('No clip selected. Select the clip whose speech you want captioned.');

        // Captions are in early access — owner-only for now. Refuse non-owners
        // here too (the panel hides the button, but never trust the client).
        if (AUTH_ENABLED) {
          const sess = loadSession();
          const ownerEmail = (sess && sess.user && sess.user.email) || '';
          if (!isOwnerEmail(ownerEmail)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, planBlock: true, reqId,
              error: 'Captions are in early access — not available on your account yet.' }));
            return;
          }
        }

        // Meter like a render: owner-exempt, fail-open on RPC/config error.
        const gate = await gateRender();
        if (!gate.allowed) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: false, meterBlock: true, reason: gate.reason, reqId,
            error: gate.reason === 'signin'
              ? 'Sign in from the account menu to generate captions.'
              : "You've used all your renders for this month. Upgrade your plan or wait for the monthly reset.",
          }));
          return;
        }

        // Lines: use the panel-provided (edited) ones, else transcribe from audio.
        let lines, totalDur, wordCount;
        const baseTimeline = editedLines ? (Number(payload.timelineStart) || 0) : (Number(segments[0].timelineStart) || 0);
        if (editedLines) {
          lines = editedLines;
          wordCount = lines.reduce((n, l) => n + ((l.words || []).length), 0);
          totalDur = lines.length ? lines[lines.length - 1].endMs / 1000 : 0;
          log(`using ${lines.length} edited lines (${wordCount} words)`);
        } else {
          broadcastProgress('Extracting audio', 6, reqId);
          const ex = await extractConcatAudio(segments, reqId, log);
          totalDur = ex.totalDur;
          if (aborted) return;
          broadcastProgress('Transcribing word-by-word', 22, reqId);
          const tr = await transcribeWords(ex.wavPath, totalDur, onProc);
          if (aborted) return;
          const words = tr.words;
          log(`transcribed ${words.length} words over ${totalDur.toFixed(1)}s`);
          if (!words.length) return fail('No speech found to caption in the selected clip.');
          wordCount = words.length;
          lines = groupWordsIntoLines(words, {
            maxWordsPerLine: grouping.maxWordsPerLine || (style === 'reels' || style === 'tiktok' ? 3 : 4),
            maxGapMs: grouping.maxGapMs, maxLineMs: grouping.maxLineMs, maxCharsPerLine: grouping.maxCharsPerLine,
          });
          log(`grouped into ${lines.length} caption lines`);
        }
        if (options.keywords && mode !== 'native') markKeywords(lines);
        if (options.emoji) applyEmojis(lines);

        // ── NATIVE mode: write an SRT (real editable Premiere captions) ──
        if (mode === 'native') {
          const srt = writeSrt(lines, baseTimeline, options, reqId);
          broadcastProgress('Done', 100, reqId);
          broadcastProgressDone(reqId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true, reqId, native: true, srt,
            lineCount: lines.length, wordCount, timelineStart: baseTimeline,
            durationSec: lines.length ? lines[lines.length - 1].endMs / 1000 : totalDur,
          }));
          return;
        }

        // ── ANIMATED mode: render the styled overlay, split per line ──
        if (aborted) return;
        broadcastProgress('Rendering captions overlay', 45, reqId);
        const outFile = await renderCaptions({ lines, style, options, width, height, fps, reqId, log, onProc });
        if (aborted) { try { fs.unlinkSync(outFile); } catch {} return; }
        log('rendered ' + path.basename(outFile));

        broadcastProgress('Splitting into per-line clips', 82, reqId);
        let clips = [];
        try { clips = await splitCaptionClips(outFile, lines, baseTimeline, reqId, log, fps); } catch (e) { log('split failed: ' + (e && e.message || e)); }
        if (clips.length) { try { fs.unlinkSync(outFile); } catch {} }
        else clips = [{ path: outFile, timelineSec: baseTimeline, durationSec: (lines.length ? lines[lines.length - 1].endMs / 1000 : totalDur), text: '' }];

        broadcastProgress('Done', 100, reqId);
        broadcastProgressDone(reqId);
        const durationSec = lines.length ? lines[lines.length - 1].endMs / 1000 : totalDur;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true, reqId,
          clips,
          import: clips[0].path,
          reply: `Captions ready (${wordCount} words, ${lines.length} lines, ${clips.length} clips, ${style} style).`,
          style, wordCount, lineCount: lines.length, clipCount: clips.length,
          timelineStart: baseTimeline,
          durationSec,
        }));
      } catch (e) {
        fail(e && e.message ? e.message : String(e));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/autocut') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = parseObjBody(body); }
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
      try { payload = parseObjBody(body); }
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

      const myRun = { children: new Set(), aborted: false };
      _activeAutoedit = myRun;
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
          if (_activeAutoedit === myRun) _activeAutoedit = null;
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
          if (myRun.aborted) throw new Error('cancelled');
          const wavPath = await extractAudioForTranscription(clipPath, inP, outP);

          broadcastProgress('Transcribing', 12, reqId);
          if (myRun.aborted) throw new Error('cancelled');
          const transcriptRaw = await runTranscribe(wavPath, totalDur);
          log(`parakeet transcript: ${(transcriptRaw || []).length} sentence segments`);

          if (!transcriptRaw || transcriptRaw.length < 3) {
            broadcastProgressDone(reqId);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Couldn\'t hear much speech in this clip', reqId }));
            if (_activeAutoedit === myRun) _activeAutoedit = null;
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
          if (_activeAutoedit === myRun) _activeAutoedit = null;
          return;
        }

        // ── 3. Ask Claude to identify moments ─────────────────────────────
        broadcastProgress('Finding key moments', 28, reqId);
        if (myRun.aborted) throw new Error('cancelled');
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
          if (_activeAutoedit === myRun) _activeAutoedit = null;
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
        if (_activeAutoedit === myRun) _activeAutoedit = null;
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
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId || crypto.randomUUID();
      const segments = Array.isArray(payload.segments) ? payload.segments : null;
      const density = payload.density || 'moderate';
      const style = payload.style || 'auto';
      const voiceoverOnly = !!payload.voiceoverOnly;   // full-screen graphics, no face to protect
      if (!segments || !segments.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'missing segments', reqId })); return; }
      for (const s of segments) {
        if (!s || !s.path || !fs.existsSync(s.path)) { res.writeHead(404); res.end(JSON.stringify({ error: 'media file not found: ' + ((s && s.path) || '?'), reqId })); return; }
      }
      const myRun = { children: new Set(), aborted: false };
      _activeAutoedit = myRun;
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId); };
      try {
        const spanStart = (payload.span && typeof payload.span.start === 'number') ? payload.span.start : Math.min(...segments.map(s => Number(s.timelineStart) || 0));
        let spanEnd = (payload.span && typeof payload.span.end === 'number') ? payload.span.end : null;
        log(`AUTO EDIT analyze reqId=${reqId} segs=${segments.length} density=${density}`);

        broadcastProgress('Extracting audio', 6, reqId);
        if (myRun.aborted) throw new Error('cancelled');
        const { wavPath, totalDur, timeMap } = await extractConcatAudio(segments, reqId, log);
        if (spanEnd == null) spanEnd = spanStart + totalDur;
        if (totalDur < 5) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: 'Selection is too short (need at least ~5s of audio)', reqId })); if (_activeAutoedit === myRun) _activeAutoedit = null; return; }

        broadcastProgress('Transcribing', 16, reqId);
        if (myRun.aborted) throw new Error('cancelled');
        const transcriptRaw = await runTranscribe(wavPath, totalDur);
        log(`parakeet: ${(transcriptRaw || []).length} segments`);
        if (!transcriptRaw || transcriptRaw.length < 3) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: "Couldn't hear much speech in the selection", reqId })); if (_activeAutoedit === myRun) _activeAutoedit = null; return; }

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
        if (sentences.length < 3) { broadcastProgressDone(reqId); res.writeHead(400); res.end(JSON.stringify({ error: 'Not enough speech in the selection', reqId })); if (_activeAutoedit === myRun) _activeAutoedit = null; return; }

        broadcastProgress('Reading the speech', 24, reqId);
        if (myRun.aborted) throw new Error('cancelled');
        const questions = await detectInterviewQuestions(sentences, density, log);

        // Suggested lines for the transcript picker. The USER makes the final
        // call — these are just pre-ticked so a long video isn't a blank slate.
        // Non-fatal: if the suggestion pass fails, the picker opens with nothing
        // ticked and the user picks from scratch.
        let suggested = [];
        try {
          broadcastProgress('Suggesting moments', 30, reqId);
          const sugg = await detectMoments(sentences, density, style, reqId, log, '');
          suggested = (sugg || []).map((m) => {
            // moments carry timeline seconds — map each back to its sentence
            let best = -1, bestD = Infinity;
            for (const s of sentences) {
              const d = Math.abs(s.startSec - m.startSec);
              if (d < bestD) { bestD = d; best = s.i; }
            }
            return best;
          }).filter((i) => i >= 0);
          suggested = [...new Set(suggested)].sort((a, b) => a - b);
          log(`suggested ${suggested.length} lines: ${JSON.stringify(suggested)}`);
        } catch (e) { log('suggestion pass failed (picker opens unticked): ' + e.message); }

        // Face-avoidance: grab start/mid/end frames so the generator can place graphics
        // away from the speaker's face. Skipped for voiceover-only (full-screen) mode.
        let faceFrames = [];
        if (!voiceoverOnly) {
          try { faceFrames = await extractFaceFrames(segments[0], reqId, log); } catch (e) { log('face frames failed: ' + e.message); }
        }
        _aeCacheSet(reqId, { sentences, span: { start: spanStart, end: spanEnd }, density, style, voiceoverOnly, faceFrames });
        log(`analyze done: ${sentences.length} sentences, ${questions.length} questions, voiceoverOnly=${voiceoverOnly}, frames=${faceFrames.length}`);

        broadcastProgressDone(reqId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true, reqId, questions, sentenceCount: sentences.length, durationSec: (spanEnd - spanStart),
          // The transcript itself + suggested picks, so the panel can show the
          // line picker and the user chooses which sentences get a graphic.
          sentences: sentences.map(s => ({ i: s.i, startSec: s.startSec, endSec: s.endSec, text: s.text })),
          suggested,
        }));
      } catch (e) {
        log(`analyze ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      } finally { if (_activeAutoedit === myRun) _activeAutoedit = null; }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/autoedit/run') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId;
      const answers = (payload.answers && typeof payload.answers === 'object') ? payload.answers : {};
      const cached = reqId && _autoeditCache.get(reqId);
      if (!cached) { res.writeHead(400); res.end(JSON.stringify({ error: 'Auto-Edit session expired — run analyze again', reqId })); return; }
      const myRun = { children: new Set(), aborted: false };
      _activeAutoedit = myRun;
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId); };
      try {
        const { sentences, span } = cached;
        const voiceoverOnly = !!cached.voiceoverOnly;
        const faceFrames = Array.isArray(cached.faceFrames) ? cached.faceFrames : [];
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

        // Render a finished plan and answer the request. Shared by both paths
        // (user-picked lines and the automatic planner) so they render, cache
        // and report identically.
        const _aeGenerateAndRespond = async (plan, planReport) => {
          broadcastProgress('Generating motion graphics', 42, reqId);
          const userExtra = String(answers.custom || '').trim().slice(0, 600);
          // Reference images the user pasted into the "Anything else?" box — Claude
          // reads them and mirrors their style. Keep only existing files.
          const refImages = (Array.isArray(payload.refImages) ? payload.refImages : [])
            .filter(p => typeof p === 'string' && p && (() => { try { return fs.existsSync(p); } catch { return false; } })())
            .slice(0, 6);
          const aeEngine = (payload.engine === 'hyperframes') ? 'hyperframes' : 'remotion';
          const AE_ALLOWED = ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-fable-5'];
          const aeModel = AE_ALLOWED.includes(payload && payload.model) ? payload.model : null;
          const genOpts = { styleMode, styleSpec, width: vidW, height: vidH, voiceoverOnly, faceFrames, userExtra, refImages, engine: aeEngine, model: aeModel };
          // Persist the final plan + render options so a SINGLE graphic can be
          // re-rendered later (the per-graphic "Change" feature) without re-running
          // analyze. Keyed by reqId; merges over the analyze-time cache entry.
          try { _aeCacheSet(reqId, Object.assign({}, cached, { plan, genOpts })); } catch {}
          const renderResults = await generateMomentsParallel(plan, reqId, log, (done, total) => {
            broadcastProgress(`Generating motion graphics (${done}/${total})`, 42 + Math.floor((done / total) * 48), reqId);
          }, genOpts);

          const applied = renderResults.filter(r => r && r.ok).map(r => ({ ...r, timelineSec: r.atSec }));
          const skipped = renderResults.filter(r => r && !r.ok);
          log(`render done ok=${applied.length} skipped=${skipped.length}`);

          broadcastProgressDone(reqId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true, reqId, applied, skipped, planReport,
            summary: `${applied.length}/${plan.length} graphics ready` + (skipped.length ? ` (${skipped.length} skipped)` : ''),
            logFile: logPath,
          }));
        };

        // ── Plan ──────────────────────────────────────────────────────────
        // If the user ticked lines in the transcript picker, THOSE are the plan.
        // We only ask what each should look like — no auto-detection, no spacing
        // filter, no fit-check, because every one of those can drop a pick and
        // the user's choice is final. Falls back to the automatic planner when
        // no picks were sent (older panel, or the picker was skipped).
        const picks = Array.isArray(payload.picks)
          ? [...new Set(payload.picks.map(Number).filter(n => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b)
          : null;
        if (picks && picks.length) {
          broadcastProgress('Reading your picked lines', 30, reqId);
          if (myRun.aborted) throw new Error('cancelled');
          const picked = await labelPickedLines(sentences, picks, log);
          log(`user picks: ${picks.length} -> ${picked.length} moments (user-chosen, unfiltered)`);
          if (!picked.length) {
            broadcastProgressDone(reqId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, reqId, applied: [], skipped: [], summary: 'None of the picked lines could be used.' }));
            if (_activeAutoedit === myRun) _activeAutoedit = null;
            return;
          }
          return await _aeGenerateAndRespond(picked, `${picked.length} line${picked.length !== 1 ? 's' : ''} you picked`);
        }

        broadcastProgress('Planning the edit', 30, reqId);
        if (myRun.aborted) throw new Error('cancelled');
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
        if (myRun.aborted) throw new Error('cancelled');
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
          if (_activeAutoedit === myRun) _activeAutoedit = null;
          return;
        }

        return await _aeGenerateAndRespond(plan, verified.report);
      } catch (e) {
        log(`run ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId, logFile: logPath })); } catch {}
      } finally { if (_activeAutoedit === myRun) _activeAutoedit = null; }
    });
    return;
  }

  // ── AUTO-EDIT: re-render ONE graphic with a user change ───────────────────
  // Body: { reqId, idx, change }. idx is the plan index of the graphic the user
  // picked. Re-renders just that moment with the change applied, reusing the
  // run's locked style + resolution, and returns the new file so the panel can
  // swap it on the timeline in place. Needs the run's plan+genOpts in the cache
  // (persisted by /autoedit/run) — i.e. the same session, within the cache TTL.
  if (req.method === 'POST' && req.url === '/autoedit/rerender') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let payload;
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const reqId = payload.reqId;
      const idx = Number(payload.idx);
      const change = String(payload.change || '').trim();
      const cached = reqId && _autoeditCache.get(reqId);
      if (!cached) { res.writeHead(400); res.end(JSON.stringify({ error: 'Auto-Edit session expired — run Auto-Edit again to change graphics', reqId })); return; }
      if (!cached.plan || !cached.genOpts) { res.writeHead(400); res.end(JSON.stringify({ error: 'Nothing to change yet — generate the graphics first', reqId })); return; }
      if (!Number.isInteger(idx) || idx < 0 || idx >= cached.plan.length) { res.writeHead(400); res.end(JSON.stringify({ error: 'That graphic is no longer available', reqId })); return; }
      if (!change) { res.writeHead(400); res.end(JSON.stringify({ error: 'No change described', reqId })); return; }
      const myRun = { children: new Set(), aborted: false };
      _activeAutoedit = myRun;
      const logPath = path.join(OUTPUT_DIR, `autoedit-${reqId}.log`);
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} clog('autoedit', /error|fail|timeout/i.test(String(s)) ? 'error' : 'info', String(s), null, reqId); };
      try {
        const moment = cached.plan[idx];
        log(`AUTO EDIT rerender reqId=${reqId} idx=${idx} change="${change.slice(0, 120)}"`);
        broadcastProgress('Re-rendering graphic ' + (idx + 1), 20, reqId);
        const genOpts = Object.assign({}, cached.genOpts, { changeDirective: change });
        const results = await generateMomentsParallel([moment], reqId, log, (done, total) => {
          broadcastProgress('Re-rendering graphic ' + (idx + 1), 20 + Math.floor((done / total) * 70), reqId);
        }, genOpts);
        const r = results && results[0];
        broadcastProgressDone(reqId);
        if (!r || !r.ok) {
          const reason = (r && r.reason) || 'render failed';
          log(`rerender FAILED idx=${idx} reason=${reason}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, reqId, idx, error: reason }));
          return;
        }
        log(`rerender ok idx=${idx} -> ${r.file}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true, reqId, idx,
          file: r.file, atSec: r.atSec, timelineSec: r.atSec,
          durationSec: r.durationSec, type: r.type, label: r.label || '',
        }));
      } catch (e) {
        log(`rerender ERROR ${e.message}`);
        broadcastProgressDone(reqId);
        try { res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e), reqId })); } catch {}
      } finally { if (_activeAutoedit === myRun) _activeAutoedit = null; }
    });
    return;
  }

  // ── Delete a rendered file from disk (panel "Delete" buttons) ─────────────
  // Safety: media files only, only inside the output dir (or any */output/
  // render folder under the user's home), never a directory, never a path with
  // ".." traversal. Idempotent — deleting an already-gone file returns ok.
  if (req.method === 'POST' && req.url === '/delete-file') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let payload;
      try { payload = parseObjBody(body); } catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }
      const raw = String(payload.path || '');
      try {
        if (!raw || raw.indexOf('..') !== -1) { res.writeHead(400); res.end(JSON.stringify({ error: 'bad path' })); return; }
        const resolved = path.resolve(raw);
        const MEDIA = /\.(mp4|mov|m4v|avi|mkv|mxf|mts|webm|png|jpe?g|tiff?|gif|webp|wav|mp3|aac|m4a)$/i;
        const home = os.homedir();
        const inOutput = resolved === OUTPUT_DIR || resolved.startsWith(OUTPUT_DIR + path.sep);
        const inProjectOutput = resolved.startsWith(home + path.sep) && /[/\\]output[/\\]/i.test(resolved);
        // Project-colocated renders land in a PROJECT_RENDER_DIRNAME folder next
        // to the open .prproj (see /chat renderOutputDir) — which can sit on ANY
        // volume, incl. external drives, so we can't require it under $HOME. The
        // bridge-owned folder name + the media-extension gate below are the
        // safety boundary: we only delete media that sits directly in that folder.
        const inProjectRender = path.basename(path.dirname(resolved)) === PROJECT_RENDER_DIRNAME;
        // Log every refusal — silent 403s here previously made "delete didn't
        // work" undiagnosable (the log only recorded successes).
        const refuse = (why) => {
          clog('bridge', 'warn', 'delete-file refused', { path: resolved, why });
          res.writeHead(403); res.end(JSON.stringify({ error: why }));
        };
        if (!MEDIA.test(resolved)) { refuse('not a media file'); return; }
        if (!(inOutput || inProjectOutput || inProjectRender)) { refuse('file is outside the render output folder'); return; }
        if (!fs.existsSync(resolved)) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, alreadyGone: true })); return; }
        if (!fs.statSync(resolved).isFile()) { refuse('not a file'); return; }
        fs.unlinkSync(resolved);
        clog('bridge', 'info', 'deleted render file', { path: resolved });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, deleted: resolved }));
      } catch (e) {
        clog('bridge', 'error', 'delete-file errored', { path: raw, error: e.message || String(e) });
        res.writeHead(500); res.end(JSON.stringify({ error: e.message || String(e) }));
      }
    });
    return;
  }

  res.writeHead(404); res.end();
});

// ── Official Remotion AI skills sync (remotion.dev/docs/ai/skills) ─────────
// SYSTEM_PROMPT points claude at ~/.claude/skills/remotion-best-practices/.
// This syncs that skill from the OFFICIAL remotion-dev/skills repo — the same
// source `npx skills add remotion-dev/skills` pulls — so fresh installs HAVE
// the skill (the installers never set it up) and existing ones track
// Remotion's best-practice updates.
//
// 3-way merge via a hash manifest (.official-sync.json):
//   • official file missing locally        → install it
//   • local file == what we last installed → refresh to new official version
//   • local file edited by hand            → NEVER touched (our sfx.md import
//     fix, custom rules like charts.md / motion-design.md stay intact)
const BP_SKILL_DIR = path.join(os.homedir(), '.claude', 'skills', 'remotion-best-practices');
const BP_MANIFEST = path.join(BP_SKILL_DIR, '.official-sync.json');
const BP_SYNC_MAX_AGE = 7 * 24 * 3600 * 1000;          // re-check weekly

async function ensureRemotionSkills() {
  try {
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(BP_MANIFEST, 'utf8')); } catch {}
    if (manifest._t && Date.now() - manifest._t < BP_SYNC_MAX_AGE) return;   // fresh enough
    if (typeof fetch !== 'function') return;            // Node <18 — skip quietly
    const sha = (buf) => require('crypto').createHash('sha256').update(buf).digest('hex');

    const resp = await fetch('https://codeload.github.com/remotion-dev/skills/tar.gz/refs/heads/main');
    if (!resp.ok) throw new Error('download HTTP ' + resp.status);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'remotion-skills-'));
    const tarball = path.join(tmp, 'skills.tgz');
    fs.writeFileSync(tarball, Buffer.from(await resp.arrayBuffer()));
    await new Promise((resolve, reject) => {
      // bsdtar ships with macOS and Windows 10 1803+ — no extra deps.
      const p = spawn('tar', ['-xzf', tarball, '-C', tmp]);
      p.on('error', reject);
      p.on('close', (c) => (c === 0 ? resolve() : reject(new Error('tar exit ' + c))));
    });
    const src = path.join(tmp, 'skills-main', 'skills', 'remotion');
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) throw new Error('unexpected tarball layout');

    // Collect official files (SKILL.md + rules/** incl. assets), then merge.
    const files = ['SKILL.md'];
    const walk = (rel) => {
      for (const ent of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
        const r = rel + '/' + ent.name;
        if (ent.isDirectory()) walk(r); else files.push(r);
      }
    };
    walk('rules');
    let added = 0, updated = 0, keptLocal = 0;
    for (const rel of files) {
      const offBuf = fs.readFileSync(path.join(src, rel));
      const offSha = sha(offBuf);
      const dest = path.join(BP_SKILL_DIR, rel);
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, offBuf); manifest[rel] = offSha; added++;
      } else {
        const localSha = sha(fs.readFileSync(dest));
        if (localSha === offSha) { manifest[rel] = offSha; }            // already in sync — track it
        else if (manifest[rel] === localSha) {                          // ours, unedited → safe refresh
          fs.writeFileSync(dest, offBuf); manifest[rel] = offSha; updated++;
        } else keptLocal++;                                             // hand-edited → preserve
      }
    }
    manifest._t = Date.now();
    fs.writeFileSync(BP_MANIFEST, JSON.stringify(manifest));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    clog('bridge', 'info', 'remotion skills synced from remotion-dev/skills', { added, updated, keptLocal });
  } catch (e) {
    // Non-fatal — renders still work, just without the freshest guidance.
    clog('bridge', 'warn', 'remotion skills sync failed (retries next launch)', { error: e.message || String(e) });
  }
}

// ── Remotion creative-package ensure (one-time per missing package) ────────
// The SYSTEM_PROMPT teaches claude to import @remotion/transitions, shapes,
// paths, noise, layout-utils (fitText), effects, etc. Fresh installs get them
// via bridge/remotion-template/package.json; EXISTING installs get them here:
// at launch, install any missing toolkit packages pinned to the project's own
// remotion version (all @remotion/* must be version-aligned). Runs detached
// and immediately at launch — never mid-render.
const REMOTION_TOOLKIT_PACKAGES = [
  '@remotion/transitions', '@remotion/shapes', '@remotion/paths',
  '@remotion/noise', '@remotion/motion-blur', '@remotion/layout-utils',
  '@remotion/animation-utils', '@remotion/gif', '@remotion/lottie',
  '@remotion/captions', '@remotion/animated-emoji', '@remotion/light-leaks',
  '@remotion/fonts', '@remotion/sfx', '@remotion/effects',
];
// The HyperFrames engine (HeyGen's HTML/CSS/GSAP → video CLI). Installed
// alongside Remotion so the engine toggle's "HyperFrames" mode works. NOT
// version-pinned to remotion — it's an independent package.
const HYPERFRAMES_PACKAGE = 'hyperframes';
const HYPERFRAMES_VERSION = '0.7.64';

// Ensure the hyperframes CLI is installed in the remotion-intro project and its
// telemetry is off. One-time, non-blocking, runs at launch.
function ensureHyperframes() {
  try {
    const proj = path.join(WORK_DIR, 'remotion-intro');
    const pjPath = path.join(proj, 'package.json');
    if (!fs.existsSync(pjPath)) return;
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    const deps = Object.assign({}, pj.dependencies, pj.devDependencies);
    try { fs.mkdirSync(path.join(proj, '.hf'), { recursive: true }); } catch {}
    if (deps[HYPERFRAMES_PACKAGE]) return;                // already present
    clog('bridge', 'info', 'installing hyperframes engine', { version: HYPERFRAMES_VERSION });
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const proc = spawn(npmBin, ['install', '--save', '--no-audit', '--no-fund', HYPERFRAMES_PACKAGE + '@' + HYPERFRAMES_VERSION],
      { cwd: proj, stdio: 'ignore', shell: process.platform === 'win32' });
    proc.on('close', (c) => {
      clog('bridge', c === 0 ? 'info' : 'warn', 'hyperframes install ' + (c === 0 ? 'done' : 'failed (exit ' + c + ')'));
      if (c === 0) {
        // Opt out of anonymous telemetry on the user's behalf.
        try {
          const tp = spawn(npmBin === 'npm.cmd' ? 'npx.cmd' : 'npx', ['hyperframes', 'telemetry', 'disable'],
            { cwd: proj, stdio: 'ignore', shell: process.platform === 'win32' });
          tp.on('error', () => {});
        } catch {}
      }
    });
    proc.on('error', (e) => clog('bridge', 'warn', 'hyperframes install error', { error: e.message }));
  } catch (e) {
    clog('bridge', 'warn', 'ensureHyperframes failed', { error: e.message || String(e) });
  }
}
function ensureRemotionPackages() {
  try {
    const proj = path.join(WORK_DIR, 'remotion-intro');
    const pjPath = path.join(proj, 'package.json');
    if (!fs.existsSync(pjPath)) return;                  // project not scaffolded yet
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    const deps = Object.assign({}, pj.dependencies, pj.devDependencies);
    const missing = REMOTION_TOOLKIT_PACKAGES.filter(p => !deps[p]);
    if (!missing.length) return;
    let ver = '';
    try { ver = JSON.parse(fs.readFileSync(path.join(proj, 'node_modules', 'remotion', 'package.json'), 'utf8')).version; } catch {}
    const specs = missing.map(p => p + (ver ? '@' + ver : ''));
    clog('bridge', 'info', 'installing missing remotion toolkit packages', { missing, pinnedTo: ver || 'latest' });
    const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const proc = spawn(npmBin, ['install', '--save', '--no-audit', '--no-fund', ...specs],
      { cwd: proj, stdio: 'ignore', shell: process.platform === 'win32' });
    proc.on('close', (c) => clog('bridge', c === 0 ? 'info' : 'warn',
      'remotion toolkit install ' + (c === 0 ? 'done' : 'failed (exit ' + c + ')'), { count: missing.length }));
    proc.on('error', (e) => clog('bridge', 'warn', 'remotion toolkit install error', { error: e.message }));
  } catch (e) {
    clog('bridge', 'warn', 'ensureRemotionPackages failed', { error: e.message || String(e) });
  }
}

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
        try {
          fs.renameSync(tmp, target.dest);
        } catch (renameErr) {
          // Windows: rename can fail (EPERM/EEXIST/EACCES) when the destination
          // is momentarily locked. Fall back to an in-place overwrite so the
          // update still lands, then clean up the temp file.
          try { fs.writeFileSync(target.dest, remote); } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
        }
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
      const payload = body ? parseObjBody(body) : {};
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
    // Skip the launch sync once if we were just restarted via /restart (avoids an
    // immediate revert of in-flight edits). ONE-TIME: clear the flag now so it
    // can't persist into a later non-/restart respawn (which would skip the launch
    // sync forever). The 3-min poll + manual ↻ are unaffected either way.
    if (process.env.CLAUDE_BRIDGE_SKIP_STARTUP_UPDATE === '1') {
      delete process.env.CLAUDE_BRIDGE_SKIP_STARTUP_UPDATE;
    } else {
      checkForUpdates()
        .then((r) => _applyUpdateResult(r, 'launch update'))
        .catch(e => { clog('bridge', 'error', 'update check threw', { error: e.message }); console.error('Update check error:', e.message); });
    }

    // Sync the official Remotion AI skill (remotion.dev/docs/ai/skills) —
    // non-blocking, weekly cadence, see ensureRemotionSkills().
    ensureRemotionSkills();
    // Install any missing @remotion toolkit packages (one-time, non-blocking).
    ensureRemotionPackages();
    // Install the HyperFrames engine if missing (one-time, non-blocking).
    ensureHyperframes();

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

