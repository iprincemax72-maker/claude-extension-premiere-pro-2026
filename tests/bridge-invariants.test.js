#!/usr/bin/env node
/**
 * Source invariants that a running bridge cannot easily be made to prove.
 *
 * The bug behind this file: `_activeAutoedit` is one global, but four handlers
 * (/autocut, /autoedit/analyze, /autoedit/run, /autoedit/rerender) each set it
 * and each cleared it in a `finally`. Nothing stops two from overlapping — the
 * panel's setBusy only disables the row you clicked, so hitting "Change" on
 * graphic 1 while graphics 2-5 are still rendering runs two of them at once.
 *
 * Whichever finished first nulled the global, and the other one then either
 *   - dereferenced null on its next `_activeAutoedit.aborted` check, throwing a
 *     TypeError that surfaced as a 500 and took down the whole Auto-Edit run, or
 *   - lost its child-process set, so Cancel silently stopped killing anything.
 *
 * The fix gives each handler its own run token and only clears the global when
 * it is still the one that set it. These checks make sure that stays true.
 *
 * Run:  node tests/bridge-invariants.test.js
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'bridge.js'), 'utf8');
const LINES = SRC.split('\n');

let pass = 0, fail = 0;
const bad = [];
function check(name, ok, detail) {
  if (ok) pass++; else { fail++; bad.push(name + (detail ? '  — ' + detail : '')); }
}

// ── 1. no handler may read the shared global's abort flag directly ──────────
// Another handler's `finally` can null it between the set and the read.
const unguarded = [];
LINES.forEach((l, i) => {
  if (!l.includes('_activeAutoedit.aborted')) return;
  // the cancel endpoint reads it inside its own `if (_activeAutoedit)` block
  const inCancelBlock = LINES.slice(Math.max(0, i - 3), i).some(p => /if \(_activeAutoedit\)/.test(p));
  const guardedInline = /_activeAutoedit && _activeAutoedit\.aborted/.test(l);
  if (!inCancelBlock && !guardedInline) unguarded.push(`line ${i + 1}: ${l.trim().slice(0, 70)}`);
});
check('no unguarded reads of _activeAutoedit.aborted', unguarded.length === 0, unguarded.join(' | '));

// ── 2. clearing the global must be conditional on still owning it ───────────
const unconditional = [];
LINES.forEach((l, i) => {
  if (!/_activeAutoedit = null;/.test(l)) return;
  if (/^\s*let _activeAutoedit = null;/.test(l)) return;          // the declaration
  if (!/=== myRun\)/.test(l)) unconditional.push(`line ${i + 1}: ${l.trim().slice(0, 70)}`);
});
check('every clear of _activeAutoedit checks ownership', unconditional.length === 0, unconditional.join(' | '));

// ── 3. every handler that claims the global keeps its own token ─────────────
const setSites = LINES.reduce((a, l, i) => (/_activeAutoedit = myRun;/.test(l) ? a.concat(i + 1) : a), []);
check('all handlers claim the global via a run token', setSites.length === 4, `found ${setSites.length}`);
const tokenDecls = (SRC.match(/const myRun = \{ children: new Set\(\), aborted: false \};/g) || []).length;
check('each claiming handler declares its own token', tokenDecls === setSites.length,
      `${tokenDecls} tokens vs ${setSites.length} claims`);

// ── 4. bodies are parsed through the object guard ───────────────────────────
// JSON.parse('null') returns null; dereferencing it throws inside the 'end'
// callback, so the response is never written and the request hangs.
const allParses = LINES.filter(l => /JSON\.parse\(body\)/.test(l));
const insideHelper = LINES.filter((l, i) =>
  /JSON\.parse\(body\)/.test(l) && /function parseObjBody/.test(LINES[i - 1] || ''));
check('the only JSON.parse(body) in the file is the guard itself',
      allParses.length === 1 && insideHelper.length === 1,
      `${allParses.length} total, ${insideHelper.length} inside parseObjBody`);
check('endpoints go through parseObjBody',
      (SRC.match(/parseObjBody\(body\)/g) || []).length >= 13);

// ── 4b. a cancel handle that is never assigned is a dead cancel button ─────
// /autocut-cancel kills whatever sits in _activeAutocut. For a long time the
// only write to it was `= null`, so the check never fired: Cancel reported
// success while the claude subprocess kept running against the user's plan.
for (const [handle, killer] of [['_activeAutocut', '/autocut-cancel'],
                                ['_activeAutoedit', '/autoedit-cancel']]) {
  const writes = LINES.filter(l => new RegExp(`${handle} = (?!null)`).test(l)
                                   && !new RegExp(`^\\s*let ${handle}`).test(l));
  check(`${handle} is actually assigned, so ${killer} can kill something`,
        writes.length > 0, 'only ever cleared, never set');
}

// ── 5. the parallel pool must not re-read the queue while starting workers ──
// Workers shift a task off before their first await, so re-reading queue.length
// in the loop condition let already-started workers shrink the target count.
check('worker count is computed before any worker starts',
      /const workerCount = Math.min\(/.test(SRC) && !/w < Math\.min\(MAX_INFLIGHT, queue\.length\)/.test(SRC));

// ── 6. behavioural proof of the token pattern ──────────────────────────────
function simulate(useToken) {
  let shared = null;
  const start = () => {
    const mine = { aborted: false, children: new Set() };
    shared = mine;
    return {
      readAbort: () => (useToken ? mine.aborted : shared.aborted),   // throws on null when shared
      finish:    () => { if (!useToken || shared === mine) shared = null; },
    };
  };
  const a = start();          // long run begins
  const b = start();          // user clicks Change on an earlier graphic
  b.finish();                 // the short one lands first
  try { a.readAbort(); return 'ok'; } catch (e) { return 'threw'; }
}
check('shared-global pattern throws when the other handler finishes first', simulate(false) === 'threw');
check('run-token pattern survives the same interleaving', simulate(true) === 'ok');

console.log(bad.length ? bad.map(b => '  FAIL  ' + b).join('\n') : '  all bridge invariants hold');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
