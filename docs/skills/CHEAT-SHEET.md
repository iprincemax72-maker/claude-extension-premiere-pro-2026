# Cheat sheet — picking the right skill in 5 seconds

A single-screen lookup for "what should I use when". If this isn't enough, fall through to [INDEX.md](./INDEX.md) → individual SKILL.md.

## "I want to…"

| Intent | First-pick component | Skill |
|--------|---------------------|-------|
| Get the viewer's attention in the first 3 seconds | **WaitZoomHook** | `remotion-hooks` |
| Caption that lands word-by-word like TikTok | **WordPopCaption** | `remotion-text-presets` |
| Big slam-in title | **TiltedSlam** | `remotion-text-presets` |
| Logo intro for a channel | **BrandReveal** + **LogoSlam** | `remotion-stingers` + `remotion-logos` |
| End card with subscribe nudge | **EndCard** + **SubscribeArrow** | `remotion-stingers` + `remotion-ctas` |
| Name + role lower-third | **MinimalBauhaus** (modern) or **NewsBroadcast** (news) | `remotion-lower-thirds` |
| Show stats / data | **DonutMetric**, **BarChart**, **BarRace** | `remotion-charts`, `remotion-stats` |
| Before / after transformation | **DayOneVsDayThirty** | `remotion-comparison` |
| "5 things" numbered list | **NumberedList** | `remotion-lists` |
| Step-by-step tutorial | **StepIndicator** + **CodeSnippet** | `remotion-lists` + `remotion-tech` |
| Pull-quote moment | **PullQuote** (callouts) or **BigQuote** (quotes) | `remotion-callouts`, `remotion-quotes` |
| Karaoke / lyric drop | **KaraokeLine** + **LyricDrop** | `remotion-music-lyrics` |
| Emoji reaction overlay (😂 🤯 💯) | **CryingLaugh**, **MindBlown**, **HundredSlam** | `remotion-reactions` |
| Highlight a word | **HighlightedWord** | `remotion-word-effects` |
| Animated background | **AnimatedGradient** (color) or **ParticleField** (tech) | `remotion-backgrounds` |
| Mock iMessage notification | **iMessageBubble** | `remotion-social-ui` |
| Mock toast / iOS notification | **ToastPopup** | `remotion-frames` |
| Brand-color callout | **CTABanner** | `remotion-banners` |
| Comic speech bubble | **SpeechBubble** (callouts) or **SpeechBubble** (device-notifs) | both are valid |
| Mid-clip scene divider | **SectionBreak** (vertical) / **ChapterBumper** (cinematic) | `remotion-lists`, `remotion-stingers` |
| Sponsor plate | **SponsorPlate** | `remotion-stingers` |
| Approved / Rejected / Sold-out stamp | **StampImpact** | `remotion-text-presets` |
| Glitch / damaged-feed look | **GlitchText** (text) or **GlitchLowerThird** (name card) | `remotion-text-presets`, `remotion-lower-thirds` |
| Countdown ("3... 2... 1...") | **DropIncoming** | `remotion-music-lyrics` |
| Camera flash transition between clips | **CameraFlash** | `remotion-device-notifications` |
| Plot twist mid-clip | **PlotTwistReveal** | `remotion-hooks` |
| Watermark in corner | **CornerWatermark** | `remotion-social-ui` |
| Magazine-style quote with brackets | **PullQuote** (callouts) | `remotion-callouts` |
| Code reveal (typewriter) | **TypewriterPro** or **CodeSnippet** | `remotion-text-presets`, `remotion-tech` |
| Hand-drawn arrow pointing at thing | **HandDrawnArrow** | `remotion-callouts` |
| Circle a face/object | **HighlightCircle** | `remotion-callouts` |

## "I need to render…"

```bash
# Standard silent mp4 (most common)
npx remotion render src/index.ts <CompID> out.mp4 --mute --codec h264

# Transparent overlay for ProRes alpha in Premiere
npx remotion render src/index.ts <CompID> out.mov --codec prores --prores-profile 4444 --mute

# To strip the silent AAC track (rare)
ffmpeg -i in.mp4 -c:v copy -an out.mp4
```

**NEVER use `--audio-codec=no-audio`** — invalid flag. Valid `--audio-codec` values: `pcm-16 | aac | mp3 | opus`.

## "Before I render, run…"

```bash
# Strict typecheck on every skill source + showreel — catches prop-name
# bugs that the render itself tolerates (Remotion ignores unknown props).
bash tests/skill-sources-typecheck.sh
```

## "I'm getting weird visual results"

1. **Caption invisible above a component?** Most foreground components have internal `AbsoluteFill` + centered layout — they can't be stacked in a single AbsoluteFill expecting to share space. SEQUENCE them in time instead.
2. **Two backgrounds fighting?** Layer with `opacity` or `mixBlendMode` (`remotion-backgrounds` components are explicitly stackable; foreground components are not).
3. **Black frames at scene boundaries?** Sequences start with opacity 0 fade-in. Add a frame or two of overlap by setting `from={prev + n - 4}`.
4. **Render starts then errors at frame N?** Type-check the source — Remotion's runtime is permissive, types are strict. The error frame is usually where a prop's default value first matters.
5. **Caption text looks cut off?** Some components have implicit char limits — see the anti-patterns section of the relevant SKILL.md (e.g. NumberedList items <=40 chars, CodeSnippet lines <=70 chars).
6. **Component name uses lowercase `i` (`iMessageBubble`)?** JSX treats lowercase tags as HTML intrinsics. Use an import alias: `import { iMessageBubble as IMessageBubble } from "./social-ui"`.

## See also

- [INDEX.md](./INDEX.md) — full component flat index
- [TUTORIAL.md](./TUTORIAL.md) — step-by-step 30-second product intro
- [showreel/README.md](./showreel/README.md) — copy-paste cross-skill templates
- Per-skill `SKILL.md` files for anti-patterns, recipes, prop overrides, audio cues, pairings.
