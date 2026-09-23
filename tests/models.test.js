#!/usr/bin/env node
/**
 * The model picker is built from what the CLIs report, not a typed list.
 *
 * The bug this exists for: the picker was hand-written, so it kept saying
 * "Opus 5" after Opus 5.5 shipped even though the 'opus' alias had already
 * moved on. These checks pin down the parts that make it keep up on its own:
 *
 *   - names come from the CLI ("Opus 5.5"), and the newest of each family is
 *     picked by alias so it moves with the next release
 *   - the version before the newest stays pickable by its pinned id, and a new
 *     release pushes the old newest into that slot
 *   - retiring and hidden GPT models are dropped
 *   - the allowlist accepts a model that ships later, and nothing else
 *
 * Run:  node tests/models.test.js
 */
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

const SRC = fs.readFileSync(path.join(__dirname, '..', 'bridge', 'bridge.js'), 'utf8');
const consts = ['CLAUDE_ALIASES', 'MODELS_SEED'].map(n => {
  const m = new RegExp('const ' + n + ' = [\\s\\S]*?\\];').exec(SRC);
  if (!m) throw new Error('const not found: ' + n);
  return m[0];
}).join('\n');
const fns = ['modelName', 'cmpVer', 'buildClaudeModels', 'buildGptModels', 'isAllowedModel', 'isGptModel']
  .map(n => extractFn(SRC, n)).join('\n');
const M = new Function(consts + '\n' + fns + '\nreturn { buildClaudeModels, buildGptModels, isAllowedModel, cmpVer };')();

let pass = 0, fail = 0;
const bad = [];
function check(name, ok, detail) {
  if (ok) pass++; else { fail++; bad.push(name + (detail ? '  — ' + detail : '')); }
}

// What claude 2.1.280 answered on the day Opus 5.5 shipped.
const CLI = [
  { value: 'default', resolvedModel: 'claude-opus-5-5[1m]', description: 'Opus 5.5 with 1M context · Best for everyday, complex tasks' },
  { value: 'opus[1m]', resolvedModel: 'claude-opus-5-5[1m]', description: 'Opus 5.5 with 1M context · Best for everyday, complex tasks' },
  { value: 'claude-fable-5-1[1m]', resolvedModel: 'claude-fable-5-1', description: 'Fable 5.1 · Most capable for your hardest and longest-running tasks' },
  { value: 'sonnet', resolvedModel: 'claude-sonnet-5', description: 'Sonnet 5 · Efficient for routine tasks' },
  { value: 'haiku', resolvedModel: 'claude-haiku-4-5-20251001', description: 'Haiku 4.5 · Fastest for quick answers' },
];

const a = M.buildClaudeModels(CLI, {});
const names = a.list.map(m => m.name);
check('versions come from the CLI', JSON.stringify(names) === JSON.stringify(['Opus 5.5', 'Opus 5', 'Fable 5.1', 'Fable 5', 'Sonnet 5', 'Haiku 4.5']), names.join(', '));
check('the newest goes by alias so it keeps moving', a.list.filter(m => m.newest).map(m => m.value).join() === 'opus,fable,sonnet,haiku');
check('the previous version is pinned', a.list.find(m => m.name === 'Opus 5').value === 'claude-opus-5'
      && a.list.find(m => m.name === 'Fable 5').value === 'claude-fable-5');
check('the default row is not listed twice', a.list.filter(m => m.name === 'Opus 5.5').length === 1);
check('descriptions keep only the blurb', a.list[0].desc === 'Best for everyday, complex tasks', a.list[0].desc);
check('the newest ids are remembered', a.seen['claude-opus-5-5'] === 'Opus 5.5' && a.seen['claude-fable-5-1'] === 'Fable 5.1');

// A month later Opus 6 ships. Nothing in the code changes.
const later = CLI.map(m => m.value === 'opus[1m]'
  ? { value: 'opus[1m]', resolvedModel: 'claude-opus-6[1m]', description: 'Opus 6 with 1M context · Best for everyday, complex tasks' } : m);
const b = M.buildClaudeModels(later, a.seen);
const opus = b.list.filter(m => m.value === 'opus' || /^claude-opus/.test(m.value));
check('a new release shows up on its own', opus[0].name === 'Opus 6' && opus[0].value === 'opus', JSON.stringify(opus));
check('the old newest becomes the pinned previous', opus[1] && opus[1].name === 'Opus 5.5' && opus[1].value === 'claude-opus-5-5', JSON.stringify(opus));
check('only one previous version per family', opus.length === 2, JSON.stringify(opus));

check('a failed or empty answer builds nothing', M.buildClaudeModels(null, {}).list.length === 0);
check('versions compare as numbers', M.cmpVer('5.10', '5.9') > 0 && M.cmpVer('5', '5.0') === 0 && M.cmpVer('4.5', '5') < 0);

// codex's catalog, trimmed
const GPT = [
  { slug: 'gpt-5.6-luna', display_name: 'GPT-5.6-Luna', description: 'Older fast and efficient model.', visibility: 'list', priority: 8, upgrade: null },
  { slug: 'gpt-6-astra', display_name: 'GPT-6-Astra', description: 'Frontier intelligence for the most demanding work.', visibility: 'list', priority: 1, upgrade: null },
  { slug: 'gpt-reserve', display_name: 'GPT-Reserve', visibility: 'hide', priority: 3, upgrade: null },
  { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list', priority: 12, upgrade: { model: 'gpt-5.6-sol' } },
  { slug: 'codex-auto-review', display_name: 'Codex Auto Review', visibility: 'hide', priority: 43, upgrade: null },
];
const g = M.buildGptModels(GPT);
check('GPT keeps listed, non-retiring models in catalog order', g.map(m => m.value).join() === 'gpt-6-astra,gpt-5.6-luna', g.map(m => m.value).join());
check('GPT names read like the product', g[0].name === 'GPT-6 Astra' && g[1].name === 'GPT-5.6 Luna', g.map(m => m.name).join());

for (const m of ['opus', 'fable', 'claude-opus-5', 'claude-opus-5-5', 'claude-opus-6', 'claude-haiku-4-5-20251001', 'gpt-6-astra', 'gpt-5.6-sol', 'gpt-7'])
  check('allows ' + m, M.isAllowedModel(m));
for (const m of ['', 'auto', '--dangerously-skip-permissions', 'opus; rm -rf ~', 'claude-opus-5 x', 'gpt-6 astra', null, 5, 'x'.repeat(80)])
  check('refuses ' + JSON.stringify(m).slice(0, 30), !M.isAllowedModel(m));

console.log(bad.length ? bad.map(b => '  FAIL  ' + b).join('\n') : '  all model checks passed');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
