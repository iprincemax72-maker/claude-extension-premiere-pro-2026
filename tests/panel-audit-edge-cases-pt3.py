"""Pass 3 — meaner edge cases beyond pt2. Tests:
  • Unicode-heavy history rows (emoji, CJK, RTL, combining marks) render and remain interactable
  • Narrow viewport 600x600 — does the chat scaffold stay usable
  • Wide viewport 2560x1440 — chips don't stretch grotesquely
  • localStorage corruption (invalid JSON) — panel should not white-screen
  • localStorage with 100 history rows — open History panel under load
  • Rapid double-click on settings button (race: doesn't open and close in the same tick)
  • Esc during confirm modal — modal closes, panel stays
  • Composer focus survives history-panel toggle
  • New tab button + close-all-but-one keeps the LAST tab active (not orphan)
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

PANEL = "file:///Users/anshdhakad/Library/Application%20Support/Adobe/CEP/extensions/com.claudebridge.panel/index.html"
OUT = "/tmp/panel-audit-overnight-pt3"
os.makedirs(OUT, exist_ok=True)

REPORT = []
def r(sev, area, msg):
    REPORT.append((sev, area, msg))
    tag = {"crit": "🔴", "minor": "🟡", "nit": "🔵"}.get(sev, "?")
    print(f"{tag} [{area}] {msg}")


UNICODE_HISTORY = [
    {"id": "u1", "prompt": "logo intro 🚀 with explosion 💥 finale 🔥", "reply": "Built.", "path": "/tmp/nope_u1.mov", "kind": "video", "mode": "overlay", "t": 1},
    {"id": "u2", "prompt": "字幕：未来は今ここに — 縦書き", "reply": "Done.", "path": "/tmp/nope_u2.mov", "kind": "video", "mode": "overlay", "t": 2},
    {"id": "u3", "prompt": "العنوان الرئيسي للحلقة الأولى", "reply": "Card.", "path": "/tmp/nope_u3.mov", "kind": "video", "mode": "overlay", "t": 3},
    {"id": "u4", "prompt": "café निष्काम — combining marks + Devanagari", "reply": "OK.", "path": "/tmp/nope_u4.mov", "kind": "video", "mode": "overlay", "t": 4},
    # A 600-char prompt to stress overflow handling
    {"id": "u5", "prompt": "x" * 600 + " end", "reply": "Long.", "path": "/tmp/nope_u5.mov", "kind": "video", "mode": "overlay", "t": 5},
]


async def viewport_pass(p, label, w, h):
    await p.set_viewport_size({"width": w, "height": h})
    await p.wait_for_timeout(220)
    info = await p.evaluate(
        """() => {
            const c = document.getElementById('chips');
            if (!c) return {missing:true};
            const cs = getComputedStyle(c);
            return {
                display: cs.display,
                cols: (cs.gridTemplateColumns||'').split(' ').length,
                chips: document.querySelectorAll('#chips .chip:not(.chip-line)').length,
                composerH: document.querySelector('.composer-wrap')?.getBoundingClientRect().height,
                inputBlocked: !!document.querySelector('textarea#input')?.disabled,
            };
        }"""
    )
    print(f"  {label}({w}x{h}): {info}")
    await p.screenshot(path=f"{OUT}/{label}-{w}x{h}.png", full_page=False)
    if info.get("composerH", 0) and info["composerH"] < 60:
        r("minor", f"composer-{label}", f"composer height {info['composerH']:.0f}px feels collapsed")
    if info.get("inputBlocked"):
        r("crit", f"input-{label}", "textarea is disabled in this viewport")


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        ctx = await b.new_context(
            viewport={"width": 1480, "height": 1100},
            permissions=["clipboard-read", "clipboard-write"],
        )
        p = await ctx.new_page()
        errs = []
        p.on("pageerror", lambda e: errs.append(("PAGEERROR", str(e))))
        p.on("console", lambda m: m.type == "error" and errs.append(("CONSOLE", m.text)))

        # Seed with unicode + cep_node mock for missing-file detection.
        # The seed only fires on FIRST load — once we set a sentinel,
        # later reloads (corruption test, 100-row test) keep their own state.
        await p.add_init_script(
            f"""
            (function() {{
              try {{
                if (!localStorage.getItem('test-pt3-seeded')) {{
                  localStorage.setItem('claudeBridge.history', {json.dumps(json.dumps(UNICODE_HISTORY))});
                  localStorage.setItem('test-pt3-seeded', '1');
                }}
              }} catch (e) {{}}
              window.cep_node = {{
                require: function(m) {{
                  if (m === 'fs') return {{ existsSync: function() {{ return false; }} }};
                  throw new Error('mock cep_node: ' + m);
                }}
              }};
            }})();
            """
        )
        await p.goto(PANEL)
        await p.wait_for_timeout(2200)

        # 1. Unicode history opens and rows are present
        print("=== unicode history rows ===")
        await p.click("#historyBtn")
        await p.wait_for_timeout(400)
        # The panel merges the bridge's render index into history, so the seeded
        # rows are a subset of what's on screen, not the whole list. What matters
        # is that all 5 unicode rows survived rendering, which is what this case
        # is actually about.
        rows = await p.evaluate("() => document.querySelectorAll('.history-item').length")
        print(f"  rows visible: {rows} (at least 5 seeded)")
        if rows < 5:
            r("crit", "unicode-rows", f"expected at least the 5 seeded rows, got {rows}")
        row_text = await p.evaluate(
            "() => Array.from(document.querySelectorAll('.history-item .h-prompt')).map(e => e.textContent).slice(0,5)"
        )
        for i, t in enumerate(row_text or []):
            print(f"    [{i}] {t[:80]!r}")
        # The 600-char row must not break layout — check that no element is wider than viewport
        oversize = await p.evaluate(
            "() => { const w=window.innerWidth; return Array.from(document.querySelectorAll('.history-item *')).filter(e => e.getBoundingClientRect().right > w + 10).length; }"
        )
        if oversize > 0:
            r("minor", "unicode-overflow", f"{oversize} elements overflow viewport right edge")
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(250)

        # 2. Narrow viewport
        await viewport_pass(p, "narrow", 600, 760)
        # 3. Wide viewport
        await viewport_pass(p, "wide", 2560, 1440)
        # Restore default
        await p.set_viewport_size({"width": 1480, "height": 1100})
        await p.wait_for_timeout(200)

        # 4. localStorage corruption. The init script is sentinel-guarded
        # so it WON'T re-seed unicode history on reload.
        print("\n=== localStorage corruption recovery ===")
        await p.evaluate("() => localStorage.setItem('claudeBridge.history', '{{ this is not json')")
        await p.reload()
        await p.wait_for_timeout(2000)
        # Panel should still mount — check that #input exists
        ok = await p.evaluate("() => !!document.querySelector('textarea#input')")
        if not ok:
            r("crit", "corrupt-history", "panel failed to mount with corrupt history JSON")
        else:
            print("  ✓ panel mounted with corrupt history JSON")
        # Recovery: history button should still work (probably empty)
        await p.click("#historyBtn")
        await p.wait_for_timeout(400)
        post_rows = await p.evaluate("() => document.querySelectorAll('.history-item').length")
        print(f"  history rows after corruption: {post_rows} (acceptable: 0)")
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(250)

        # 5. Load 100 history rows. Init script is sentinel-guarded so
        # the 100 rows will survive the reload.
        print("\n=== 100-row history stress ===")
        big = [
            {"id": f"big{i}", "prompt": f"prompt #{i}", "reply": "Done.", "path": f"/tmp/x{i}.mp4", "kind": "video", "mode": "overlay", "t": i}
            for i in range(100)
        ]
        await p.evaluate(f"() => localStorage.setItem('claudeBridge.history', {json.dumps(json.dumps(big))})")
        await p.reload()
        await p.wait_for_timeout(2000)
        await p.click("#historyBtn")
        await p.wait_for_timeout(800)
        n = await p.evaluate("() => document.querySelectorAll('.history-item').length")
        print(f"  100-row pile rendered as: {n}")
        if n < 50:
            r("minor", "history-100", f"only {n}/100 rows rendered — may be truncated by design but worth noting")
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(250)

        # 6. Double-click settings (race)
        print("\n=== settings double-click race ===")
        await p.click("#settingsBtn")
        await p.wait_for_timeout(40)
        try:
            await p.click("#settingsBtn", timeout=400)
        except Exception:
            pass
        await p.wait_for_timeout(400)
        is_open = await p.evaluate("() => document.getElementById('settingsPanel').classList.contains('show')")
        print(f"  settings open after double-click: {is_open}")
        # Acceptable: either both clicks toggle (closed) or net-open. The concern is a stuck state where
        # the panel is invisible but its overlay still blocks input.
        overlay_blocks = await p.evaluate(
            "() => { const el = document.querySelector('.cc-confirm.show, #settingsOverlay.show'); return !!el; }"
        )
        if not is_open and overlay_blocks:
            r("crit", "settings-stuck", "settings closed but an overlay is still blocking input")
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(250)

        # 7. Esc during confirm modal
        print("\n=== Esc during confirm modal ===")
        await p.fill("textarea#input", "unsaved draft to trigger confirm on brandHome")
        await p.click("#brandHome")
        await p.wait_for_timeout(300)
        has_modal_before = await p.evaluate(
            "() => !!document.querySelector('.cc-confirm.show')"
        )
        print(f"  confirm visible before Esc: {has_modal_before}")
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(300)
        has_modal_after = await p.evaluate(
            "() => !!document.querySelector('.cc-confirm.show')"
        )
        if has_modal_after:
            r("minor", "esc-confirm", "Esc did not dismiss the brandHome confirm modal")
        else:
            print("  ✓ Esc dismissed confirm")

        # 8. Composer focus survives history toggle
        print("\n=== composer focus survives history toggle ===")
        await p.focus("textarea#input")
        await p.click("#historyBtn")
        await p.wait_for_timeout(250)
        await p.keyboard.press("Escape")
        await p.wait_for_timeout(250)
        focused = await p.evaluate(
            "() => document.activeElement && document.activeElement.id"
        )
        print(f"  active element after Esc: {focused!r}")
        if focused != "input":
            r("nit", "focus-restore", f"focus did not return to textarea; activeElement = {focused!r}")

        # 9. New tabs then close-all-but-one
        print("\n=== close-all-but-one ===")
        for _ in range(4):
            await p.click("#newTabBtn")
            await p.wait_for_timeout(70)
        # Close all but first
        await p.evaluate(
            "() => { const closes = Array.from(document.querySelectorAll('.tab-pill .tab-close')).slice(1); closes.forEach(c => c.click()); }"
        )
        await p.wait_for_timeout(400)
        remaining = await p.evaluate("() => document.querySelectorAll('.tab-pill').length")
        active = await p.evaluate("() => document.querySelectorAll('.tab-pill.active').length")
        print(f"  tabs left: {remaining}, active: {active}")
        if remaining == 0:
            r("crit", "tabs", "closing all tabs left 0 tabs")
        if active != 1:
            r("minor", "tabs", f"expected exactly 1 active tab, got {active}")

        if errs:
            for kind, msg in errs[:8]:
                r("crit", "jsError", f"{kind}: {msg[:200]}")

        await p.screenshot(path=f"{OUT}/final.png", full_page=False)
        await b.close()

    crit = [x for x in REPORT if x[0] == "crit"]
    minor = [x for x in REPORT if x[0] == "minor"]
    nits = [x for x in REPORT if x[0] == "nit"]
    print(f"\n===== PT3 REPORT =====")
    print(f"Critical: {len(crit)}")
    print(f"Minor:    {len(minor)}")
    print(f"Nits:     {len(nits)}")
    for s, a, m in REPORT:
        print(f"  [{s}/{a}] {m}")
    sys.exit(1 if crit else 0)


asyncio.run(main())
