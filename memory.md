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
- [ ] Auto-Edit per-graphic CHANGE (revise one graphic, swap in place) — code done, **needs a live Auto-Edit run** to confirm: after a run, each graphic shows a "Change" button; typing e.g. "different background" re-renders just that one (`/autoedit/rerender`) and swaps it on the timeline (`ccAutoEditReplace` lifts the old clip on its track at its second, overwrites the new). Only works in the SAME session (bridge cache holds the plan+style, 30-min TTL).
- [ ] Auto-Edit motion-graphic TIMING (graphic must never end before the sentence) — code done, **needs a live Auto-Edit run** to confirm graphics now hold through the whole sentence and exit only at the very end.
- [ ] Auto-Edit animation placement (V-tracks, no overwrite) — code done, **needs live in-Premiere verification** (QE addTracks is build-dependent).
- [ ] Auto-Edit lower-third HEIGHT: first geometric fix jammed graphics to the very bottom edge (told Claude "bottom-anchored, anchor to bottom edge"). Reworked to a FLOATING lower-third: top bound (off face) + bottom bound (margin below, ~11% vertical) + explicit target CENTER (now 72% vertical / 77% horiz — nudged up from 77/81 on user request "a little more up"; still clears the 60% face line). Graphic sits in the lower third with clear space below, not glued to the bottom. **Needs a live run** to confirm it matches the "a little up" target. Knobs in generateMomentsParallel: `targetCenterFrac`, `bottomMarginFrac`, `faceSafeTopFrac`.
- [ ] Auto-Edit face-avoidance — REWORKED to be deterministic (was: ask Claude to read frames + avoid the face → it still made a card over the chin). Now every overlay is HARD-constrained to a bottom band with an explicit pixel box (vertical: below 60% of height; horizontal: below 68%), full-frame cards forbidden, + a post-render ffmpeg alpha guard that detects intrusion into the face zone and retries once with a firmer bound (validated: compliant=0, intruding=109, limit=12). Face frames are now just a left/right bias hint. **Needs a live run** to confirm graphics land in the bottom third, clear of the face. If still high, lower `faceSafeTopFrac`/`FACE_ZONE_LIMIT` in generateMomentsParallel (the log prints the measured face-zone alpha per graphic).
- [ ] Panel laggy in Premiere (feels ~30fps): added GPU + frame-rate CEF flags to manifest; user says still laggy. Likely a CEP/Premiere host cap we can't override from the extension. NOT caused by our JS (smooth in a browser). Don't cap our animations to 30fps — user explicitly forbade it.
- [ ] Captions native/animated render correctness on a real clip — needs the user in Premiere.

## Fixed (this session)
- Auto-Edit interview: added an OPTIONAL free-text box ("Anything else? (optional)") at the bottom of the questions modal. Writes to `aeWizard.answers.custom`; the bridge feeds it into BOTH moment selection (buildMomentGuidance auto-includes it) and every graphic's design prompt (genOpts.userExtra → buildPrompt). Cached with genOpts so per-graphic Change reuses it. Verified in the browser preview (renders, writes to answers, styled to match). Leave it blank and nothing changes.
- Auto-Edit per-graphic Change: after a run the panel lists each graphic ("Motion Graphic 1, 2, …") with a Change button; the user revises ONE ("different background") and only that one re-renders + swaps in place. New bridge endpoint `/autoedit/rerender {reqId, idx, change}` reuses the run's locked style/res/placement (cached `plan`+`genOpts`) and appends a CHANGE directive to the per-moment prompt; new ES3 `ccAutoEditReplace` swaps the clip in place (QE lift the old clip on its track at its second, DOM overwriteClip the new). Bridge result objects now carry `idx` (plan index) so a filtered graphic maps back to its moment.
- Auto-Edit timing: graphics no longer finish early. Root causes were (1) a hard **6s duration cap** (`Math.min(6, …)`) that truncated any sentence longer than ~5.4s by 2-3s, and (2) the render prompt saying "animate out **before** the end" (Claude faded it away early). Fix: `durationSec = max(2.8, min(20, speechDur + 1.0))` (covers the whole sentence + 1s tail), and the prompt now says HOLD fully visible for the entire duration, exit ONLY in the last ~0.4s, never clear the screen early. `m.endSec` confirmed = the moment's last-sentence end, so duration tracks real speech.
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
