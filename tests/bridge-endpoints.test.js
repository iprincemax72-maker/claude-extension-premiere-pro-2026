#!/usr/bin/env node
/**
 * Bridge endpoint robustness.
 *
 * The bug this exists for: every endpoint did `JSON.parse(body)` and then read
 * properties off the result. `JSON.parse('null')` succeeds and returns null, so
 * that read throws — and it throws inside a req 'end' callback, where the throw
 * goes to process.uncaughtException rather than the endpoint's own catch. The
 * bridge stays up, but the response is never written, so the request hangs
 * until the client gives up. In the panel that is a spinner that spins forever
 * and never shows an error.
 *
 * A hang is worse than a 500 here: nothing is logged as a failure and the only
 * escape is the abort controller.
 *
 * Needs a bridge on :3737. Skips cleanly when there isn't one, so it can live
 * in the normal suite.
 *
 * Run:  node tests/bridge-endpoints.test.js
 */
const BRIDGE = process.env.BRIDGE || 'http://127.0.0.1:3737';
const TIMEOUT_MS = 8000;

const ENDPOINTS = ['/expand', '/complete', '/autoedit/run', '/autoedit/analyze', '/captions', '/chat'];
// Valid JSON that is not an object. `null` is the one that throws on deref;
// the rest are here so a future "fix" that only special-cases null still fails.
const HOSTILE = ['null', '[]', '123', '"a string"', 'true', '{}'];

let pass = 0, fail = 0;
const bad = [];

function check(name, ok, detail) {
  if (ok) { pass++; } else { fail++; bad.push(`${name}${detail ? '  — ' + detail : ''}`); }
}

async function post(path, raw, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || TIMEOUT_MS);
  try {
    const r = await fetch(BRIDGE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw,
      signal: ctl.signal,
    });
    return r.status;
  } catch (e) {
    return (e && e.name === 'AbortError') ? 'HANG' : 'ERR';
  } finally { clearTimeout(timer); }
}

async function reachable() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(BRIDGE + '/ping', { signal: ctl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

(async () => {
  if (!await reachable()) {
    console.log('  skip  bridge not running on ' + BRIDGE + ' — start it to run these');
    console.log('\n0 passed, 0 failed, 1 skipped');
    return;
  }

  for (const ep of ENDPOINTS) {
    for (const raw of HOSTILE) {
      const status = await post(ep, raw);
      check(`${ep} answers ${raw}`, status !== 'HANG', `got ${status}`);
    }
    // Malformed JSON must still be rejected, not swallowed into an empty payload.
    const s = await post(ep, '{"prompt":');
    check(`${ep} rejects malformed JSON`, s === 400 || s === 404, `got ${s}`);
  }

  // The render index is what makes a render survive the panel closing.
  {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    let ok = false, shaped = false;
    try {
      const r = await fetch(BRIDGE + '/renders/recent?n=5', { signal: ctl.signal });
      ok = r.status === 200;
      const d = await r.json();
      shaped = !!d && d.ok === true && Array.isArray(d.renders)
               && d.renders.every(x => x && typeof x.file === 'string');
    } catch {} finally { clearTimeout(t); }
    check('/renders/recent answers 200', ok);
    check('/renders/recent returns {ok, renders:[{file}]}', shaped);
  }

  // The guard must not have broken the happy path. This one spawns the CLI, so
  // it needs a real timeout — the 8s hostile-payload budget is for replies that
  // should be immediate.
  const ok = await post('/expand', JSON.stringify({ prompt: 'a lower third with my name', level: 'light' }), 90000);
  check('/expand still serves a real request', ok === 200, `got ${ok}`);

  console.log(bad.length ? bad.map(b => '  FAIL  ' + b).join('\n') : '  all endpoint checks passed');
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
