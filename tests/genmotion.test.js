#!/usr/bin/env node
/**
 * GenMotion integration: the parts that touch the filesystem.
 *
 * GenMotion has no headless render and no public API, so Flimify reads its
 * projects off disk and watches for new exports. Two behaviours are worth
 * pinning down:
 *
 *   - listGenmotionProjects copes with whatever is in the projects folder
 *     (half-made folders, a corrupt project.json, nothing exported yet) and puts
 *     the newest export first, because that is the file Import hands to Premiere.
 *   - watchGenmotionExports announces a new MP4 once, and only after it stops
 *     growing. The encoder writes progressively, so announcing on the first fs
 *     event would import a truncated clip.
 *
 * Runs against a temp directory, never the real ~/.genmotion/projects.
 *
 * Run:  node tests/genmotion.test.js
 */
const fs = require('fs');
const os = require('os');
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
const CODE = extractFn(SRC, 'listGenmotionProjects') + '\n' + extractFn(SRC, 'watchGenmotionExports')
  + '\nreturn { listGenmotionProjects, watchGenmotionExports };';

let pass = 0, fail = 0;
const bad = [];
function check(name, ok, detail) {
  if (ok) pass++; else { fail++; bad.push(name + (detail ? '  — ' + detail : '')); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-test-'));
  const { listGenmotionProjects, watchGenmotionExports } =
    (new Function('fs', 'path', 'os', 'GENMOTION_PROJECTS', CODE))(fs, path, os, root);

  const mk = (name, projectJson, exportsList, thumb, jsonMtimeSec) => {
    const d = path.join(root, name);
    fs.mkdirSync(path.join(d, 'exports'), { recursive: true });
    if (projectJson !== undefined) {
      const pj = path.join(d, 'project.json');
      fs.writeFileSync(pj, typeof projectJson === 'string' ? projectJson : JSON.stringify(projectJson));
      if (jsonMtimeSec) fs.utimesSync(pj, jsonMtimeSec, jsonMtimeSec);
    }
    for (const [n, t] of (exportsList || [])) {
      const f = path.join(d, 'exports', n);
      fs.writeFileSync(f, 'x');
      fs.utimesSync(f, t, t);
    }
    if (thumb) {
      fs.mkdirSync(path.join(d, '.genmotion'), { recursive: true });
      fs.writeFileSync(path.join(d, '.genmotion', 'thumbnail.jpg'), 'j');
    }
  };

  mk('ad', { name: 'Drop Notch ad', fps: 30, width: 1920, height: 1080,
             scenes: [{ durationInFrames: 85 }, { durationInFrames: 115 }, { durationInFrames: 100 }] },
     [['old.mp4', 1000], ['new.mp4', 2000], ['notes.txt', 3000]], true, 5000);
  mk('noname', { fps: 25, scenes: [{ durationInFrames: 50 }] }, [], false, 3000);
  mk('corrupt', '{ not json');
  mk('nojson', undefined);
  fs.mkdirSync(path.join(root, 'noexportsdir'));
  fs.writeFileSync(path.join(root, 'noexportsdir', 'project.json'), JSON.stringify({ name: 'Bare' }));
  fs.utimesSync(path.join(root, 'noexportsdir', 'project.json'), 4000, 4000);

  const list = listGenmotionProjects();
  const byId = Object.fromEntries(list.map(p => [p.id, p]));
  const ad = byId.ad || {};
  check('only folders with a readable project.json are listed',
        list.length === 3 && !byId.corrupt && !byId.nojson, list.map(p => p.id).join(','));
  check('the newest export comes first', ad.exports && ad.exports[0] && ad.exports[0].name === 'new.mp4',
        JSON.stringify(ad.exports && ad.exports.map(e => e.name)));
  check('non-mp4 files in exports/ are ignored', ad.exports && ad.exports.length === 2);
  check('duration comes from scene frames over fps', ad.durationSec === 10, String(ad.durationSec));
  check('scene count and frame size are carried', ad.scenes === 3 && ad.width === 1920 && ad.height === 1080);
  check('the thumbnail is found', !!ad.thumbnail && ad.thumbnail.endsWith(path.join('.genmotion', 'thumbnail.jpg')));
  check('the name falls back to the folder name', (byId.noname || {}).name === 'noname');
  check('a project with no exports folder still lists with none',
        !!byId.noexportsdir && Array.isArray(byId.noexportsdir.exports) && byId.noexportsdir.exports.length === 0);
  check('the most recently touched project sorts first',
        list.map(p => p.id).join(',') === 'ad,noexportsdir,noname', list.map(p => p.id).join(','));

  const announced = [];
  const w = watchGenmotionExports(root, f => announced.push(f), 200);
  check('the watcher starts on an existing projects folder', !!w);
  await sleep(400);
  check('exports that already existed are not announced', announced.length === 0, announced.join(','));

  const target = path.join(root, 'ad', 'exports', 'fresh.mp4');
  const fd = fs.openSync(target, 'w');
  fs.writeSync(fd, Buffer.alloc(1024));
  await sleep(250);
  check('a file still being written is not announced yet', announced.length === 0, announced.join(','));
  fs.writeSync(fd, Buffer.alloc(4096));
  await sleep(250);
  fs.writeSync(fd, Buffer.alloc(4096));
  fs.closeSync(fd);
  await sleep(1600);
  check('a finished export is announced', announced.includes(target), announced.join(','));
  check('it is announced exactly once', announced.filter(f => f === target).length === 1, announced.join(','));

  fs.writeFileSync(path.join(root, 'ad', 'exports', 'readme.txt'), 'x');
  fs.writeFileSync(path.join(root, 'ad', 'stray.mp4'), 'x');
  await sleep(1000);
  check('non-mp4 files and mp4s outside exports/ are ignored', announced.length === 1, announced.join(','));
  w.close();

  check('a missing projects folder returns null', watchGenmotionExports(path.join(root, 'nope'), () => {}, 200) === null);
  fs.rmSync(root, { recursive: true, force: true });

  console.log(bad.length ? bad.map(b => '  FAIL  ' + b).join('\n') : '  all GenMotion checks passed');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
