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

// Resolve whisper-cli binary + ggml model path. Both must exist for transcript
// mode to work. Falls through several known locations.
function resolveWhisper() {
  const binCandidates  = ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'];
  const modelCandidates = [
    '/opt/homebrew/share/whisper-cpp/ggml-base.bin',
    '/usr/local/share/whisper-cpp/ggml-base.bin',
    path.join(os.homedir(), '.cache/whisper/ggml-base.bin'),
  ];
  let bin = null, model = null;
  for (const p of binCandidates)   { try { if (fs.existsSync(p)) { bin = p; break; } } catch {} }
  for (const p of modelCandidates) { try { if (fs.existsSync(p)) { model = p; break; } } catch {} }
  return { bin, model };
}

// Extract clip audio to a 16kHz mono WAV (whisper's preferred input), trimmed
// to [inP, outP] of the source. Returns path to the temp wav.
function extractAudioForWhisper(clipPath, inP, outP) {
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

// Run whisper-cli on a wav. Returns array of word-level segments:
//   [{ start: 0.0, end: 0.5, text: "Hello" }, ...]
// Hard timeout scales with clip duration (allow ~1s per second of audio + 30s).
function runWhisper(wavPath, audioDuration) {
  return new Promise((resolve, reject) => {
    const { bin, model } = resolveWhisper();
    if (!bin || !model) return reject(new Error('whisper-cli or model not installed'));

    const outBase = wavPath.replace(/\.wav$/, '');
    const args = [
      '-m', model,
      '-f', wavPath,
      '-oj',           // JSON output
      '-sow',          // split on word
      '-ml', '1',      // max 1 segment per line — gives word-level timing
      '-of', outBase,
      '-t', '4',       // threads
      '-pp',           // print progress
      '-nt',           // no timestamps in stdout (we read JSON)
    ];

    const proc = spawn(bin, args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString().slice(-2000));
    proc.stdout.on('data', () => {}); // drain so it doesn't block

    const cap = Math.min(15 * 60 * 1000, Math.max(60000, audioDuration * 1500 + 30000));
    const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} reject(new Error('whisper timeout after ' + Math.round(cap/1000) + 's')); }, cap);

    proc.on('error', e => { clearTimeout(killer); reject(e); });
    proc.on('close', code => {
      clearTimeout(killer);
      const jsonPath = outBase + '.json';
      if (code !== 0 || !fs.existsSync(jsonPath)) {
        reject(new Error('whisper exit ' + code + ': ' + stderr.slice(-300)));
        return;
      }
      try {
        const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const segs = (j.transcription || []).map(s => {
          // whisper-cli timestamps are in milliseconds inside `offsets`
          const start = s.offsets && typeof s.offsets.from === 'number' ? s.offsets.from / 1000 : 0;
          const end   = s.offsets && typeof s.offsets.to   === 'number' ? s.offsets.to   / 1000 : 0;
          return { start, end, text: (s.text || '').trim() };
        }).filter(s => s.text);
        // Cleanup
        try { fs.unlinkSync(jsonPath); } catch {}
        try { fs.unlinkSync(wavPath);  } catch {}
        resolve(segs);
      } catch (e) {
        reject(new Error('whisper json parse: ' + e.message));
      }
    });
  });
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
        'REPEATED SENTENCES, FALSE STARTS, AND SELF-CORRECTIONS to remove:',
        '  These are the MOST IMPORTANT cuts. Be AGGRESSIVE about catching them.',
        '  - PARTIAL-WORD false start: "maybe it was th-" then "maybe it was the fear" → CUT "maybe it was th-".',
        '    Watch for words that whisper transcribed as truncated stems: "th", "wha", "becau", "som", "rememb", short fragments ending in a consonant before the speaker restarts.',
        '  - PHRASE REDO: "I went to the store — I went to the grocery store" → CUT the first version, keep the more complete second.',
        '  - SELF-CORRECTION: "the red car, no, the blue car" → CUT "the red car, no,".',
        '  - REPEATED FILLER PHRASES: "so, so the thing is" → CUT the first "so,".',
        '  - HESITATION RESTART: speaker says a word, pauses 0.5s+, then says it again. CUT the first attempt.',
        '  - When in doubt about whether a fragment is a false start, LOOK at the next sentence. If the speaker is restating a similar phrase, the first one IS a false start — CUT IT.',
        '  Cuts should INCLUDE the partial fragment AND the pause/breath that follows it, up until the speaker resumes.'
      );
    }

    const userMsg = [
      'Here is a word-level transcript of a talking-head clip. Each line is one word with its start-end in seconds.',
      '',
      transcriptText.slice(0, 16000), // bumped cap — longer clips need full context
      '',
      'Find UNWANTED spans to cut out:',
      '',
      ...lookFor,
      '',
      'For each cut, use the timestamps shown in the transcript (be generous on the END to include the breath/pause).',
      'It is BETTER to cut a slightly-too-long span than to leave a stutter in. Lean toward MORE cuts, not fewer.',
      '',
      'Output EXACTLY this JSON, nothing else (no prose, no fences, no commentary):',
      '{"cuts":[{"start":2.30,"end":3.10,"kind":"false_start","reason":"truncated word \'th-\' before restart"}],"summary":"Found 3 fillers and 5 false starts."}',
      '',
      '"kind" must be: filler | false_start | mistake. start and end are seconds.',
    ].join('\n');

    const sysPrompt = 'You are an audio editing assistant. Return ONLY valid JSON. No tool use — just read the transcript and emit cut ranges. Be AGGRESSIVE about catching false starts and self-corrections; the user is editing a talking-head video and wants a clean final cut.';

    const args = [
      '-p',
      '--output-format', 'json',
      '--permission-mode', 'bypassPermissions',
      '--append-system-prompt', sysPrompt,
      '--no-session-persistence',
      userMsg,
    ];

    const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
    let stdoutBuf = '';
    proc.stdout.on('data', d => stdoutBuf += d.toString());
    let stderrBuf = '';
    proc.stderr.on('data', d => stderrBuf += d.toString());

    let done = false;
    const finish = (result) => { if (done) return; done = true; clearTimeout(killer); resolve(result); };
    const killer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      finish({ cuts: [], summary: 'analysis timed out (60s)' });
    }, 60000);

    proc.on('error', () => finish({ cuts: [], summary: 'claude unavailable' }));
    proc.on('close', () => {
      // Claude's json output mode wraps the assistant text in a top-level "result" field
      let result = null;
      try { const j = JSON.parse(stdoutBuf); result = j.result || j.text; } catch {}
      if (!result) return finish({ cuts: [], summary: null });
      let parsed = null;
      try { parsed = JSON.parse(result); } catch {}
      if (!parsed) {
        const m = result.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
      }
      if (!parsed || !Array.isArray(parsed.cuts)) return finish({ cuts: [], summary: null });
      finish(parsed);
    });
  });
}

// Master transcript path — local whisper + claude analyze. Replaces the old
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
  try { wavPath = await extractAudioForWhisper(clipPath, clipIn, clipOut); }
  catch (e) {
    log(`audio extract failed: ${e.message}`);
    console.log('  [autocut] audio extract failed: ' + e.message);
    return { cuts: silenceCuts, transcribed: false, summary: null };
  }

  // 2. Whisper transcribe
  broadcastProgress('Transcribing (whisper)', 35, reqId);
  let transcript;
  try { transcript = await runWhisper(wavPath, audioDur); }
  catch (e) {
    log(`whisper failed: ${e.message}`);
    console.log('  [autocut] whisper failed: ' + e.message);
    try { fs.unlinkSync(wavPath); } catch {}
    return { cuts: silenceCuts, transcribed: false, summary: null };
  }
  console.log('  [autocut] whisper transcribed ' + transcript.length + ' segments');
  log(`whisper produced ${transcript.length} segments (word-level)`);
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
  const analysis = await analyseTranscriptWithClaude(transcript, { findFillers, findRepeats });
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
      start: c.start + clipIn,   // whisper saw [clipIn, clipOut] audio, so 0 in transcript = clipIn in source
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

// (legacy claude-does-everything path below — kept for fallback if needed)
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
      resolve({ cuts: silenceCuts, transcribed: false, summary: null });
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
      resolve({ cuts: silenceCuts, transcribed: false, summary: null });
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
        resolve({ cuts: silenceCuts, transcribed: false, summary: null });
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
                      :                        Math.max(5, Math.floor(sentences.length / 10));

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
      `[${s.i}] ${s.startSec.toFixed(1)}s-${s.endSec.toFixed(1)}s: ${s.text}`
    ).join('\n');

    const system = [
      'You are a motion-graphics editor reviewing a transcript of a video clip.',
      'You decide where on-screen text/graphics would HELP the viewer — not where to flex.',
      '',
      'Output a JSON array of "moments". Each moment is an opportunity for a motion graphic.',
      'Each moment is an object: { id, type, startSec, endSec, label, payload, confidence }',
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
      '  1. Do NOT add motion graphics to every sentence. Most sentences should NOT become moments.',
      '  2. Aim for ~' + targetCount + ' moments total across the whole transcript.',
      '  3. confidence is 0..1. Only include moments with confidence >= 0.6.',
      '  4. startSec/endSec must come directly from the timestamps in the transcript I gave you.',
      '  5. id is a short unique string like "m1", "m2", etc.',
      '  6. label is a 2-6 word human description for logs.',
      '  7. The audio plays normally underneath — the graphic SUPPORTS the speech, doesn\'t replace it.',
      '  8. Return ONLY the JSON array. No prose, no markdown fences, no commentary.',
    ].join('\n');

    const user = 'TRANSCRIPT (sentence index, time range, text):\n' + transcriptForClaude;
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
    const proc = spawn(claudePath, ['-p', fullPrompt, '--output-format', 'text'], {
      env: { ...process.env, PATH: extendedPath },
      cwd: WORK_DIR,
    });
    if (_activeAutoedit) _activeAutoedit.children.add(proc);

    // Hard timeout based on transcript length — 60s + 1s per 10 sentences.
    const timeoutMs = 60000 + Math.min(120000, sentences.length * 100);
    const killer = setTimeout(() => {
      log(`moments HARD TIMEOUT (${timeoutMs}ms) — killing claude`);
      try { proc.kill('SIGKILL'); } catch {}
    }, timeoutMs);

    // Idle watchdog — if claude produces no stdout/stderr for IDLE_MS, it's
    // hung at 0% CPU (the known claude CLI bug). Kill it so the request can
    // recover instead of dangling forever.
    const IDLE_MS = 60000;
    let lastOutputAt = Date.now();
    const idleCheck = setInterval(() => {
      if (Date.now() - lastOutputAt > IDLE_MS) {
        log(`moments IDLE WATCHDOG — no output for ${IDLE_MS}ms, killing claude (hang detected)`);
        try { proc.kill('SIGKILL'); } catch {}
        clearInterval(idleCheck);
      }
    }, 5000);

    proc.stdout.on('data', d => { stdout += d; lastOutputAt = Date.now(); });
    proc.stderr.on('data', d => { stderr += d; lastOutputAt = Date.now(); });
    proc.on('close', () => {
      clearInterval(idleCheck);
      clearTimeout(killer);
      if (_activeAutoedit) _activeAutoedit.children.delete(proc);
      log('moments stdout chars: ' + stdout.length);
      if (stderr) log('moments stderr: ' + stderr.slice(-500));
      // Strip any markdown fences or pre-amble Claude might have added
      const cleaned = stdout
        .replace(/^[\s\S]*?(\[)/, '$1')         // drop everything before first [
        .replace(/(\])[\s\S]*$/, '$1')          // drop everything after last ]
        .trim();
      let parsed = [];
      try { parsed = JSON.parse(cleaned); } catch (e) {
        log('moments parse fail: ' + e.message);
        log('moments cleaned snippet: ' + cleaned.slice(0, 500));
      }
      if (!Array.isArray(parsed)) parsed = [];
      // Sanity filter
      parsed = parsed.filter(m =>
        m && typeof m === 'object'
        && typeof m.type === 'string'
        && typeof m.startSec === 'number'
        && typeof m.endSec === 'number'
        && m.startSec < m.endSec
        && m.endSec - m.startSec < 30
        && (m.confidence == null || m.confidence >= 0.6)
      );
      resolve(parsed);
    });
    proc.on('error', (e) => { log('moments spawn err: ' + e.message); clearTimeout(killer); resolve([]); });
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
function renderMomentsParallel(moments, reqId, log, onProgress) {
  const MAX_INFLIGHT = 4;
  const REMOTION_DIR = path.join(WORK_DIR, 'remotion-intro');
  const cacheDir = path.join(OUTPUT_DIR, 'cache');
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}

  const tasks = moments.map((m, idx) => {
    // Duration: a touch longer than the speech window, capped 2.5..6s.
    const speechDur = Math.max(0.5, m.endSec - m.startSec);
    const durationSec = Math.min(6, Math.max(2.5, speechDur + 0.6));
    const durationFrames = Math.floor(durationSec * 30); // assume 30fps comp
    // Hash for caching
    const propsJson = JSON.stringify({ moment: m, durationFrames });
    const hash = crypto.createHash('md5').update(propsJson).digest('hex').slice(0, 10);
    const outFile = path.join(cacheDir, `ae_${reqId.slice(0, 8)}_${idx}_${hash}.mp4`);
    return { idx, moment: m, propsJson, outFile, durationSec, durationFrames };
  });

  let done = 0;
  const total = tasks.length;
  const results = new Array(total);

  function runOne(task) {
    return new Promise((resolve) => {
      if (fs.existsSync(task.outFile)) {
        log(`render[${task.idx}] cache hit ${task.moment.type}`);
        results[task.idx] = {
          ok: true, file: task.outFile, atSec: task.moment.startSec,
          type: task.moment.type, label: task.moment.label || '',
          durationSec: task.durationSec, trendPack: task.moment.trendPack,
        };
        done++; if (onProgress) onProgress(done, total);
        resolve();
        return;
      }

      const propsArg = '--props=' + task.propsJson;
      const args = [
        'remotion', 'render', 'src/index.ts', 'AutoEditMoment',
        task.outFile, propsArg,
        '--codec', 'h264',
        '--log', 'error',
        '--frames', `0-${task.durationFrames - 1}`,
      ];
      const proc = spawn('npx', args, { cwd: REMOTION_DIR, env: process.env });
      if (_activeAutoedit) _activeAutoedit.children.add(proc);

      const HARD_TIMEOUT_MS = 60000;
      let killed = false;
      const killer = setTimeout(() => { killed = true; try { proc.kill('SIGKILL'); } catch {} }, HARD_TIMEOUT_MS);

      let errBuf = '';
      proc.stderr.on('data', d => { errBuf += d; });
      proc.on('close', (code) => {
        clearTimeout(killer);
        if (_activeAutoedit) _activeAutoedit.children.delete(proc);
        if (code === 0 && fs.existsSync(task.outFile)) {
          log(`render[${task.idx}] ok ${task.moment.type} -> ${task.outFile}`);
          results[task.idx] = {
            ok: true, file: task.outFile, atSec: task.moment.startSec,
            type: task.moment.type, label: task.moment.label || '',
            durationSec: task.durationSec, trendPack: task.moment.trendPack,
          };
        } else {
          const reason = killed ? 'timeout' : `exit ${code}`;
          log(`render[${task.idx}] fail ${reason} stderr=${errBuf.slice(-400)}`);
          results[task.idx] = {
            ok: false, atSec: task.moment.startSec, type: task.moment.type,
            label: task.moment.label || '', reason,
          };
        }
        done++; if (onProgress) onProgress(done, total);
        resolve();
      });
      proc.on('error', (e) => {
        clearTimeout(killer);
        if (_activeAutoedit) _activeAutoedit.children.delete(proc);
        log(`render[${task.idx}] spawn err ${e.message}`);
        results[task.idx] = { ok: false, atSec: task.moment.startSec, type: task.moment.type, label: task.moment.label || '', reason: e.message };
        done++; if (onProgress) onProgress(done, total);
        resolve();
      });
    });
  }

  // Pool: keep up to MAX_INFLIGHT promises in flight at any time.
  return new Promise((resolveAll) => {
    let next = 0;
    let active = 0;
    function pump() {
      while (active < MAX_INFLIGHT && next < tasks.length) {
        const t = tasks[next++]; active++;
        runOne(t).then(() => { active--; if (next < tasks.length) pump(); else if (active === 0) resolveAll(results); });
      }
    }
    if (!tasks.length) resolveAll([]); else pump();
  });
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
- Render with: \`cd ${WORK_DIR}/remotion-intro && npx remotion render src/index.ts <CompositionId> ${OUTPUT_DIR}/<filename>.mp4\`
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
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(body); }
      catch { res.writeHead(400); res.end('{"error":"bad json"}'); return; }

      const message = payload.message;
      const context = payload.context || null;
      const reqId   = payload.reqId || crypto.randomUUID();
      // Self-critique step is opt-out via panel setting. Default true.
      const selfCritique = (payload.selfCritique !== undefined) ? !!payload.selfCritique : true;
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
      //
      // The SELF_CRITIQUE_BEGIN/END markers wrap the visual auto-fix loop
      // instructions. We either strip them or keep their content based on
      // the panel setting.
      let resolvedSystemPrompt;
      if (selfCritique) {
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__\n?/g, '')
          .replace(/__SELF_CRITIQUE_END__\n?/g, '');
      } else {
        resolvedSystemPrompt = SYSTEM_PROMPT
          .replace(/__SELF_CRITIQUE_BEGIN__[\s\S]*?__SELF_CRITIQUE_END__\n?/g, '');
      }
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
          const proc = spawn('claude', args, { cwd: WORK_DIR, env: process.env });
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

          proc.stderr.on('data', d => stderr += d);
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
              return done({
                ok: false,
                reply: finalReply,
                idleKilled,
                error: stderr.trim() || ('claude exited with code ' + code),
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
        const silenceCuts = allSilences
          .map(c => {
            // Clip the silence to the [inP, outP] window
            const start = Math.max(c.start, inP);
            const end   = Math.min(c.end,   outP);
            if (end - start < 0.3) return null;  // sliver — skip
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
          // Local-whisper pipeline: ffmpeg → whisper-cli → claude (text in,
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
        //      and only fall back to whisper (~30-60s) if they're missing.
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
          // Whisper fallback
          broadcastProgress('Extracting audio', 5, reqId);
          if (_activeAutoedit.aborted) throw new Error('cancelled');
          const wavPath = await extractAudioForWhisper(clipPath, inP, outP);

          broadcastProgress('Transcribing with whisper', 12, reqId);
          if (_activeAutoedit.aborted) throw new Error('cancelled');
          const transcriptRaw = await runWhisper(wavPath, totalDur);
          log(`whisper transcript: ${(transcriptRaw || []).length} segments`);

          if (!transcriptRaw || transcriptRaw.length < 3) {
            broadcastProgressDone(reqId);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Couldn\'t hear much speech in this clip', reqId }));
            _activeAutoedit = null;
            return;
          }
          sentences = transcriptRaw.map((seg, i) => ({
            i,
            startSec: inP + (seg.offsets?.from || 0) / 1000,
            endSec:   inP + (seg.offsets?.to   || 0) / 1000,
            text:     (seg.text || '').trim(),
          })).filter(s => s.text.length > 0);
          log(`normalised from whisper: ${sentences.length} sentence units`);
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

        // ── 4. Anti-collision + spacing ───────────────────────────────────
        const minGapSec = density === 'sparse' ? 8 : density === 'dense' ? 2 : 4;
        const maxPerMin = density === 'sparse' ? 3 : density === 'dense' ? 10 : 6;
        const filtered  = spaceMoments(moments, minGapSec, maxPerMin, totalDur);
        log(`moments after spacing: ${filtered.length}`);

        if (!filtered.length) {
          broadcastProgressDone(reqId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, reqId, applied: [], skipped: [], summary: 'No suitable moments found.' }));
          _activeAutoedit = null;
          return;
        }

        // ── 5. Pick trend pack per moment (with rotation for variety) ─────
        const PACK_ROTATION = ['tiktokKineticCaption', 'editorialBrutalist', 'modernDark-soft'];
        for (let i = 0; i < filtered.length; i++) {
          if (styleOverride && styleOverride !== 'auto') filtered[i].trendPack = styleOverride;
          else if (!filtered[i].trendPack) filtered[i].trendPack = momentTypeToTrendPack(filtered[i].type, i);
        }

        // ── 6. Render each moment as its own short MP4 ────────────────────
        broadcastProgress('Rendering motion graphics', 40, reqId);
        const renderResults = await renderMomentsParallel(filtered, reqId, log, (done, total) => {
          const pct = 40 + Math.floor((done / total) * 50);
          broadcastProgress(`Rendering motion graphics (${done}/${total})`, pct, reqId);
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
