// Standalone copy of the caption helpers for unit testing before inserting into bridge.js.

// Reconstruct word-level [{text,startMs,endMs}] from parakeet-mlx subword tokens.
// parakeet emits sentencepiece tokens (" F","li","mi","f","y"," mak","es",...);
// a new word begins at a token whose text starts with whitespace, or the first
// token of the stream. We merge tokens until the next word-boundary token.
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
  // sanitise: trim, drop empties, ensure end >= start, ensure monotonic non-overlap
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

// Group a flat word list into caption lines. A line breaks when any of:
//  - it already holds maxWordsPerLine words
//  - the silent gap before the next word exceeds maxGapMs (natural pause)
//  - adding the word would push the line past maxLineMs of on-screen time
//  - adding the word would exceed maxCharsPerLine characters
// Returns [{words, startMs, endMs}] with line.endMs extended slightly so the
// last word doesn't vanish the instant it's spoken.
function groupWordsIntoLines(words, opts) {
  opts = opts || {};
  const maxWordsPerLine = Math.max(1, opts.maxWordsPerLine || 4);
  const maxGapMs = opts.maxGapMs != null ? opts.maxGapMs : 600;
  const maxLineMs = opts.maxLineMs != null ? opts.maxLineMs : 2600;
  const maxCharsPerLine = opts.maxCharsPerLine != null ? opts.maxCharsPerLine : 24;
  const holdMs = opts.holdMs != null ? opts.holdMs : 250; // linger after last word

  const clean = (words || [])
    .filter(w => w && String(w.text || '').trim() && Number.isFinite(w.startMs) && Number.isFinite(w.endMs))
    .map(w => ({ text: String(w.text).trim(), startMs: Math.max(0, w.startMs), endMs: Math.max(w.startMs + 1, w.endMs) }))
    .sort((a, b) => a.startMs - b.startMs);

  const lines = [];
  let cur = [];
  let curChars = 0;

  const flush = () => {
    if (!cur.length) return;
    const startMs = cur[0].startMs;
    const endMs = cur[cur.length - 1].endMs + holdMs;
    lines.push({ words: cur.slice(), startMs, endMs });
    cur = [];
    curChars = 0;
  };

  for (let i = 0; i < clean.length; i++) {
    const w = clean[i];
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const gap = w.startMs - prev.endMs;
      const lineDur = w.endMs - cur[0].startMs;
      const wouldChars = curChars + 1 + w.text.length;
      if (
        cur.length >= maxWordsPerLine ||
        gap > maxGapMs ||
        lineDur > maxLineMs ||
        wouldChars > maxCharsPerLine
      ) {
        flush();
      }
    }
    cur.push(w);
    curChars += (curChars ? 1 : 0) + w.text.length;
  }
  flush();
  return lines;
}

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
