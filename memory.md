# memory.md — reported bugs & requests (READ THIS EVERY SESSION)

Purpose: the user reports bugs/requests here so I don't forget or re-break things.
**Before touching the captions/auto-edit/panel UI, read this file.** Update status
when something is fixed. Newest at top.

## Hard rules (don't violate)
- CEP = old Chromium: use **mouse events** (pointerdown doesn't fire). **NO `backdrop-filter`** (crashes Premiere).
- host.jsx is **ES3 only**: `var`/`function` only, no `const`/`let`/arrow/template-literals/`.includes`; wrap calls in `_ccSafe`; never `new Time()`.
- Don't break login / auto-edit / chat / renders / website.
- Verify in the browser (Playwright @ http://127.0.0.1:8799) before claiming done. Measure, don't assume.
- Captions tab follows **Claude design**: warm darks, scarce coral accent, no glows/gradients, shadow-rare.

## Open / watch
- [ ] Auto-Edit animation placement (V-tracks, no overwrite) — code done, **needs live in-Premiere verification** (QE addTracks is build-dependent).
- [ ] Captions native/animated render correctness on a real clip — needs the user in Premiere.

## Fixed (this session)
- Quick-Look badges: content-width cards + uniform 16px chip padding → every badge exactly 40px apart, consistent 15px font, no clipping. (Earlier uniform-WIDTH scaling was wrong — it caused font variance + clipping. Don't re-introduce it.)
- Words-per-line: lines now stay on ONE row + auto-fit-to-width (preview + render); default 3 words.
- Caption clips → high tracks (V19-V22), non-overlapping/editable.
- Custom searchable font dropdown (native <select> broke in CEP); bigger/bolder font previews.
- Gray (not orange) scroller scrollbars; Quick Looks tighter.
- Color picker mouse-event fix; compacted POSITION + color picker; header chip-left/X-right.
- Working overlay = corner chip (not full black); header hide-on-scroll; Style cards = horizontal scroller + arrows.
- Claude-design restyle of captions tab; vertical accurate inline preview; Weight + Shadow now actually show.
- All system fonts via bridge OpenType parser; render pipeline sped up (concurrency + parallel split).
- Multi-version results stream as each finishes.
- Auto-Edit history + All/Renders/Auto-Edit filter in the History panel.
- Unified log: `captions` is a first-class module. Version → 11.0.
