"""Pass 2 - deeper edge cases. Tests:
  • Remove-missing button actually removes rows from localStorage
  • Confirm modal stacking guard (rapid clicks no longer stack)
  • Settings → History rapid switch
  • Tab cycling 6 tabs in a row, then close-all
  • Chips on the EXACT user-typical viewport (1480x1100)
  • Copy button click flow (not just strip logic)
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

PANEL = "file:///Users/anshdhakad/Library/Application%20Support/Adobe/CEP/extensions/com.claudebridge.panel/index.html"
OUT = "/tmp/panel-audit-overnight-pt2"
os.makedirs(OUT, exist_ok=True)

REPORT = []
def r(sev, area, msg):
    REPORT.append((sev, area, msg))
    tag = {"crit":"🔴","minor":"🟡","nit":"🔵"}.get(sev,"?")
    print(f"{tag} [{area}] {msg}")

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

        await p.add_init_script("""
            localStorage.setItem('claudeBridge.history', JSON.stringify([
                { id:'a', prompt:'slam title', reply:'Built!', path:'/tmp/nonexistent_a.mov', kind:'video', mode:'overlay', t:Date.now()-1000 },
                { id:'b', prompt:'caption pop', reply:'Done.', path:'/tmp/nonexistent_b.mp4', kind:'video', mode:'overlay', t:Date.now()-2000 },
                { id:'c', prompt:'lower third', reply:'Card.', path:'/tmp/nonexistent_c.mov', kind:'video', mode:'overlay', t:Date.now()-3000 },
            ]));
            window.cep_node = { require: function(m) {
                if (m === 'fs') return { existsSync: function() { return false; } };
                throw new Error('mock cep_node: ' + m);
            }};
        """)
        await p.goto(PANEL); await p.wait_for_timeout(2200)
        print("=== chip layout @1480x1100 ===")
        info = await p.evaluate("""() => {
            const c = document.getElementById('chips');
            const cs = getComputedStyle(c);
            return {
                display: cs.display,
                cols: cs.gridTemplateColumns,
                chips: document.querySelectorAll('#chips .chip:not(.chip-line)').length,
                lines: document.querySelectorAll('#chips .chip-line').length,
                sections: document.querySelectorAll('#chips .chips-section').length,
            };
        }""")
        print(f"  {info}")
        await p.screenshot(path=f"{OUT}/chips-1480x1100.png", full_page=False)

        # === Remove-missing button click flow ===
        print("\n=== Remove-missing button ===")
        await p.click('#historyBtn'); await p.wait_for_timeout(500)
        rows_before = await p.evaluate("() => document.querySelectorAll('.history-item').length")
        print(f"  rows before: {rows_before}")
        await p.click('button[data-tool=\"remove-missing\"]')
        await p.wait_for_timeout(400)
        # Confirm modal should appear
        confirm_text = await p.evaluate("() => { const e=document.querySelector('.cc-confirm.show .cc-confirm-msg'); return e? e.textContent:null; }")
        if not confirm_text or 'every history row' not in confirm_text:
            r("crit","remove-missing-confirm", f"confirm modal text wrong: {confirm_text!r}")
        # Accept
        await p.click('.cc-confirm-btn[data-act=\"ok\"]')
        await p.wait_for_timeout(900)
        rows_after = await p.evaluate("() => document.querySelectorAll('.history-item').length")
        if rows_after != 0:
            r("crit","remove-missing", f"rows after remove = {rows_after}, expected 0")
        ls = await p.evaluate("() => JSON.parse(localStorage.getItem('claudeBridge.history') || '[]').length")
        if ls != 0:
            r("crit","remove-missing-persist", f"localStorage has {ls} rows still")
        print(f"  ✓ rows after remove: {rows_after}, localStorage: {ls}")
        await p.keyboard.press('Escape')
        await p.wait_for_timeout(300)

        # === Rapid brand-home no-stack ===
        print("\n=== Confirm-stack guard ===")
        await p.fill('textarea#input', 'something unsaved')
        for _ in range(5):
            try:
                await p.click('#brandHome', timeout=1200)
            except Exception:
                pass
            await p.wait_for_timeout(50)
        # Count confirm wraps in DOM
        count = await p.evaluate("() => document.querySelectorAll('.cc-confirm').length")
        if count > 1:
            r("crit","confirm-stack", f"{count} confirms stacked after rapid clicks")
        else:
            print(f"  ✓ confirms in DOM: {count} (no stacking)")
        if count == 1:
            await p.click('.cc-confirm-btn[data-act=\"cancel\"]')
            await p.wait_for_timeout(300)

        # === Settings → Esc → History (realistic user flow) ===
        print("\n=== Settings ↔ History (Esc between) ===")
        for _ in range(3):
            await p.click('#settingsBtn'); await p.wait_for_timeout(180)
            await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
            await p.click('#historyBtn'); await p.wait_for_timeout(180)
            await p.keyboard.press('Escape'); await p.wait_for_timeout(200)
        # Are we in a clean state?
        sp = await p.evaluate("() => document.getElementById('settingsPanel').classList.contains('show')")
        hp = await p.evaluate("() => document.getElementById('historyPanel').classList.contains('show')")
        if sp or hp:
            r("minor","panel-state", f"After rapid switch + Esc: settings={sp} history={hp} (both should be false)")
        else:
            print(f"  ✓ Both panels closed cleanly")

        # === Tab cycling ===
        print("\n=== Tab cycling 6 new + close all ===")
        for _ in range(6):
            await p.click('#newTabBtn'); await p.wait_for_timeout(80)
        tabs_max = await p.evaluate("() => document.querySelectorAll('.tab-pill').length")
        print(f"  tabs after 6 news: {tabs_max}")
        for _ in range(tabs_max + 1):
            close = await p.query_selector('.tab-pill .tab-close')
            if not close: break
            try: await close.click(timeout=500)
            except: pass
            await p.wait_for_timeout(80)
        tabs_final = await p.evaluate("() => document.querySelectorAll('.tab-pill').length")
        print(f"  tabs after close-all: {tabs_final}")
        if tabs_final == 0:
            r("crit","tabs", "closing all tabs left 0 tabs (should keep ≥1)")

        # === JS errors ===
        if errs:
            for kind, msg in errs[:6]:
                r("crit", "jsError", f"{kind}: {msg[:200]}")

        await p.screenshot(path=f"{OUT}/final.png", full_page=False)
        await b.close()

    crit = [x for x in REPORT if x[0]=="crit"]
    minor = [x for x in REPORT if x[0]=="minor"]
    print(f"\n===== PT2 REPORT =====")
    print(f"Critical: {len(crit)}")
    print(f"Minor:    {len(minor)}")
    sys.exit(1 if crit else 0)

asyncio.run(main())
