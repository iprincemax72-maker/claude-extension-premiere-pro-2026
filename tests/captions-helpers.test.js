// Unit tests for the caption helpers. To guarantee we test the SHIPPED code (not
// a drifting copy), extract tokensToWords + groupWordsIntoLines straight from
// bridge/bridge.js source and eval them in isolation.
const fs = require('fs');
const path = require('path');

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

const BRIDGE = path.join(__dirname, '..', 'bridge', 'bridge.js');
const _src = fs.readFileSync(BRIDGE, 'utf8');
const _code = extractFn(_src, 'tokensToWords') + '\n' + extractFn(_src, 'groupWordsIntoLines') +
  '\nreturn { tokensToWords, groupWordsIntoLines };';
const { tokensToWords, groupWordsIntoLines } = (new Function(_code))();

module.exports = { tokensToWords, groupWordsIntoLines };

// ── tests ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  let pass = 0, fail = 0;
  const eq = (name, got, want) => {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + '\n        got : ' + g + '\n        want: ' + w); }
  };
  const ok = (name, cond) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name); } };

  // 1. tokensToWords on the real parakeet shape
  const sentences = [{
    text: ' Flimify makes captions.', start: 0, end: 1.68,
    tokens: [
      { text: ' F', start: 0.0, end: 0.16 }, { text: 'li', start: 0.16, end: 0.32 },
      { text: 'mi', start: 0.32, end: 0.48 }, { text: 'f', start: 0.48, end: 0.64 },
      { text: 'y', start: 0.64, end: 0.88 }, { text: ' mak', start: 0.88, end: 1.04 },
      { text: 'es', start: 1.04, end: 1.20 }, { text: ' cap', start: 1.20, end: 1.40 },
      { text: 'tions', start: 1.40, end: 1.68 },
    ],
  }];
  const words = tokensToWords(sentences);
  eq('tokensToWords text', words.map(w => w.text), ['Flimify', 'makes', 'captions']);
  eq('tokensToWords timing', words.map(w => [w.startMs, w.endMs]), [[0, 880], [880, 1200], [1200, 1680]]);

  // 2. empty / garbage input
  eq('tokensToWords empty', tokensToWords([]), []);
  eq('tokensToWords null', tokensToWords(null), []);
  eq('groupWords empty', groupWordsIntoLines([]), []);

  // 3. maxWordsPerLine break
  const w4 = [
    { text: 'a', startMs: 0, endMs: 100 }, { text: 'b', startMs: 100, endMs: 200 },
    { text: 'c', startMs: 200, endMs: 300 }, { text: 'd', startMs: 300, endMs: 400 },
    { text: 'e', startMs: 400, endMs: 500 },
  ];
  const l4 = groupWordsIntoLines(w4, { maxWordsPerLine: 2, maxGapMs: 9999, maxLineMs: 99999, maxCharsPerLine: 999 });
  eq('maxWords=2 → 3 lines', l4.map(l => l.words.map(w => w.text)), [['a', 'b'], ['c', 'd'], ['e']]);

  // 4. gap break (a long pause splits the line)
  const wg = [
    { text: 'hello', startMs: 0, endMs: 400 },
    { text: 'world', startMs: 1500, endMs: 1900 }, // 1100ms gap > 600 default
  ];
  const lg = groupWordsIntoLines(wg);
  eq('gap splits', lg.map(l => l.words.map(w => w.text)), [['hello'], ['world']]);

  // 5. line.startMs/endMs derive from words (+hold)
  const lh = groupWordsIntoLines([{ text: 'x', startMs: 200, endMs: 600 }], { holdMs: 250 });
  eq('line bounds', [lh[0].startMs, lh[0].endMs], [200, 850]);

  // 6. char limit break
  const wc = [
    { text: 'wonderful', startMs: 0, endMs: 300 },
    { text: 'spectacular', startMs: 300, endMs: 600 }, // 9+1+11=21 ok
    { text: 'extravaganza', startMs: 600, endMs: 900 }, // would exceed 24
  ];
  const lc = groupWordsIntoLines(wc, { maxWordsPerLine: 9, maxGapMs: 9999, maxCharsPerLine: 24 });
  ok('char limit breaks into >1 line', lc.length >= 2);

  // 7. full pipeline: tokens → words → lines, lines are time-ordered & non-overlapping in words
  const fullWords = tokensToWords([{
    tokens: [
      { text: ' Flimify', start: 0, end: 0.88 }, { text: ' makes', start: 0.88, end: 1.2 },
      { text: ' captions', start: 1.2, end: 1.68 }, { text: ' in', start: 1.68, end: 1.92 },
      { text: ' one', start: 1.92, end: 2.16 }, { text: ' click', start: 2.16, end: 2.8 },
    ],
  }]);
  const fullLines = groupWordsIntoLines(fullWords, { maxWordsPerLine: 3 });
  ok('pipeline produces lines', fullLines.length >= 2);
  ok('lines ordered', fullLines.every((l, i) => i === 0 || l.startMs >= fullLines[i - 1].startMs));
  ok('every word kept', fullLines.reduce((n, l) => n + l.words.length, 0) === fullWords.length);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
