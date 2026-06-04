# Animated Captions — build progress

Autonomous build (self-paced loop). Goal: select a clip → transcribe word-level →
render a styled, animated, transparent caption overlay → drop on the timeline.

## Done
- [x] Plan agreed (defaults: auto-transcribe word-level, match clip aspect, Mac first, 5 styles + options)
- [x] `bridge/remotion-template/src/Captions.tsx` — self-contained animated caption component
      (5 styles: classic, karaoke, reels, tiktok, minimal; options: accent, highlight, fontSize,
      position, uppercase, animateIn, box). Driven by word-level `lines[]`.
- [x] Registered `Captions` in `Root.tsx` with `calculateMetadata` (duration from transcript)

## Next
- [x] Render-test Captions.tsx with mock transcript — VERIFIED all 5 styles render (still PNGs at
      1080x1920). Earlier "scheduler error" was the TEST harness using an underscore in the
      composition id (`Cap_karaoke`) — Remotion ids allow only a-z A-Z 0-9 and `-`. Real comp id
      is "Captions" (valid). karaoke shows spoken=white / active=coral / unspoken=dimmed correctly;
      reels=big-bold pop; tiktok=typed-on + active wobble; classic/minimal=clean fade. ✅
- [x] Word-level ASR CONFIRMED: parakeet-mlx `--output-format json` emits `sentences[].tokens[]`
      sub-word pieces (" F","li","mi"...) each with start/end. `tokensToWords()` reconstructs true
      words by merging on the leading-space boundary. Verified on real `say`-generated speech:
      "Flimify 0-880 / makes 880-1200 / captions 1200-1680 / in 1680-1920 / one 1920-2160 ...". ✅
- [x] `tokensToWords()` + `groupWordsIntoLines(words,{maxWordsPerLine,maxGapMs,maxLineMs,maxCharsPerLine})`
      + `runParakeetWords()` in bridge.js. **12 unit tests pass** (tests/captions-helpers.test.js). ✅
- [x] `POST /captions` endpoint: segments → extractConcatAudio (reuses autoedit plumbing) →
      runParakeetWords → groupWordsIntoLines → renderCaptions → returns `[[IMPORT:/path]]` + style/
      wordCount/lineCount/timelineStart/durationSec. Metered via `gateRender()` (owner-exempt, fail-open).
      Added to heavy-inflight list so a render defers auto-update restart. ✅
- [x] `ensureCaptionsComponent()` copies Captions.tsx into the installed remotion-intro from the
      update source (local repo, else GitHub raw) since auto-update doesn't sync template src. ✅
- [x] `renderCaptions()` writes a unique one-off entry (no Root.tsx collision) + props JSON, spawns the
      project's remotion CLI directly with node. **VERIFIED end-to-end** against the real installed
      project: 22.4MB ProRes 4444 MOV, 6s. **ALPHA FIX**: needs `--image-format=png` AND
      `--pixel-format=yuva444p10le` (without them Remotion emits opaque yuv422 — overlay would cover
      footage). Confirmed `pix_fmt=yuva444p12le` + alphaextract succeeds + composites cleanly over a
      dark bg. Word-sync verified (still @ frame30=1000ms → "makes" coral active). ✅

## Next
- [ ] Panel UI: "Captions" button (mirror Auto-Edit pill) + style/options picker + progress + result card
- [ ] Metering: confirm owner-exempt path end-to-end from panel; decide premium-style plan gating (or all-tiers)
- [ ] Windows path (whisper word-level — parakeet-mlx is macOS-only)
- [ ] Real-clip verification in Premiere (selection → overlay placement at timelineStart)

## Open questions / needs user to verify in Premiere
- Real transcription quality + word timing on a real clip (needs Premiere + a selected clip)
- Timeline overlay placement (ccImportToTimeline overlay) on a real sequence
- Which styles to keep / default; tier-gating choices

## Notes
- Captions.tsx is intentionally self-contained (only `remotion`+react) so the bridge can write it
  into the render project standalone, like the /chat flow.
- Transparent output = ProRes 4444 MOV (`--codec prores --prores-profile 4444`) so it overlays footage.
