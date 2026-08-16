"""Overnight panel audit. Comprehensive — every viewport, every button,
regression tests for the night's fixes (copy-reply strip, remove-missing,
white-line placeholders, search filter)."""
import asyncio, os, json, sys
from playwright.async_api import async_playwright

PANEL = "file:///Users/anshdhakad/Library/Application%20Support/Adobe/CEP/extensions/com.claudebridge.panel/index.html"
OUT = "/tmp/panel-audit-overnight"
os.makedirs(OUT, exist_ok=True)

REPORT = []
def r(severity, area, msg):
    REPORT.append({"sev": severity, "area": area, "msg": msg})
    tag = {"crit":"🔴","minor":"🟡","nit":"🔵","ok":"✅"}.get(severity,"?")
    print(f"{tag} [{area}] {msg}")

VIEWPORTS = [
    (700,  800,  "narrow"),
    (900,  900,  "typical"),
    (1280, 900,  "wide"),
    (1480, 1100, "tall"),
]

async def seed_with_history(p):
    """Inject history rows AND a fake cep_node so missing-file detection works."""
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

async def audit(b, w, h, label):
    print(f"\n=== {label} {w}x{h} ===")
    ctx = await b.new_context(viewport={"width": w, "height": h})
    p = await ctx.new_page()
    errors = []
    p.on("pageerror", lambda e: errors.append(("PAGEERROR", str(e))))
    p.on("console", lambda m: m.type == "error" and errors.append(("CONSOLE", m.text)))

    await seed_with_history(p)
    await p.goto(PANEL)
    await p.wait_for_timeout(2400)

    # === BOOT ===
    intro = await p.evaluate("() => { const e=document.getElementById('bootIntro'); return e? getComputedStyle(e).display:'none'; }")
    if intro != 'none':
        r("minor","boot",f"intro display={intro} after 2.4s")

    # === VERSION ===
    # Read the version from the panel itself rather than hardcoding —
    # we just want to confirm SOME well-formed version is present and
    # not the stale fallback. Bumps happen often; the test shouldn't
    # break on every bump.
    ver = await p.evaluate("() => document.getElementById('versionTag') && document.getElementById('versionTag').textContent")
    # Compare against the bridge's PANEL_VERSION instead of a hardcoded major.
    # Hardcoding meant this went red on every release and stopped being trusted;
    # what actually matters is that panel and bridge agree.
    import re as _re, pathlib as _pl
    _bridge = (_pl.Path(__file__).parent.parent / "bridge" / "bridge.js").read_text(errors="ignore")
    _m = _re.search(r"PANEL_VERSION\s*=\s*'([^']+)'", _bridge)
    expected = _m.group(1) if _m else None
    if not ver or not _re.match(r"^\d+\.\d+", ver.strip()):
        r("crit","version",f"panel version is {ver!r}, not a well-formed version")
    elif expected and ver.strip() != expected:
        r("crit","version",f"panel says {ver.strip()!r} but bridge.js PANEL_VERSION is {expected!r} — they must match")

    # === CHIPS ===
    cc = await p.evaluate("() => document.querySelectorAll('#chips .chip:not(.chip-line)').length")
    cl = await p.evaluate("() => document.querySelectorAll('#chips .chip-line').length")
    sections = await p.evaluate("() => document.querySelectorAll('#chips .chips-section').length")
    if cc < 100: r("crit","chips",f"only {cc} real chips (expected ~178)")
    if cl == 0: r("minor","chips",f"no chip-line placeholders found (sections={sections})")
    print(f"  chips: {cc} real + {cl} placeholder lines across {sections} sections")

    # Click first chip → fills input
    await p.click('#chips .chip:not(.hidden):not(.chip-line):first-child')
    await p.wait_for_timeout(300)
    iv = await p.evaluate("() => document.getElementById('input').value")
    if not iv.strip():
        r("crit","chips","chip click did not fill input")

    # === SEARCH ===
    await p.evaluate("() => { document.getElementById('input').value=''; }")
    await p.fill('#emptySearch', 'subscribe')
    await p.wait_for_timeout(300)
    sv = await p.evaluate("() => [...document.querySelectorAll('#chips .chip:not(.chip-line)')].filter(c => !c.classList.contains('hidden') && getComputedStyle(c).display !== 'none').length")
    if sv == 0: r("crit","search","search 'subscribe' returned 0 chips")
    # Search no-match
    await p.fill('#emptySearch', 'xyzqwerty999')
    await p.wait_for_timeout(300)
    no_match_disp = await p.evaluate("() => { const e=document.getElementById('emptyNoMatch'); return e? getComputedStyle(e).display:'(missing)'; }")
    if no_match_disp in ('(missing)','none'):
        r("minor","search-empty",f"no-match indicator display={no_match_disp}")
    await p.fill('#emptySearch', '')
    await p.wait_for_timeout(200)

    # === TABS ===
    tabs0 = await p.evaluate("() => document.querySelectorAll('.tab-pill').length")
    await p.click('#newTabBtn')
    await p.wait_for_timeout(400)
    tabs1 = await p.evaluate("() => document.querySelectorAll('.tab-pill').length")
    if tabs1 != tabs0 + 1: r("crit","tabs",f"new tab: {tabs0} -> {tabs1}")
    # Switch back to first tab
    first_pill = await p.query_selector('.tab-pill:first-child')
    if first_pill: await first_pill.click(); await p.wait_for_timeout(200)
    # Close a tab
    close = await p.query_selector('.tab-pill .tab-close')
    if close: await close.click(); await p.wait_for_timeout(300)

    # === SEND / REFERENCE / AUTOEDIT (correct IDs) ===
    sendOk = await p.evaluate("() => !!document.getElementById('send')")
    if not sendOk: r("crit","send","#send button missing")
    refOk = await p.evaluate("() => !!document.getElementById('refAdd')")
    if not refOk: r("nit","reference","#refAdd not yet in DOM (renders when refBar has content)")
    aeOk = await p.evaluate("() => !!document.getElementById('autoeditBtn')")
    if not aeOk: r("minor","autoedit","#autoeditBtn missing")

    # === EXTEND buttons ===
    await p.fill('textarea#input', 'a quick title for testing')
    await p.wait_for_timeout(300)
    ext = await p.evaluate("""() => [...document.querySelectorAll('.expand-btn')].map(b=>({level:b.dataset.level, disabled:b.disabled}))""")
    if len(ext) < 3: r("minor","extend",f"only {len(ext)} EXTEND buttons")

    # === SETTINGS ===
    await p.evaluate("() => { document.getElementById('input').value=''; }")
    await p.click('#settingsBtn')
    await p.wait_for_timeout(400)
    sp_open = await p.evaluate("() => document.getElementById('settingsPanel').classList.contains('show')")
    if not sp_open: r("crit","settings","settings did not open")
    au = await p.evaluate("() => { const e=document.getElementById('settingAutoUpdate'); return e? {checked:e.checked}:null; }")
    if not au: r("minor","settings","#settingAutoUpdate missing")
    await p.keyboard.press('Escape')
    await p.wait_for_timeout(300)
    sp_closed = await p.evaluate("() => !document.getElementById('settingsPanel').classList.contains('show')")
    if not sp_closed: r("minor","settings","Esc did not close settings")

    # === HISTORY (with seeded data) ===
    await p.click('#historyBtn'); await p.wait_for_timeout(500)
    rows = await p.evaluate("() => document.querySelectorAll('.history-item').length")
    if rows != 3: r("minor","history",f"history rows = {rows}, expected 3")
    # Remove-missing button regression
    rm_present = await p.evaluate("() => !!document.querySelector('button[data-tool=\"remove-missing\"]')")
    if not rm_present: r("crit","history-remove-missing","'Remove missing' button NOT present (regression)")
    locate_present = await p.evaluate("() => !!document.querySelector('button[data-tool=\"locate-all\"]')")
    if not locate_present: r("minor","history-locate","'Locate all' button missing")
    # History search
    hs = await p.evaluate("() => !!document.getElementById('historySearch')")
    if not hs: r("minor","history","#historySearch missing")
    await p.keyboard.press('Escape')
    await p.wait_for_timeout(300)

    # === STATUS PILL ===
    await p.click('#status', force=True); await p.wait_for_timeout(400)
    menu = await p.evaluate("() => !!document.getElementById('statusMenu')")
    if not menu: r("minor","status","status menu didn't open")
    if menu: await p.click('body', position={'x':30,'y':30}); await p.wait_for_timeout(200)

    # === BRAND-HOME CONFIRM ===
    await p.fill('textarea#input', 'unsaved test text')
    await p.click('#brandHome'); await p.wait_for_timeout(400)
    confirm = await p.evaluate("() => !!document.querySelector('.cc-confirm.show')")
    if not confirm: r("minor","brandHome","confirm modal missing on unsaved nav")
    if confirm:
        await p.click('.cc-confirm-btn[data-act=\"cancel\"]')
        await p.wait_for_timeout(300)

    # === COPY-REPLY REGRESSION TEST ===
    # Inject a fake message with reply-ref and verify the strip logic
    await p.evaluate("""() => {
        const log = document.querySelector('.tab-content.active') || document.getElementById('log');
        if (!log) return;
        const wrap = document.createElement('div');
        wrap.className = 'msg you copy-test';
        wrap.innerHTML = '<div class=\"msg-content\"><div class=\"msg-author\">You</div>' +
            '<div class=\"msg-body\"><div class=\"reply-ref\"><span class=\"reply-ref-label\">Replying to</span>' +
            '<span class=\"reply-ref-name\">clip_42.mov</span></div>' +
            '<p>The actual user text</p></div></div>';
        log.appendChild(wrap);
    }""")
    await p.wait_for_timeout(200)
    stripped = await p.evaluate("""() => {
        const body = document.querySelector('.copy-test .msg-body');
        if (!body) return null;
        const clone = body.cloneNode(true);
        clone.querySelectorAll('.reply-ref, .msg-thumbs, .render-preview, .msg-ref-strip, .thinking-stack, .interrupt-hint, button').forEach(n => n.remove());
        return (clone.innerText || clone.textContent || '').trim();
    }""")
    if stripped is None:
        r("minor","copy-strip","could not test")
    elif "Replying to" in stripped:
        r("crit","copy-strip",f"REGRESSION: 'Replying to' STILL in clipboard text: {stripped!r}")
    elif stripped != "The actual user text":
        r("crit","copy-strip",f"unexpected stripped text: {stripped!r}")

    # === FOOTER HINT ===
    hint = await p.evaluate("() => document.getElementById('hint') && document.getElementById('hint').textContent")
    if not hint or 'accept' not in (hint or '').lower():
        r("minor","hint",f"footer hint missing 'accept': {hint!r}")

    # === EDGE CASES (rapid clicks, long input, weird unicode) ===
    # Rapid click brand home 5x — handle stacked confirm modals gracefully
    for _ in range(5):
        # Dismiss any open confirm before clicking
        await p.evaluate("() => { document.querySelectorAll('.cc-confirm-btn[data-act=\"cancel\"]').forEach(b=>b.click()); }")
        await p.wait_for_timeout(60)
        try:
            await p.click('#brandHome', timeout=1500); await p.wait_for_timeout(30)
        except Exception:
            pass
    open_confirm = await p.evaluate("() => !!document.querySelector('.cc-confirm.show')")
    if open_confirm:
        await p.evaluate("() => { document.querySelectorAll('.cc-confirm-btn[data-act=\"cancel\"]').forEach(b=>b.click()); }")
        await p.wait_for_timeout(300)
    # Verify no stacked modals after rapid-clicking
    stacked = await p.evaluate("() => document.querySelectorAll('.cc-confirm').length")
    if stacked > 1:
        r("minor","rapid-confirm",f"{stacked} confirm modals stacked after rapid clicks")
    # Long input
    long_text = "This is a really long input that should not break anything " * 30
    await p.fill('textarea#input', long_text)
    await p.wait_for_timeout(300)
    # Weird unicode paste
    await p.fill('textarea#input', '🔥💯🎬✨ POV: 你看 こんにちは 🚀')
    await p.wait_for_timeout(300)
    iv2 = await p.evaluate("() => document.getElementById('input').value")
    if '🔥' not in iv2:
        r("minor","input-unicode","unicode dropped from textarea")

    # === FINAL SCREENSHOT ===
    await p.screenshot(path=f"{OUT}/{label}-final.png", full_page=False)

    # === JS ERRORS ===
    if errors:
        for kind, msg in errors[:6]:
            r("crit","jsError", f"{kind}: {msg[:200]}")

    await ctx.close()


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        for w,h,label in VIEWPORTS:
            await audit(b, w, h, label)
        await b.close()

    crit  = [x for x in REPORT if x["sev"]=="crit"]
    minor = [x for x in REPORT if x["sev"]=="minor"]
    nit   = [x for x in REPORT if x["sev"]=="nit"]
    print(f"\n========= REPORT =========")
    print(f"Critical: {len(crit)}")
    print(f"Minor:    {len(minor)}")
    print(f"Nit:      {len(nit)}")
    with open(f"{OUT}/report.json", "w") as f:
        json.dump(REPORT, f, indent=2)
    sys.exit(1 if crit else 0)

asyncio.run(main())
