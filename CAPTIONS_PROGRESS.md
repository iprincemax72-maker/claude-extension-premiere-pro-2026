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
- [ ] `groupWordsIntoLines(words, {maxWordsPerLine, maxGapMs, maxLineMs})` helper in bridge.js + unit test
- [ ] `POST /captions` endpoint: ccGetSelectedClips → extract audio → ASR WORD timestamps →
      groupWordsIntoLines → write Captions.tsx into render project → render transparent MOV → [[IMPORT]]
- [ ] Word-level ASR: confirm parakeet-mlx emits word timestamps (else whisper-cli --word_timestamps)
- [ ] Panel UI: "Captions" button (mirror Auto-Edit pill) + style/options picker + progress + result card
- [ ] Metering (1 credit, owner-exempt) + plan gating for premium styles
- [ ] Windows path (whisper word-level)

## Open questions / needs user to verify in Premiere
- Real transcription quality + word timing on a real clip (needs Premiere + a selected clip)
- Timeline overlay placement (ccImportToTimeline overlay) on a real sequence
- Which styles to keep / default; tier-gating choices

## Notes
- Captions.tsx is intentionally self-contained (only `remotion`+react) so the bridge can write it
  into the render project standalone, like the /chat flow.
- Transparent output = ProRes 4444 MOV (`--codec prores --prores-profile 4444`) so it overlays footage.
