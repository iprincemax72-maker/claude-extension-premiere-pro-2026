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
