#!/usr/bin/env python3
"""Panel behaviour regressions — bugs that a static read of index.html misses.

Each case here is a bug that actually shipped. They all share a shape: the panel
writes over state the user owns (their draft, their tab, their picks) at a moment
the user did not ask for it. None of them throw, so the console stays clean and
the contrast/audit passes stay green while the feature quietly eats your work.

Run:  python3 tests/panel-behavior.py
"""
import asyncio, pathlib, sys

PANEL = pathlib.Path(__file__).parent.parent / "extension" / "com.claudebridge.panel" / "index.html"

SENTENCES = [{"i": i, "startSec": i * 3.0, "text": f"Sentence {i} of the transcript."}
             for i in range(6)]

# The guard lives in the expand handler; keep this in sync with it.
GUARD_JS = r"""(s) => /^\s*(i(?:'| a)?m? |i'd |could you|can you|what |which |to write|before i)/i.test(s)
                && s.indexOf('?') > -1 && s.indexOf('?') < 400"""

fails = []


def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        fails.append(name)


async def run(pg):
    # ---- queue drain must not clobber a half-typed prompt --------------------
    # The queue drains the instant a render finishes. Staging the queued prompt
    # in the composer first wipes whatever the user is mid-way through typing.
    res = await pg.evaluate("""() => {
      const sent = []; const real = window.sendMessage;
      window.sendMessage = (m) => { sent.push(typeof m === 'string' ? m : '<composer>'); };
      input.value = 'my half typed prompt';
      const t = tabs[activeTabIdx];
      if (t) t.queue = [{ id: 'q1', msg: 'the queued prompt' }];
      try { _maybeDrainQueue(t); } catch (e) { window.sendMessage = real; return { err: String(e) }; }
      const out = { sent, composer: input.value };
      window.sendMessage = real; return out;
    }""")
    check("queue drain keeps the user's draft",
          res.get("composer") == "my half typed prompt", f"composer={res.get('composer')!r}")
    check("queue drain passes the prompt directly",
          res.get("sent") == ["the queued prompt"], f"sent={res.get('sent')!r}")

    # ---- expand must not replace the prompt with a clarifying question -------
    # Assigning to .value also wipes the textarea's native undo stack, so a bad
    # expansion is unrecoverable.
    bad = ["I need a few specifics to write a decisive brief:\n\n1. What's the video about?",
           "Could you tell me which dish this is for? And what tone?"]
    good = ["A title card built on one idea: the dish assembling itself from its parts.",
            "A title card for my cooking video that fades in over the shot.",
            "Ingredients converge into the title. What lands first is the hero line?"]
    for s in bad:
        check(f"expand rejects clarifying output: {s[:34]!r}",
              await pg.evaluate(f"(s)=>({GUARD_JS})(s)", s))
    for s in good:
        check(f"expand accepts a real rewrite: {s[:34]!r}",
              not await pg.evaluate(f"(s)=>({GUARD_JS})(s)", s))

    # ---- transcript opens as its own tab, and gives the old one back --------
    await pg.evaluate("() => { newTab(); newTab(); switchTab(0); }")
    await pg.wait_for_timeout(150)
    origin = await pg.evaluate("() => tabs[activeTabIdx].id")
    n_before = await pg.evaluate("() => tabs.length")
    await pg.evaluate("(s) => { aeWizard = { picks:new Set(), questions:[], answers:{} }; return txShow(s, []); }",
                      SENTENCES)
    await pg.wait_for_timeout(220)
    check("transcript opens in its own tab",
          await pg.evaluate("() => tabs.some(t => t.type === 'transcript')"))
    check("transcript does not hijack an existing tab",
          await pg.evaluate("() => tabs.length") == n_before + 1)
    check("composer hidden while the transcript is up",
          not await pg.is_visible(".composer"))

    # picks must survive switching away and back — they live on aeWizard, not the DOM
    await pg.evaluate("() => { aeWizard.picks = new Set([1,3]); txSync(); }")
    await pg.evaluate("() => switchTab(0)")
    await pg.wait_for_timeout(200)
    check("log returns when you switch off the transcript",
          await pg.evaluate("() => log.style.display !== 'none'"))
    ti = await pg.evaluate("() => tabs.findIndex(t => t.type === 'transcript')")
    await pg.evaluate(f"() => switchTab({ti})")
    await pg.wait_for_timeout(200)
    check("picks survive switching away and back",
          await pg.locator("#txBody .tx-s.on").count() == 2)

    # Renders stream into whatever tab is active when the run starts, so closing
    # the transcript must land on the tab Auto-Edit was started from — not just
    # the last tab in the strip.
    await pg.evaluate("() => txHide()")
    await pg.wait_for_timeout(220)
    check("closing the transcript returns to the tab it started from",
          await pg.evaluate("() => tabs[activeTabIdx].id") == origin)
    check("transcript tab is cleaned up",
          await pg.evaluate("() => tabs.every(t => t.type !== 'transcript')"))
    check("composer comes back", await pg.is_visible(".composer"))

    # closing the tab by hand must not strand the view over a normal tab
    await pg.evaluate("(s) => { aeWizard = { picks:new Set() }; return txShow(s, []); }", SENTENCES)
    await pg.wait_for_timeout(200)
    ti = await pg.evaluate("() => tabs.findIndex(t => t.type === 'transcript')")
    await pg.evaluate(f"() => closeTab({ti})")
    await pg.wait_for_timeout(220)
    check("closing the transcript tab by hand hides the view",
          not await pg.is_visible("#txView"))

    # ---- re-wiring the captions progress feed must not orphan the old one ---
    # Captions wire this twice per session (transcribe, then create). If the
    # first one's 'done' never lands, overwriting capState.es left it connected
    # and still calling capSetProgress, so a stale run drove the new run's bar.
    es = await pg.evaluate("""() => {
      const live = new Set(); const Real = window.EventSource;
      window.EventSource = function (url) {
        const e = new Real(url); live.add(e);
        const rc = e.close.bind(e); e.close = () => { live.delete(e); rc(); };
        return e;
      };
      window.EventSource.prototype = Real.prototype;
      capWireProgressES('req-1');
      capWireProgressES('req-2');          // no 'done' in between
      const n = live.size;
      for (const e of [...live]) { try { e.close(); } catch (_) {} }
      window.EventSource = Real;
      return n;
    }""")
    check("re-wiring the captions feed closes the previous one", es == 1, f"{es} live EventSources")

    # ---- a prompt that renders nothing must still be kept -------------------
    # History was written only inside the loop over rendered files, so a run
    # that was blocked (out of disk), errored, or answered with a question left
    # no trace. Closing Premiere closes the panel, so that text was gone.
    h = await pg.evaluate("""() => {
      history.length = 0;
      addHistoryEntry({ prompt: 'a prompt that never rendered', path: '', reply: 'blocked' });
      const one = history.length;
      addHistoryEntry({ prompt: 'a prompt that never rendered', path: '', reply: 'blocked' });
      const dup = history.length;
      addHistoryEntry({ prompt: '   ', path: '' });
      const blank = history.length;
      addHistoryEntry({ prompt: 'a real render', path: '/tmp/x.mp4', mode: '', reply: 'ok' });
      saveHistory();
      return { one, dup, blank, total: history.length, kinds: history.map(x => x.kind) };
    }""")
    check("a prompt with no render is kept", h["one"] == 1, str(h))
    check("retrying the same prompt does not stack", h["dup"] == 1, str(h))
    check("a blank prompt is still ignored", h["blank"] == 1, str(h))
    check("file-backed history still works", h["total"] == 2 and "video" in h["kinds"], str(h))

    await pg.reload()
    await pg.wait_for_timeout(900)
    kept = await pg.evaluate("() => history.filter(x => x.kind === 'prompt').length")
    check("the prompt survives a panel reload", kept == 1, f"{kept} kept")

    # ---- model + effort pickers ---------------------------------------------
    # The model list must carry BOTH families, and effort must survive a bogus
    # value rather than sticking on it (both CLIs ignore an unknown level, so a
    # bad one would silently mean "default" while the UI claimed otherwise).
    models = await pg.evaluate("() => [...document.querySelectorAll('#modelMenu .mdl-opt')].map(o => o.dataset.model)")
    check("claude aliases offered", all(m in models for m in ["opus", "sonnet", "haiku", "fable"]), str(models))
    check("gpt models offered", all(m in models for m in
          ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]), str(models))
    check("no retired models offered",
          not any(m in models for m in ["claude-opus-4-8", "gpt-4", "gpt-4o", "o3", "gpt-5"]), str(models))

    efforts = await pg.evaluate("() => [...document.querySelectorAll('#effortMenu .eff-opt')].map(o => o.dataset.effort)")
    check("effort levels match both CLIs",
          efforts == ["auto", "low", "medium", "high", "xhigh", "max"], str(efforts))

    eff = await pg.evaluate("""() => {
      const out = {};
      for (const x of ['max', 'low', '__bogus__']) { setEffort(x); out[x] = userSettings.effort; }
      setGenModel('gpt-6-astra'); out.gptLabel = MODEL_LABELS[userSettings.model];
      return out;
    }""")
    check("effort sticks", eff["max"] == "max" and eff["low"] == "low", str(eff))
    check("bogus effort falls back to auto", eff["__bogus__"] == "auto", str(eff))
    check("gpt model labels correctly", eff["gptLabel"] == "GPT-6 Astra", str(eff))

    await pg.click("#effortBtn")
    await pg.wait_for_timeout(200)
    check("effort menu opens", await pg.is_visible("#effortMenu .eff-opt"))
    await pg.click("#effortMenu .eff-opt[data-effort='high']")
    await pg.wait_for_timeout(200)
    check("picking an effort applies it",
          await pg.evaluate("() => userSettings.effort") == "high")

    # ---- GenMotion menu ------------------------------------------------------
    # GenMotion has no headless API, so the menu is launch, projects and imports.
    # Import must hand Premiere the NEWEST export and record it in history, and a
    # project name from disk must render as text rather than markup.
    gm = await pg.evaluate("""async () => {
      const btn = document.getElementById('genmotionBtn');
      if (!btn) return { err: 'no button' };
      btn.hidden = false;
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (String(url).endsWith('/genmotion/projects')) {
          return new Response(JSON.stringify({ ok: true, installed: true, projects: [
            { id: 'a', name: 'Drop Notch <ad>', dir: '/tmp/a', fps: 30, width: 1920, height: 1080,
              scenes: 3, durationSec: 10, thumbnail: '', updatedAt: 2, exports: [
                { file: '/tmp/a/exports/new.mp4', name: 'new.mp4', size: 9, mtime: 2 },
                { file: '/tmp/a/exports/old.mp4', name: 'old.mp4', size: 9, mtime: 1 } ] },
            { id: 'b', name: 'Unexported', dir: '/tmp/b', fps: 30, width: 0, height: 0,
              scenes: 1, durationSec: 2, thumbnail: '', updatedAt: 1, exports: [] } ] }), { status: 200 });
        }
        return realFetch(url, opts);
      };
      const realImport = window.importIntoPremiere, realHist = window.addHistoryEntry;
      const calls = [], hist = [];
      window.importIntoPremiere = async (file) => { calls.push(file); return { ok: true }; };
      window.addHistoryEntry = (e) => { hist.push(e.prompt); };
      btn.click();
      await new Promise(r => setTimeout(r, 300));
      const pop = document.querySelector('.gm-pop');
      const rows = pop ? pop.querySelectorAll('.gm-proj').length : 0;
      const nameEl = pop && pop.querySelector('.gm-name');
      const asText = !!nameEl && nameEl.textContent.includes('<ad>') && !pop.querySelector('ad');
      const imps = pop ? [...pop.querySelectorAll('.gm-imp')] : [];
      const unexportedDisabled = imps[1] ? imps[1].disabled : null;
      if (imps[0]) imps[0].click();
      await new Promise(r => setTimeout(r, 200));
      window.fetch = realFetch;
      window.importIntoPremiere = realImport;
      window.addHistoryEntry = realHist;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      return { rows, asText, unexportedDisabled, calls, hist };
    }""")
    check("GenMotion menu lists projects", gm.get("rows") == 2, str(gm))
    check("GenMotion project names render as text, not markup", gm.get("asText") is True, str(gm))
    check("Import is disabled for a project with no export", gm.get("unexportedDisabled") is True, str(gm))
    check("Import hands Premiere the newest export", gm.get("calls") == ["/tmp/a/exports/new.mp4"], str(gm))
    check("an imported GenMotion clip lands in history", gm.get("hist") == ["GenMotion · Drop Notch <ad>"], str(gm))

    # ---- GenMotion as an engine -----------------------------------------------
    # GenMotion takes no prompt from outside, so a send on its engine must never
    # reach /chat. It opens the app with the prompt, keeps the prompt in History
    # while it waits, and turns the next export into a normal render card.
    ge = await pg.evaluate("""async () => {
      const opt = document.querySelector('#engineMenu .eng-opt[data-engine="genmotion"]');
      if (!opt) return { err: 'no engine option' };
      opt.hidden = true;
      const hiddenWhenMissing = getComputedStyle(opt).display === 'none';
      setEngine('genmotion');
      const refusedWhenMissing = tabs[activeTabIdx].engine === 'remotion';
      opt.hidden = false;
      setEngine('genmotion');
      const label = document.getElementById('engineLabel').textContent;
      const realFetch = window.fetch;
      const posts = [];
      window.fetch = async (url, opts) => {
        const u = String(url);
        if (u.endsWith('/genmotion/open') || u.endsWith('/chat')) {
          posts.push({ u: u.endsWith('/chat') ? '/chat' : '/genmotion/open', body: JSON.parse(opts.body) });
          return new Response(JSON.stringify({ ok: true, shared: null, copied: true }), { status: 200 });
        }
        return realFetch(url, opts);
      };
      const prompt = 'a neon lower third ' + Date.now();
      input.value = prompt;
      try { await sendMessage(); } finally { window.fetch = realFetch; }
      const promptKept = history.some(h => h && h.kind === 'prompt' && h.prompt === prompt);
      const file = '/tmp/gm-test/exports/neon.mp4';
      window.genmotion.onExport({ file, name: 'neon.mp4', project: 'Neon' });
      await new Promise(r => setTimeout(r, 100));
      const cardShown = !!document.querySelector('.render-preview[data-render-path="' + file + '"]');
      const fileEntry = history.some(h => h && h.path === file && h.prompt === prompt);
      const promptGone = !history.some(h => h && h.kind === 'prompt' && h.prompt === prompt);
      setEngine('remotion');
      opt.hidden = true;
      return { hiddenWhenMissing, refusedWhenMissing, label, posts, promptKept, cardShown, fileEntry, promptGone, prompt };
    }""")
    check("GenMotion engine option is hidden without GenMotion", ge.get("hiddenWhenMissing") is True, str(ge))
    check("GenMotion engine can't be picked without GenMotion", ge.get("refusedWhenMissing") is True, str(ge))
    check("GenMotion engine can be picked when installed", ge.get("label") == "GenMotion", str(ge))
    check("a GenMotion send opens GenMotion with the prompt and never renders",
          ge.get("posts") == [{"u": "/genmotion/open", "body": {"prompt": ge.get("prompt")}}], str(ge))
    check("the GenMotion prompt is kept in History while waiting", ge.get("promptKept") is True, str(ge))
    check("the next GenMotion export shows up as a render card", ge.get("cardShown") is True, str(ge))
    check("the export replaces the waiting prompt in History",
          ge.get("fileEntry") is True and ge.get("promptGone") is True, str(ge))

    # ---- the header fits a narrow dock ----------------------------------------
    # The header's right-hand controls never shrink or wrap, so adding the
    # GenMotion button pushed the account button and status pill off the edge at
    # 430px. And `hidden` did not hide the button at all, because .icon-btn sets
    # display and that beats the browser's default [hidden] rule, so it showed for
    # everyone without GenMotion.
    hid = await pg.evaluate("""() => {
      const gm = document.getElementById('genmotionBtn');
      const was = gm.hidden;
      gm.hidden = true;
      const d = getComputedStyle(gm).display;
      gm.hidden = was;
      return d;
    }""")
    check("the GenMotion button really hides when GenMotion is not installed", hid == "none", f"display={hid}")
    for w in (430, 520):
        await pg.set_viewport_size({"width": w, "height": 900})
        await pg.wait_for_timeout(150)
        fit = await pg.evaluate("""() => {
          document.getElementById('genmotionBtn').hidden = false;
          const group = document.getElementById('historyBtn').parentElement;
          const vis = [...group.children].filter(k => getComputedStyle(k).display !== 'none'
                                                    && k.getBoundingClientRect().width > 0);
          const off = vis.filter(k => k.getBoundingClientRect().right > innerWidth + 1).map(k => k.id);
          return { right: Math.round(vis[vis.length - 1].getBoundingClientRect().right), vw: innerWidth, off };
        }""")
        check(f"the header fits at {w}px with GenMotion shown", not fit["off"], str(fit))
    await pg.set_viewport_size({"width": 460, "height": 900})
    await pg.wait_for_timeout(100)

    # ---- transcript text is data, not markup --------------------------------
    await pg.evaluate("""(s) => { aeWizard = { picks:new Set() }; return txShow(s, []); }""",
                      [{"i": 0, "startSec": 0, "text": '<img src=x onerror="window.__pwned=1">'}])
    await pg.wait_for_timeout(150)
    check("transcript text cannot inject markup",
          not await pg.evaluate("() => !!window.__pwned"))

    # ---- render estimate must track the bridge's real parallel cap ----------
    bridge = (pathlib.Path(__file__).parent.parent / "bridge" / "bridge.js").read_text()
    cap = None
    for line in bridge.splitlines():
        if "PARALLEL_CAP =" in line:
            cap = "".join(ch for ch in line.split("=")[1] if ch.isdigit())
            break
    panel = PANEL.read_text()
    check("panel's render estimate matches bridge PARALLEL_CAP",
          bool(cap) and f"n / {cap}" in panel, f"cap={cap}")


async def main():
    from playwright.async_api import async_playwright
    errs = []
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await b.new_page(viewport={"width": 460, "height": 900})
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(PANEL.as_uri())
        await pg.wait_for_timeout(900)
        await run(pg)
        await b.close()
    check("no uncaught page errors", not errs, str(errs[:2]))
    print(f"\n{'FAILED: ' + ', '.join(fails) if fails else 'all behaviour checks passed'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
