// Render-pipeline regression tests.
//
// These exist because two bugs shipped that only a human watching the video
// could catch:
//   1. Captions flickered / went dark — the composition used CSS transitions and
//      willChange, so each frame rendered differently depending on which of the
//      parallel Chrome workers drew it.
//   2. Caption clips overlapped on the timeline — a line's holdMs ran past the
//      next line's start, so clips stacked on separate tracks and composited
//      into a dark flash.
// Neither is visible to a unit test of "did it return something". Both are
// caught here.
//
// Run:
//   node tests/render-pipeline.test.js            # fast checks only (~1s)
//   node tests/render-pipeline.test.js --render   # + real Remotion renders (~1-2 min)
//
// The render group is opt-in because it spawns Chrome workers and will fight
// anything else using the machine.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BRIDGE_SRC = path.join(ROOT, 'bridge', 'bridge.js');
const CAPTIONS_TSX = path.join(ROOT, 'bridge', 'remotion-template', 'src', 'Captions.tsx');
const RENDER_PROJECT = process.env.FLIMIFY_RENDER_PROJECT
  || path.join(os.homedir(), 'PremiereClaude', 'remotion-intro');

// ── harness ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0, skip = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); }
};
const skipped = (name, why) => { skip++; console.log('  skip ' + name + '  (' + why + ')'); };
const section = (t) => console.log('\n' + t);

// Pull functions straight out of the SHIPPED bridge so the tests can never
// drift from the code that actually runs (same trick as captions-helpers).
function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('function not found in bridge.js: ' + name);
  let i = src.indexOf('{', m.index), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}
const bridgeSrc = fs.readFileSync(BRIDGE_SRC, 'utf8');
const { groupWordsIntoLines } = require('./captions-helpers.test.js');
const { captionClipWindow } = (new Function(
  extractFn(bridgeSrc, 'captionClipWindow') + '\nreturn { captionClipWindow };'
))();

// Speech generator: `gapMs` between words is what decides whether a line's
// hold runs into the next line.
function speech(words, { wordMs = 330, gapMs = 60, startMs = 0 } = {}) {
  const out = []; let t = startMs;
  for (const w of words) { out.push({ text: w, startMs: t, endMs: t + wordMs }); t += wordMs + gapMs; }
  return out;
}
const SENTENCE = 'Getting tools and prepping the van for the job today before we start'.split(' ');

// ── 1. caption lines must never overlap ──────────────────────────────────────
// A line's end carries holdMs so it lingers after the last word. In continuous
// speech the next line begins inside that hold — which used to produce lines
// that overlapped by ~190ms, one clip each, stacked on the timeline.
section('caption line timing');
{
  const cases = [
    ['fast continuous speech', speech(SENTENCE, { gapMs: 20 })],
    ['normal speech',          speech(SENTENCE, { gapMs: 60 })],
    ['slow speech',            speech(SENTENCE, { gapMs: 200 })],
    ['long words',             speech(SENTENCE, { wordMs: 700, gapMs: 40 })],
  ];
  for (const [label, words] of cases) {
    const lines = groupWordsIntoLines(words, {});
    const bad = lines.filter((l, i) => lines[i + 1] && l.endMs > lines[i + 1].startMs);
    ok('lines never overlap — ' + label, bad.length === 0,
       bad.length ? bad.length + ' overlapping pair(s), worst ' +
         Math.max(...bad.map((l, i) => l.endMs - lines[lines.indexOf(l) + 1].startMs)) + 'ms' : '');
    ok('lines stay ordered — ' + label,
       lines.every((l, i) => i === 0 || l.startMs >= lines[i - 1].startMs));
    ok('every line has real duration — ' + label, lines.every(l => l.endMs > l.startMs));
  }

  // The hold is still WANTED when there is a genuine pause — the fix must not
  // have flattened every line to its last word.
  const paused = [
    { text: 'Hello', startMs: 0, endMs: 400 }, { text: 'there', startMs: 420, endMs: 900 },
    { text: 'now', startMs: 3000, endMs: 3400 }, { text: 'listen', startMs: 3450, endMs: 3900 },
  ];
  const pl = groupWordsIntoLines(paused, {});
  ok('hold survives a real pause', pl[0].endMs > 900, 'line 0 ends at ' + pl[0].endMs + 'ms, last word ended 900ms');
}

// ── 2. clips must tile frame-exactly ─────────────────────────────────────────
// Asking ffmpeg for a duration in seconds rounds UP to a whole frame, so clips
// came out 7-20ms long and overlapped by a fraction of a frame. The window math
// snaps both edges to the grid; consecutive clips must share a boundary exactly.
section('caption clip tiling');
{
  // NTSC rates included on purpose — real footage is 23.976/29.97 far more often
  // than a clean integer, and the snap must land on whole frames there too.
  for (const fps of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]) {
    const lines = groupWordsIntoLines(speech(SENTENCE, { gapMs: 60 }), {});
    const wins = lines.map(l => captionClipWindow(l, fps));
    const overlaps = wins.filter((w, i) => wins[i + 1] && w.endFrame > wins[i + 1].startFrame);
    ok(`clips never overlap @ ${fps}fps`, overlaps.length === 0, overlaps.length + ' overlapping');
    ok(`clips are whole frames @ ${fps}fps`, wins.every(w => Number.isInteger(w.nFrames) && w.nFrames >= 1));
    ok(`duration matches frame count @ ${fps}fps`,
       wins.every(w => Math.abs(w.dur - w.nFrames / fps) < 1e-9));
  }
  // adjacent lines (what the grouping now produces) must butt up with no gap
  const adj = [{ startMs: 0, endMs: 1560, words: [] }, { startMs: 1560, endMs: 3120, words: [] }];
  const [a, b] = adj.map(l => captionClipWindow(l, 30));
  ok('adjacent lines share a frame boundary', a.endFrame === b.startFrame,
     `a ends ${a.endFrame}, b starts ${b.startFrame}`);
}

// ── 3. compositions must be frame-deterministic (static scan) ────────────────
// Remotion renders frames across parallel Chrome processes and screenshots each
// one. Anything driven by wall-clock time or GPU layer state renders differently
// per frame — that is the flicker. This catches it without rendering anything.
section('composition determinism (static)');
{
  const BANNED = [
    [/\btransition\s*:/, 'CSS transition — animates on wall-clock time, not the frame'],
    [/\banimation\s*:/, 'CSS animation — same problem'],
    [/@keyframes/, 'CSS keyframes — same problem'],
    [/\bwillChange\b/, 'willChange — promotes to a GPU layer, rasterises differently per worker'],
    [/Math\.random\s*\(/, 'Math.random — different every render'],
    [/Date\.now\s*\(/, 'Date.now — different every render'],
    [/\bnew Date\s*\(/, 'new Date — different every render'],
    [/performance\.now\s*\(/, 'performance.now — different every render'],
  ];
  const src = fs.readFileSync(CAPTIONS_TSX, 'utf8');
  // strip comments so prose explaining the rule doesn't trip it
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const [re, why] of BANNED) {
    const hit = re.exec(code);
    ok('Captions.tsx has no ' + re.source, !hit, hit ? why : '');
  }
}

// ── 4. real renders (opt-in) ─────────────────────────────────────────────────
section('rendering' + (process.argv.includes('--render') ? '' : ' — skipped, pass --render to run'));
if (!process.argv.includes('--render')) {
  skipped('same composition renders identically twice', 'needs --render');
  skipped('overlay renders with a transparent background', 'needs --render');
} else if (!fs.existsSync(path.join(RENDER_PROJECT, 'node_modules', 'remotion'))) {
  skipped('render tests', 'no render project at ' + RENDER_PROJECT);
} else {
  const ENTRY = path.join(RENDER_PROJECT, 'src', '__RenderTest.entry.tsx');
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'flimify-rt-'));
  const cleanup = () => {
    try { fs.unlinkSync(ENTRY); } catch {}
    try { fs.rmSync(OUT, { recursive: true, force: true }); } catch {}
  };
  try {
    fs.writeFileSync(ENTRY, `
import { registerRoot, Composition } from 'remotion';
import { Captions } from './Captions';
const LINES = [{ startMs: 0, endMs: 2600, words: [
  { text: 'Getting', startMs: 0, endMs: 500 }, { text: 'tools', startMs: 500, endMs: 1000 },
  { text: 'and', startMs: 1000, endMs: 1350 }, { text: 'prepping', startMs: 1350, endMs: 1950 },
  { text: 'the', startMs: 1950, endMs: 2200 }, { text: 'van', startMs: 2200, endMs: 2600 }] }];
const Root = () => (
  <Composition id="RenderTest" component={Captions as any}
    durationInFrames={40} fps={30} width={1920} height={1080}
    defaultProps={{ lines: LINES, style: 'karaoke', options: {}, fps: 30, width: 1920, height: 1080 } as any} />
);
registerRoot(Root);
`);
    const render = (dest, extra) => spawnSync('npx', ['remotion', 'render',
      'src/__RenderTest.entry.tsx', 'RenderTest', dest,
      '--frames=10-19', '--concurrency=4', '--log', 'error', ...extra],
      { cwd: RENDER_PROJECT, encoding: 'utf8' });

    // determinism: identical input must give identical frames, twice
    const A = path.join(OUT, 'a'), B = path.join(OUT, 'b');
    render(A, ['--sequence', '--image-format', 'png']);
    render(B, ['--sequence', '--image-format', 'png']);
    if (!fs.existsSync(A) || !fs.existsSync(B)) {
      ok('same composition renders identically twice', false, 'render produced no frames');
    } else {
      const crypto = require('crypto');
      const h = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      const fa = fs.readdirSync(A).sort(), fb = fs.readdirSync(B).sort();
      const diff = fa.filter((f, i) => fb[i] && h(path.join(A, f)) !== h(path.join(B, fb[i])));
      ok('same composition renders identically twice', fa.length > 0 && diff.length === 0,
         diff.length + '/' + fa.length + ' frames differ between two runs');
    }

    // transparency: an overlay whose background is not actually transparent
    // would cover the footage in Premiere
    const MOV = path.join(OUT, 'alpha.mov');
    render(MOV, ['--codec', 'prores', '--prores-profile', '4444',
                 '--image-format', 'png', '--pixel-format', 'yuva444p10le', '--mute']);
    if (!fs.existsSync(MOV)) {
      ok('overlay renders with a transparent background', false, 'no output');
    } else {
      const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
      const pix = execFileSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', MOV], { encoding: 'utf8' }).trim();
      ok('output pixel format carries alpha', /yuva|rgba|argb/i.test(pix), 'pix_fmt=' + pix);
      const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
      const raw = path.join(OUT, 'corner.raw');
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', MOV,
        '-vf', 'format=rgba,crop=2:2:0:0', '-frames:v', '1', '-f', 'rawvideo', raw]);
      const alpha = fs.readFileSync(raw)[3];
      ok('corner pixel is actually transparent', alpha < 16, 'corner alpha=' + alpha + '/255');
    }
  } catch (e) {
    ok('render group completed', false, e.message);
  } finally { cleanup(); }
}

console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
