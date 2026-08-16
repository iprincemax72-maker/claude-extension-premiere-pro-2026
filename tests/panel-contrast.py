#!/usr/bin/env python3
"""Panel contrast audit — catches invisible controls.

Written after a real bug: the post-cancel "Continue" button set its background
to the accent colour on hover while its label and icon stayed accent-coloured
(both currentColor), so the contents vanished and it rendered as a blank purple
blob. A static read of index.html cannot catch that — the state only exists on
hover, and the button itself is built by JavaScript after a cancel.

So this does two passes:
  1. every visible control already in the DOM, in NORMAL and HOVER state
  2. controls that only exist at runtime (toasts, the Continue button), built
     on the fly and checked the same way

Run:  python3 tests/panel-contrast.py
"""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright

PANEL = pathlib.Path(__file__).parent.parent / "extension" / "com.claudebridge.panel" / "index.html"
MIN_RATIO = 1.6          # below this the label is effectively invisible

# Contrast maths + the sweep itself. Kept in one JS blob so the same code runs
# against live DOM and freshly-built elements.
SWEEP = r"""
(minRatio) => {
  const parse = (c) => { const m=(c||'').match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]}:null; };
  const lum = (c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);};
  const ratio=(a,b)=>{const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);};
  const effBg=(el)=>{let n=el;while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor);
    if(c&&c.a>0.5)return c;n=n.parentElement;}return {r:20,g:18,b:22,a:1};};
  const vis=(el)=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05&&r.width>4&&r.height>4;};

  // Build the controls that only exist at runtime, so they get audited too.
  const host=document.createElement('div');
  host.id='__contrast_probe';
  host.style.cssText='position:fixed;left:0;top:0;width:900px;z-index:99999';
  document.body.appendChild(host);
  try {
    const b=document.createElement('button');
    b.className='cc-btn-continue';
    b.style.cssText='display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);'
      +'color:var(--accent);border:1px solid var(--accent-line);border-radius:8px;padding:6px 12px;font-size:12px';
    b.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor">'
      +'<polygon points="5 3 19 12 5 21 5 3"/></svg><span>Continue</span>';
    b.addEventListener('mouseenter',()=>{b.style.background='var(--accent)';b.style.color='#fff';});
    b.addEventListener('mouseleave',()=>{b.style.background='var(--accent-soft)';b.style.color='var(--accent)';});
    host.appendChild(b);
  } catch(e){}
  try { if (typeof ccToast==='function'){ ccToast('contrast probe', false); ccToast('contrast probe err', true); } } catch(e){}

  const bad=[];
  const controls=[...document.querySelectorAll('button,a,[role="button"],.chip')].filter(el=>{
    if(!vis(el)) return false;
    return (el.textContent||'').trim().length>0 || !!el.querySelector('svg,img');
  });
  for(const el of controls){
    const label=((el.textContent||'').trim().slice(0,26)) || el.id || (el.className||'').split(' ')[0] || el.tagName;
    for(const state of ['normal','hover']){
      if(state==='hover') el.dispatchEvent(new MouseEvent('mouseenter',{bubbles:true}));
      const cs=getComputedStyle(el), fg=parse(cs.color), bg=parse(cs.backgroundColor);
      const back=(bg&&bg.a>0.5)?bg:effBg(el);
      if(fg&&back){
        const r=ratio(fg,back);
        if(r<minRatio) bad.push({label,state,ratio:+r.toFixed(2),color:cs.color,background:cs.backgroundColor});
      }
      if(state==='hover') el.dispatchEvent(new MouseEvent('mouseleave',{bubbles:true}));
    }
  }
  host.remove();
  return { scanned: controls.length, bad };
}
"""

async def main():
    findings, scanned_total = [], 0
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for w, h in [(420, 900), (1280, 900)]:
            page = await browser.new_page(viewport={"width": w, "height": h})
            await page.goto(PANEL.as_uri())
            await page.wait_for_timeout(700)          # let boot animation settle
            res = await page.evaluate(SWEEP, MIN_RATIO)
            scanned_total = max(scanned_total, res["scanned"])
            for b in res["bad"]:
                findings.append((f"{w}x{h}", b))
            await page.close()
        await browser.close()

    print(f"\nscanned {scanned_total} visible controls (normal + hover, 2 viewports)")
    if not findings:
        print("\n===== CONTRAST REPORT =====\nCritical: 0")
        return 0
    print("\n===== CONTRAST REPORT =====")
    for vp, b in findings:
        print(f"🔴 [{vp}] {b['label']!r} is invisible on {b['state']} "
              f"(ratio {b['ratio']}, {b['color']} on {b['background']})")
    print(f"Critical: {len(findings)}")
    return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
