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
    const proc = spawn('claude', args, {
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

// ═══════════════════════════════════════════════════════════════════════
//  AUTO EDIT — pipeline helpers
// ═══════════════════════════════════════════════════════════════════════

// Send sentence-level transcript to Claude and ask for a JSON list of
// "moments" — points in the video that deserve a motion graphic. Returns
// an array of Moment objects (see schema above the /autoedit endpoint).
function detectMoments(sentences, density, styleOverride, reqId, log) {
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
    ].join('\n');

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
// templates) and renders it to a transparent .mov overlay. 4 run in
// parallel; a moment that fails gets ONE retry, then is skipped. Returns the
// same shape renderMomentsParallel did so the /autoedit endpoint is unchanged.
function generateMomentsParallel(moments, reqId, log, onProgress) {
  const MAX_INFLIGHT = 4;
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
      '  For TEXT-DRIVEN overlays (titles, captions, callouts, stats), the',
      '  presets here are battle-tested drop-ins — copy the component you',
      '  want, then customize:',
      '    ~/.claude/skills/remotion-text-presets/references/text-presets-catalog.md',
      '      (Tilted Slam, Word Pop Caption, Letter Cascade, Typewriter Pro,',
      '      Marker Underline, Counter Count-Up — pass `bg="transparent"` for',
      '      overlays so the ProRes 4444 alpha survives.)',
      '- DO use the style library at ' + WORK_DIR + '/remotion-intro/src/lib/',
      '  for easings, palettes, typography and motion helpers — read the files',
      '  you need first to get exact export names.',
      '- 1920x1080, 30fps, EXACTLY ' + task.durationFrames + ' frames.',
      '- TRANSPARENT background — this is CRITICAL. The composition root must',
      '  have NO opaque background (no solid-color AbsoluteFill behind it).',
      '  Render with EXACTLY this codec config so the alpha channel survives:',
      '      --codec prores --prores-profile 4444 --audio-codec=no-audio',
      '  ProRes 422 (the default) has NO alpha and will black out the video.',
      '  You MUST pass --prores-profile 4444. The --audio-codec=no-audio',
      '  flag is REQUIRED — without it Remotion adds a silent stereo track',
      '  and Premiere shows an empty waveform on the source. After',
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
      const proc = spawn('claude', args, {
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

  remotion-text-presets/          11 production-tested text animation
                                  presets: Tilted Slam, Word Pop Caption,
                                  Letter Cascade, Typewriter Pro, Marker
                                  Underline, Counter Count-Up, Glitch Text,
                                  Neon Glow, 3D Extrude, Stamp Impact,
                                  Karaoke Lyric. Triggers: "title slam",
                                  "tilted text", "TikTok caption", "kinetic
                                  text", "letter by letter", "typewriter",
                                  "marker underline", "counter", "count-up",
                                  "glitch text", "neon sign", "3D text",
                                  "stamp", "karaoke / lyric video". Catalog:
                                  references/text-presets-catalog.md.

  remotion-lower-thirds/          5 lower-third / name-card presets:
                                  NewsBroadcast (CNN-red), MinimalBauhaus
                                  (thin line), RetroVhs (RGB-split mono),
                                  EditorialItalic (magazine serif),
                                  GlitchLowerThird (damaged feed). Triggers:
                                  "lower third", "name card", "chyron",
                                  "speaker tag", "introduce X", "name +
                                  role". Catalog: references/lower-thirds-
                                  catalog.md.

  remotion-callouts/              5 emphasis / callout components:
                                  HandDrawnArrow, HighlightCircle,
                                  PullQuote, SpeechBubble, QuestionCard.
                                  Triggers: "arrow pointing", "circle this",
                                  "highlight", "pull quote", "speech
                                  bubble", "question card", "callout".
                                  Catalog: references/callouts-catalog.md.

  remotion-backgrounds/           4 animated full-frame backdrops:
                                  AnimatedGradient (mesh drift),
                                  ParticleField, NoiseGrain (TV static),
                                  WavyLines (parallax sine). Triggers:
                                  "animated background", "gradient bg",
                                  "particle field", "noise / grain",
                                  "film texture", "wavy lines". Catalog:
                                  references/backgrounds-catalog.md.

  remotion-stats/                 4 animated data-reveal components:
                                  BarChartRace, ProgressRing,
                                  ComparisonBars, StatCardGrid. Triggers:
                                  "bar chart", "chart race", "progress
                                  ring", "X percent", "before vs after",
                                  "comparison", "stat tiles / dashboard",
                                  "metric reveal", "animated chart".
                                  Catalog: references/stats-catalog.md.

  remotion-stingers/              4 brand-moment stingers: BrandReveal
                                  (mask-wipe logotype), EndCard (Like &
                                  Subscribe outro), ChapterBumper ("PART
                                  02" cinematic title), SponsorPlate
                                  ("BROUGHT TO YOU BY"). Triggers: "brand
                                  reveal", "logo intro", "end card",
                                  "outro", "chapter title", "part 2
                                  bumper", "sponsor plate". Catalog:
                                  references/stingers-catalog.md.

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
  ad with a voiceover track), pass \`--audio-codec=no-audio\` to every
  render. Without it, Remotion writes a silent stereo track to the output
  and the user sees an empty L/R waveform on the Premiere source monitor
  — looks broken even though nothing's wrong. Skip the audio track
  entirely when there's nothing to play.

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
- Render with: \`cd ${WORK_DIR}/remotion-intro && npx remotion render src/index.ts <CompositionId> "<OUTPUT_DIR>/<filename>.mp4" --codec=h264 --audio-codec=no-audio\` — the no-audio flag is REQUIRED unless the composition actually has <Audio> elements. <OUTPUT_DIR> = the "Output dir for any rendered files" path from the [PREMIERE CONTEXT] block at the top of the user's message (NOT the global default). If no context is provided fall back to ${OUTPUT_DIR}. Quote the path because it may contain spaces (e.g. "Vera Vid 13/Claude Animations/...").
- Do NOT scaffold a new Remotion project; do NOT run \`npx create-video\`. Reuse the existing one.
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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
    res.end(JSON.stringify({ ok: true, session: SESSION_ID, outputDir: OUTPUT_DIR }));
    return;
  }

  // Panel auto-reload — returns the mtime of the panel's index.html. The
  // panel polls this every 5s; if mtime changes, the panel reloads itself.
  // Single-shot fetch, no persistent connection — safe replacement for the
  // dev SSE we ripped out in v3.3.
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
      const proc = spawn('claude', args, {
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
      const proc = spawn('claude', args, {
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
      // VARIATION DIRECTIVE — solves the "same prompt 3 times produces
      // the same Helvetica + same easing + same palette" problem. Each
      // request gets a random combination of (palette, font family,
      // motion style, layout) so claude doesn't converge to its defaults.
      // ──────────────────────────────────────────────────────────────────
      const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const VARIATION_PALETTE = _pick([
        'neon-cyber (electric blue, hot pink, neon green on near-black)',
        'retro-warm (sunset orange, cream, deep burgundy)',
        'brutalist-mono (pure black + pure white + ONE accent color of your choice)',
        'soft-pastel (mint, coral, lavender on off-white)',
        'club-strobe (saturated magenta + electric cyan on charcoal)',
        'editorial (paper-cream + ink-black + a single muted accent)',
        'forest-deep (deep teal, moss green, warm gold)',
        'bauhaus (primary red, primary blue, primary yellow on black)',
        'cyberpunk (acid yellow, hot magenta, electric blue on black)',
        'minimalist-sand (sand beige, soft black, single warm accent)',
        'y2k-chrome (chrome silver + holographic pinks/blues + black)',
        'monochrome-warm (varied warm greys with one pop color)',
      ]);
      const VARIATION_FONT = _pick([
        'Helvetica Neue (clean, modern, neutral)',
        'Inter or system-ui (geometric, readable)',
        'Playfair Display (high-contrast serif, editorial)',
        'JetBrains Mono or Menlo (monospace, technical)',
        'Bebas Neue or condensed sans (tall, athletic, punchy)',
        'Cormorant Garamond (elegant serif, classic)',
        'Space Mono (mono with a tech / web3 vibe)',
        'Georgia (warm serif, magazine feel)',
        'a heavy 900-weight grotesque (Inter Black, Helvetica Black) — bold display',
        'a thin/light weight (Helvetica Light, Inter Thin) — quiet sophistication',
      ]);
      const VARIATION_MOTION = _pick([
        'snap cuts and hard frame-jumps (no smooth interpolation)',
        'smooth spring physics (damping ~12, stiffness ~140 — feels alive)',
        'aggressive overshoot springs (damping 8, stiffness 220 — bouncy)',
        'cubic ease-in-out (cinematic, contemplative)',
        'micro-bounce on every element (1.05 → 1.0 punch)',
        'staggered cascade where pieces enter at different times (50ms apart)',
        'glitch jitter for the first 8-12 frames before settling',
        'slow drift / float / breathe (subtle continuous motion)',
        'whip-fast in (under 6 frames) then long hold',
      ]);
      const VARIATION_LAYOUT = _pick([
        'center-aligned, vertically symmetric (classic balance)',
        'asymmetric — push the focal element off-center to the rule-of-thirds intersection',
        'top-anchored with the focal element near the top third',
        'bottom-anchored (good for talking-head overlays)',
        'edge-aligned, hugging one side of the frame',
        'diagonal composition — orient elements along an implied diagonal line',
        'extreme negative space — small element on a mostly-empty frame',
      ]);
      const _seed = Math.random().toString(36).slice(2, 8);
      fullMessage =
        '[VARIATION DIRECTIVE — seed ' + _seed + ', expires this render only]\n' +
        'Make this run visually DISTINCT. Even if the user has run a similar prompt\n' +
        'before, use the following constraints to push the design away from your\n' +
        'defaults. These are non-negotiable creative anchors:\n\n' +
        '  · PALETTE — ' + VARIATION_PALETTE + '\n' +
        '  · TYPOGRAPHY — ' + VARIATION_FONT + '\n' +
        '  · MOTION — ' + VARIATION_MOTION + '\n' +
        '  · LAYOUT — ' + VARIATION_LAYOUT + '\n\n' +
        'Pick a fresh composition name (do NOT reuse one that already exists in\n' +
        'Root.tsx). Write a fresh component from scratch — do not import an old\n' +
        'one and just tweak props.\n\n' +
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
      if (renderMode === 'fast') {
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__[\s\S]*?__SELF_CRITIQUE_END__\n?/g, '');
      } else {
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__\n?/g, '')
          .replace(/__SELF_CRITIQUE_END__\n?/g, '');
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
          'Keep the self-critique pass (one fix-and-re-render is fine).',
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
      resolvedSystemPrompt = (MODE_HEADERS[renderMode] || '') + resolvedSystemPrompt;
      console.log('  [chat] render mode: ' + renderMode);

      const args = [
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--append-system-prompt', resolvedSystemPrompt,
        '--no-session-persistence',
      ];
      args.push(fullMessage);

      console.log('\n> ' + message.slice(0, 80));
      broadcastProgress('Thinking', null, reqId);

      // Run claude once. Returns { ok, reply, error, idleKilled }. The caller
      // can retry if idleKilled=true and reply is empty.
      function runClaudeOnce(retry) {
        return new Promise(resolve => {
          // stdin 'ignore' — without it the claude CLI emits a benign stderr
          // warning ("Warning: no stdin data received in 3s") that the panel
          // surfaces as an error mid-animation. This is the main /chat path,
          // so it was the most visible offender.
          const proc = spawn('claude', args, {
            cwd: WORK_DIR, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
          });
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
          req.once('aborted', onAbort);

          // Filter out the benign "no stdin data received in 3s" warning — it
          // is harmless (claude proceeds anyway) but if it ever leaks through
          // it surfaces in the panel as an "Error:" alarm. Belt-and-braces
          // alongside stdio:['ignore',...].
          proc.stderr.on('data', d => {
            const s = d.toString();
            if (/no stdin data received in \d+s/i.test(s)) return;
            stderr += s;
          });
          // Track BOTH byte-level activity AND status-text changes so a
          // hung tool_use that just dribbles heartbeats can still be killed.
          let lastStatus = '';
          let lastStatusChangedAt = Date.now();
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
              if (status) {
                broadcastProgress(status, null, reqId);
                if (status !== lastStatus) {
                  lastStatus = status;
                  lastStatusChangedAt = Date.now();
                }
              }
              if (evt.type === 'result' && typeof evt.result === 'string') finalReply = evt.result;
              if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
                for (const blk of evt.message.content) {
                  if (blk.type === 'text' && typeof blk.text === 'string') finalReply = blk.text;
                }
              }
            }
          });

          // Idle watchdog — tightened from 3min → 90s. ALSO kills if the
          // SAME status text has been broadcasting for 90s (catches hung
          // tool_use that keeps dribbling identical heartbeats).
          const IDLE_TIMEOUT_MS = 90 * 1000;
          const STATUS_STUCK_MS = 90 * 1000;
          const idleCheck = setInterval(() => {
            if (resolved) { clearInterval(idleCheck); return; }
            const idle = Date.now() - lastActivity;
            const stuck = Date.now() - lastStatusChangedAt;
            if (idle > IDLE_TIMEOUT_MS) {
              console.log('  [chat] idle ' + Math.round(idle/1000) + 's' + (retry ? ' (retry)' : '') + ' — killing claude');
              idleKilled = true;
              try { proc.kill('SIGKILL'); } catch {}
            } else if (stuck > STATUS_STUCK_MS && lastStatus) {
              console.log('  [chat] status stuck on "' + lastStatus + '" for ' + Math.round(stuck/1000) + 's — killing claude');
              idleKilled = true;
              try { proc.kill('SIGKILL'); } catch {}
            }
          }, 10000);

          // Hard timeout
          const HARD_TIMEOUT_MS = 10 * 60 * 1000;
          const hardKiller = setTimeout(() => {
            if (resolved) return;
            console.log('  [chat] hard timeout — killing claude');
            try { proc.kill('SIGKILL'); } catch {}
          }, HARD_TIMEOUT_MS);

          const done = (obj) => {
            if (resolved) return;
            resolved = true;
            clearInterval(idleCheck);
            clearTimeout(hardKiller);
            try { req.off('aborted', onAbort); } catch {}
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
                err = 'Claude exited with code ' + code + (idleKilled
                  ? ' (idle-killed — try a simpler request or use Fast mode)'
                  : '. Possible causes: quota / network / auth. Try again.');
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

      let r = await runClaudeOnce(false);
      // If claude was idle-killed and produced no output, the bridge process is
      // probably degraded. Auto-retry ONCE — the second attempt almost always
      // works because claude takes a fresh internal path.
      if (!r.ok && r.idleKilled && !(r.reply || '').trim()) {
        console.log('  [chat] auto-retrying after idle kill');
        broadcastProgress('Retrying', null, reqId);
        r = await runClaudeOnce(true);
      }

      if (r.aborted) { chatDone = true; broadcastProgressDone(reqId); return; }
      if (!r.ok) return sendErr(r.error || 'claude failed');

      const reply = (r.reply || '').trim() || '(no response)';
      const rawImports = [];
      const re = /\[\[IMPORT:([^\]]+)\]\]/g;
      let m;
      while ((m = re.exec(reply)) !== null) rawImports.push(m[1].trim());
      console.log('< ' + String(reply).slice(0, 80));
      if (rawImports.length) console.log('  imports: ' + rawImports.join(', '));

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
      const child = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
        cwd: process.cwd(),
        env: process.env,
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
          proc = spawn('claude', [...baseArgs, prompt], { ...v.opts, stdio: ['ignore', fd, fd] });
        } else {
          proc = spawn('claude', [...baseArgs, prompt], v.opts);
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
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} };
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
      const log = (s) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`); } catch {} };

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

// Persistent auto-update flag — written by the panel's settings toggle so
// the preference survives bridge restarts. File present = auto-update OFF.
const NO_AUTO_UPDATE_FLAG = path.join(WORK_DIR, '.no-auto-update');
function isAutoUpdateDisabled() {
  if (process.env.CLAUDE_BRIDGE_NO_UPDATE === '1') return true;
  try { return fs.existsSync(NO_AUTO_UPDATE_FLAG); } catch { return false; }
}

async function checkForUpdates(opts) {
  const force = !!(opts && opts.force);
  const result = { ok: true, updated: [], bridgeChanged: false, premiereRestartNeeded: false, skipped: false };
  if (!force && isAutoUpdateDisabled()) {
    console.log('Auto-update skipped (disabled via env var or settings flag).\n');
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
      // When force=true (manual ↻ click), ALWAYS rewrite — don't trust
      // the byte-equal check. Saw a case where GitHub's CDN returned
      // stale bytes that matched the local file even though the user
      // saw a stale version in the panel. Forcing the write costs ~ms
      // and guarantees the user gets the freshest copy.
      if (force || !local || !local.equals(remote)) {
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

// Retry listen() up to ~10x if the port is still held by the previous
// instance — used during /restart self-replacement so the new bridge can
// bind cleanly even if the old one hasn't fully released the socket yet.
let _listenAttempts = 0;
function _tryListen() {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('Claude Bridge v2 running at http://localhost:' + PORT);
    console.log('Session ID: ' + SESSION_ID);
    console.log('Work dir:   ' + WORK_DIR);
    console.log('Output dir: ' + OUTPUT_DIR);
    console.log('Open Premiere Pro → Window → Extensions → Claude');
    console.log('(keep this terminal open)\n');
    checkForUpdates().catch(e => console.error('Update check error:', e.message));
  });
}
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && _listenAttempts < 10) {
    _listenAttempts++;
    console.log('Port ' + PORT + ' busy (try ' + _listenAttempts + '/10), retrying in 300ms…');
    setTimeout(_tryListen, 300);
  } else {
    console.error('Bridge listen failed:', err);
    process.exit(1);
  }
});
_tryListen();

