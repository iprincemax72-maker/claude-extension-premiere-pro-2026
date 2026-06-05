# Animated Captions — build progress

Autonomous build. Goal: select a clip → transcribe word-level → render styled,
animated, transparent captions → drop each as its own layer on the timeline.

## STATUS: feature-complete + robust + well-tested. Owner-only early access.

FULL-PIPELINE end-to-end verified on real audio + real render (Jun 5): parakeet
words -> groupWordsIntoLines -> markKeywords -> applyEmojis -> styled ProRes 4444
render -> ffmpeg split into N SEPARATE alpha clips. Result: 3 lines (keywords
[Flimify]/[fast.]/[today.] + emojis 💰/⚡/🔥) -> 3/3 separate alpha layers. Plus:
parakeet+whisper transcription both verified, 6 styles + 11 looks + full options
all render-verified, panel screenshot-verified, no regressions, 12 helper tests
pass against the real bridge source. The only remaining items need Windows (ship
whisper binary+model in install.ps1 — code ready) or the user (live in-Premiere).

### Overnight session (Jun 5) — everything the user asked, done + verified
- Full-screen "captions studio" modal (not a narrow bar) with a LIVE animated preview
  (rAF engine mirroring the real render), hover animations, smooth/minimal.
- Color: full custom picker (saturation/value square + hue strip + hex + presets).
- Position: 3x3 zone grid (like Premiere's Align&Transform) + drag the preview caption.
- Text panel: font family, weight (Reg/Semi/Bold/Black), align, size, letter-spacing,
  line-height, words/line — Premiere-Text-panel depth.
- Effects: shadow, outline(stroke)+colour, pill background.
- Per-line VARIETY: each line a different colour + entrance animation (vary toggle).
- Trendy HORMOZI style (active word in a colour box) + 11 Quick-look presets.
- Submagic-inspired: KEYWORD highlighting (important word stays coloured) + AUTO-EMOJI
  (curated keyword->emoji, one per line, colour emoji verified in ProRes).
- EACH CAPTION = ITS OWN TIMELINE LAYER: render once, ffmpeg -c copy split into one
  alpha clip per line, place each via host ccImportCaptionClips() (not one baked file).
- Auto-import on generate, synced at the clip's timelineStart.
- Owner-only lock (button + bridge gate). Selection chip live-polls (fixed the
  "No clip selected" bug). Robustness: real cancel (kills child procs), temp-file
  cleanup on all paths, GitHub-raw fetch cached.
- Tests extract the real helpers from bridge.js (12 pass). No regressions to
  login/auto-edit/chat/renders (verified). ~24 commits, all pushed.

### Cross-platform transcription (Jun 5, later)
- [x] Windows / no-parakeet WORD-LEVEL fallback via whisper.cpp (`whisper-cli -ojf`):
      resolveWhisper()/resolveWhisperModel() + runWhisperWords() normalize whisper's
      sub-word tokens (ms offsets, leading-space boundaries) and REUSE tokensToWords.
      transcribeWords() dispatches parakeet (mac) -> whisper (fallback). End-to-end
      verified on real whisper-cli: accurate word timestamps, quote artifacts stripped.
      NOTE: the `-nt` flag must NOT be passed (it zeroes token offsets).

### Deferred / future
- Windows INSTALLER must ship whisper-cli + a ggml model (e.g. ggml-base.en.bin) and/or
  set CLAUDE_BRIDGE_WHISPER_MODEL, so runWhisperWords has a model on Windows. (code ready)
- AI-context emoji (current is a curated dictionary, ~90 words).
- Native editable Premiere TEXT (current = separate styled video clips per line;
  Premiere ExtendScript can't reliably author styled animated text).
- Live in-Premiere verification on a real clip (needs the user).

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

- [x] Panel UI: "Captions" pill next to Auto-Edit (hidden in chat-mode like Auto-Edit) → modal with
      5 style cards (live preview chips, Karaoke default), Position seg (top/mid/bottom), 6 highlight
      swatches, words-per-line stepper, UPPERCASE + Pill-background toggles, Generate. Opens reading
      `ccGetSelectedClips()` + new `ccGetSeqDims()` (host.jsx) so the overlay matches sequence
      aspect/res/fps. Generate → POST /captions with live SSE progress bar (filtered by reqId) →
      result bubble + import card that adds the overlay with **forced 'overlay' mode** (track above).
      Opts persist to localStorage. **Screenshot-verified** in Playwright: modal renders on-brand,
      all interactions update state (style/position/toggles), every handler wired, no JS syntax break. ✅
- [x] `ccGetSeqDims()` in host.jsx → {ok,width,height,fps} from active sequence (frameSize* →
      getSettings fallback → 1080x1920@30 default). ✅
- [x] Metering: /captions calls gateRender() (owner-exempt, fail-open); panel surfaces meterBlock
      (signin/limit) errors in the modal. Available to all signed-in tiers (metered per use, not Studio-gated). ✅

- [x] **UI v2 — full-screen captions studio** (user asked: full-screen not a bar, live preview, drag-to-place,
      sliders, hover, smooth/minimal):
      - Full-screen modal (header + scrollable body + sticky footer + working overlay).
      - **Live animated preview** engine (rAF) that mirrors Captions.tsx in the DOM — plays + loops,
        reflects style/highlight/position/uppercase/pill/words/font instantly. Faux-footage backdrop.
      - **Drag-to-place**: grab the preview caption → sets position='custom' + customX/customY (clamped).
      - **Sliders** for words-per-line (1–8) and font size (70–150% → options.fontScale).
      - Position seg gains **Custom**; hover-lift on cards, swatch/btn hover, smooth transitions.
      - Captions.tsx extended: position:'custom' + customX/customY + fontScale. Component + the FULL
        VIDEO render path verified (ProRes 4444 yuva444p12le, alpha present, custom pos + pill + blue
        highlight + 1.3x font all correct). Panel screenshot-verified (style switch, drag→custom,
        sliders, working overlay); all handlers wired, no JS syntax break, opts persist to localStorage.
      - Bridge passes the new options straight through (no endpoint change needed). ✅

## Next
- [ ] Real-clip verification in Premiere (live): selection → transcript quality → overlay placement at
      timelineStart on the track above. NEEDS the user + a real clip — can't be done headless.
- [ ] Windows path (whisper word-level — parakeet-mlx is macOS-only); resolveWhisper + word timestamps.
- [ ] Optional polish: per-style font-size presets in options, max-chars-per-line control, ESC-to-close
      already inherited via .autocut-modal busy/esc detection — confirm on real panel.
- [ ] Add captions to the validation suite (tests/) once panel audits cover it.

## Open questions / needs user to verify in Premiere
- Real transcription quality + word timing on a real clip (needs Premiere + a selected clip)
- Timeline overlay placement (ccImportToTimeline overlay) on a real sequence
- Which styles to keep / default; tier-gating choices

## Notes
- Captions.tsx is intentionally self-contained (only `remotion`+react) so the bridge can write it
  into the render project standalone, like the /chat flow.
- Transparent output = ProRes 4444 MOV (`--codec prores --prores-profile 4444`) so it overlays footage.
