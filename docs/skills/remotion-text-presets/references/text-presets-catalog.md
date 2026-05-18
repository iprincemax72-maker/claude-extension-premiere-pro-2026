# Text Presets Catalog

Six production-tested text animation components. Each is self-contained: copy the function into your composition file and use it. All animations are frame-deterministic.

**Shared imports:**

```tsx
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const HELV =
  '"Helvetica Neue", Helvetica, Arial, "SF Pro Display", sans-serif';
```

---

## 1. Tilted Slam

**Effect:** Bold uppercase title slams onto the frame at a slight tilt with a spring overshoot and a brief settle wobble.
**Energy:** High impact. YouTube intro / brand title vibe.
**Use for:** Channel intros, episode titles, "stinger" moments.

```tsx
type TiltedSlamProps = {
  text: string;
  color?: string;       // default "#ffffff"
  bg?: string;          // default "#0a0a0a" — use "transparent" for overlay
  tiltDeg?: number;     // default -5
  fontSize?: number;    // default 220
  delay?: number;       // frames before animation starts, default 0
};

const TiltedSlam: React.FC<TiltedSlamProps> = ({
  text, color = "#ffffff", bg = "#0a0a0a",
  tiltDeg = -5, fontSize = 220, delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  const slam = spring({
    frame: f, fps,
    config: { damping: 11, stiffness: 220, mass: 0.7 },
  });
  const settlePhase = interpolate(f, [8, 22], [0, 1], clamp);
  const wobble = (1 - settlePhase) * Math.sin(f * 1.4) * 4;
  const scale = interpolate(slam, [0, 1], [1.25, 1], clamp);
  const opacity = interpolate(f, [0, 4], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        color, fontFamily: HELV, fontSize, fontWeight: 900,
        letterSpacing: "-0.04em", textTransform: "uppercase",
        transform: `rotate(${tiltDeg + wobble * 0.15}deg) scale(${scale}) translateY(${wobble}px)`,
        opacity,
        textShadow: "0 6px 0 rgba(0,0,0,0.25)",
        whiteSpace: "nowrap",
      }}>{text}</div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- Negative `tiltDeg` (e.g. -8) for a more dramatic left-tilt
- Drop the `textShadow` for a flatter, more modernist look
- Pair with a quick `bg` color flash on frames 0-3 for extra impact
- Add `WebkitTextStroke: "2px black"` for a stickered/outlined feel

---

## 2. Word Pop Caption

**Effect:** Words spring in one by one with scale + slight rotation. The currently-active word gets a colored background highlight.
**Energy:** TikTok / Reels caption energy. Reads at any size.
**Use for:** Voiceover captions, listicle moments, social content overlays.

```tsx
type WordPopCaptionProps = {
  words: string[];
  framesPerWord?: number;   // default 14
  color?: string;           // default "#ffffff"
  highlight?: string;       // active-word bg, default "#fef08a"
  highlightColor?: string;  // active-word fg, default "#000"
  fontSize?: number;        // default 140
  bg?: string;              // default "#0a0a0a"
};

const WordPopCaption: React.FC<WordPopCaptionProps> = ({
  words, framesPerWord = 14, color = "#ffffff",
  highlight = "#fef08a", highlightColor = "#000",
  fontSize = 140, bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const activeIdx = Math.min(words.length - 1, Math.floor(frame / framesPerWord));

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div style={{
        fontFamily: HELV, fontSize, fontWeight: 900,
        letterSpacing: "-0.02em", textTransform: "uppercase",
        color, textAlign: "center", lineHeight: 1.05,
        maxWidth: "90%", display: "flex", flexWrap: "wrap",
        justifyContent: "center", gap: "0.25em",
      }}>
        {words.map((w, i) => {
          const start = i * framesPerWord;
          const local = frame - start;
          const pop = spring({ frame: local, fps, config: { damping: 10, stiffness: 240, mass: 0.6 } });
          const scale = interpolate(pop, [0, 1], [0.55, 1], clamp);
          const opacity = interpolate(local, [0, 4], [0, 1], clamp);
          const rot = interpolate(pop, [0, 1], [-6, 0], clamp);
          const isActive = i === activeIdx;
          return (
            <span key={i} style={{
              display: "inline-block",
              transform: `scale(${scale}) rotate(${rot}deg)`,
              opacity,
              background: isActive ? highlight : "transparent",
              color: isActive ? highlightColor : color,
              padding: isActive ? "0.05em 0.18em" : "0.05em 0",
              borderRadius: 12,
            }}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- `framesPerWord` 10-12 for fast/energetic pace, 18-22 for slower delivery
- Highlight emerald `#10b981`, hot pink `#ec4899`, cyan `#06b6d4` for brand variants
- Set `framesPerWord` from real audio: pull word timestamps from a transcript and compute per-word frame counts dynamically

---

## 3. Letter Cascade

**Effect:** Each letter springs down from above with a stagger. Letters bounce into place.
**Energy:** Cinematic but playful. Reads as "title card with attitude".
**Use for:** Section titles, name cards, opening reveals.

```tsx
type LetterCascadeProps = {
  text: string;
  framesPerLetter?: number;  // default 3
  color?: string;             // default "#ffffff"
  fontSize?: number;          // default 200
  bg?: string;                // default "#0a0a0a"
};

const LetterCascade: React.FC<LetterCascadeProps> = ({
  text, framesPerLetter = 3, color = "#ffffff",
  fontSize = 200, bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = Array.from(text);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        display: "flex", fontFamily: HELV, fontSize, fontWeight: 900,
        letterSpacing: "-0.03em", textTransform: "uppercase", color, whiteSpace: "pre",
      }}>
        {letters.map((ch, i) => {
          const local = frame - i * framesPerLetter;
          const drop = spring({ frame: local, fps, config: { damping: 9, stiffness: 180, mass: 0.5 } });
          const translateY = interpolate(drop, [0, 1], [-220, 0], clamp);
          const opacity = interpolate(local, [0, 3], [0, 1], clamp);
          const scale = interpolate(drop, [0, 1], [0.7, 1], clamp);
          return (
            <span key={i} style={{
              display: "inline-block",
              transform: `translateY(${translateY}px) scale(${scale})`,
              opacity,
            }}>{ch === " " ? " " : ch}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- `framesPerLetter` 1-2 for snappy, 5-7 for slow/dramatic
- Replace `translateY: [-220, 0]` with `[220, 0]` to bounce up from below
- Use `damping: 6` for a more visible bounce, `damping: 15` for cleaner snap
- Add `filter: blur(${(1-drop)*8}px)` for a motion-blur depth effect

---

## 4. Typewriter Pro

**Effect:** Characters appear one by one via string slicing (per the Remotion best-practices rule — NEVER per-char opacity). Blinking cursor. Brief pause at periods/commas.
**Energy:** Calm, deliberate, code-y. Strong for storytelling moments.
**Use for:** Story openers, code reveals, narrator delivery.

```tsx
type TypewriterProProps = {
  text: string;
  charsPerSecond?: number;  // default 28
  color?: string;           // default "#ffffff"
  cursorColor?: string;     // default "#10b981"
  fontSize?: number;        // default 96
  bg?: string;              // default "#0a0a0a"
};

const TypewriterPro: React.FC<TypewriterProProps> = ({
  text, charsPerSecond = 28, color = "#ffffff",
  cursorColor = "#10b981", fontSize = 96, bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const baseCost = fps / charsPerSecond;
  let acc = 0;
  const charFrames: number[] = [];
  for (let i = 0; i < text.length; i++) {
    acc += baseCost;
    if (/[.,?!:]/.test(text[i])) acc += 6;
    charFrames.push(acc);
  }
  let revealed = 0;
  for (let i = 0; i < charFrames.length; i++) {
    if (frame >= charFrames[i]) revealed = i + 1;
  }
  const visible = text.slice(0, revealed);
  const cursorOn = Math.floor(frame / (fps / 2)) % 2 === 0;

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", padding: 80 }}>
      <div style={{
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
        fontSize, fontWeight: 700, color, lineHeight: 1.2,
        textAlign: "left", maxWidth: "92%", whiteSpace: "pre-wrap",
      }}>
        {visible}
        <span style={{
          display: "inline-block", width: "0.55em", height: "1em",
          verticalAlign: "text-bottom",
          background: cursorOn ? cursorColor : "transparent",
          marginLeft: 4,
        }} />
      </div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- `charsPerSecond: 60+` for fast hacker-style typing, 18-22 for slow narrator pace
- Underscore cursor: `height: "4px"` and remove `verticalAlign`
- Multi-line: split on `\n` and render each line — the slice naturally handles line breaks via `whiteSpace: "pre-wrap"`
- For "type AND backspace AND retype" effects, build a frame array of strings and look up by frame instead of using char-cost accumulation

---

## 5. Marker Underline

**Effect:** Text fades in, then a colored highlighter line draws beneath it from left to right.
**Energy:** Editorial / hand-drawn / "key point" emphasis.
**Use for:** Pull-quote callouts, vocabulary words, "this is the point" moments.

```tsx
type MarkerUnderlineProps = {
  text: string;
  color?: string;       // default "#0a0a0a"
  marker?: string;      // default "#fde047"
  fontSize?: number;    // default 180
  bg?: string;          // default "#ffffff"
};

const MarkerUnderline: React.FC<MarkerUnderlineProps> = ({
  text, color = "#0a0a0a", marker = "#fde047",
  fontSize = 180, bg = "#ffffff",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const textOpacity = interpolate(frame, [0, 10], [0, 1], clamp);
  const draw = spring({
    frame: frame - 14, fps,
    config: { damping: 18, stiffness: 90 },
  });
  const markerScaleX = interpolate(draw, [0, 1], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "relative", display: "inline-block" }}>
        <div style={{
          position: "absolute", left: -10, right: -10, bottom: 18,
          height: "0.35em", background: marker,
          transform: `scaleX(${markerScaleX})`, transformOrigin: "left center",
          zIndex: 0,
        }} />
        <div style={{
          position: "relative", zIndex: 1,
          fontFamily: HELV, fontSize, fontWeight: 900,
          letterSpacing: "-0.03em", color, opacity: textOpacity,
          textTransform: "uppercase",
        }}>{text}</div>
      </div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- For a thicker highlighter: bump `height` to `"0.5em"` or `"0.6em"`
- For a hand-drawn squiggle, replace the rectangle with an inline SVG path that draws with `pathLength`
- Right-to-left draw: change `transformOrigin: "right center"`
- "Strike-through" variant: move `bottom` to `top: "50%"`, height to `0.15em`

---

## 6. Counter Count-Up

**Effect:** Number ramps from 0 to target with easing, formats with comma grouping, and gets a small final-value scale punch.
**Energy:** Punchy stat reveal. Reads instantly even at small size.
**Use for:** Money figures, follower counts, % stats, scores.

```tsx
type CounterCountUpProps = {
  target: number;
  durationFrames?: number; // default 45
  prefix?: string;         // e.g. "$"
  suffix?: string;         // e.g. "K", "%"
  decimals?: number;       // default 0
  color?: string;          // default "#ffffff"
  fontSize?: number;       // default 280
  bg?: string;             // default "#0a0a0a"
};

const CounterCountUp: React.FC<CounterCountUpProps> = ({
  target, durationFrames = 45, prefix = "", suffix = "",
  decimals = 0, color = "#ffffff", fontSize = 280, bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = Math.min(1, Math.max(0, frame / durationFrames));
  const eased = 1 - Math.pow(1 - p, 2.2);
  const value = target * eased;
  const formatted = decimals > 0
    ? value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : Math.floor(value).toLocaleString("en-US");

  const punch = spring({
    frame: frame - durationFrames, fps,
    config: { damping: 10, stiffness: 180 },
  });
  const punchScale = 1 + punch * 0.06 - Math.max(0, punch - 0.7) * 0.06;

  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{
        fontFamily: HELV, fontSize, fontWeight: 900,
        letterSpacing: "-0.04em", color,
        transform: `scale(${punchScale})`,
        fontVariantNumeric: "tabular-nums",
      }}>
        {prefix}{formatted}{suffix}
      </div>
    </AbsoluteFill>
  );
};
```

**Customization tips:**
- For percentages: `target={87} suffix="%"`
- For "K" / "M" abbreviations, format separately: `target={2400} suffix="K"` for "2,400K"
- Faster count-up: drop `durationFrames` to 25-30; slower drama: 60-90
- For decimals (e.g. ratings): `target={4.8} decimals={1} suffix=" / 5"`
- **Always** keep `fontVariantNumeric: "tabular-nums"` — without it digits jump width on each frame change

---

## Combining Presets

These compose. Common patterns:

```tsx
// Sequential title moments
<Series>
  <Series.Sequence durationInFrames={60}>
    <TiltedSlam text="CHAPTER ONE" />
  </Series.Sequence>
  <Series.Sequence durationInFrames={90}>
    <MarkerUnderline text="THE BEGINNING" />
  </Series.Sequence>
  <Series.Sequence durationInFrames={75}>
    <CounterCountUp target={2400} suffix="K FOLLOWERS" />
  </Series.Sequence>
</Series>
```

For **overlays on top of video** (Auto-Edit moments), set `bg="transparent"` and render to ProRes 4444 to preserve alpha:

```bash
npx remotion render YourComp out.mov --codec=prores --prores-profile=4444
```
