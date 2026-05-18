# Transition Catalog — Extra Pack

Five additional production-tested transitions, visually verified against a Scene A → Scene B test composition. Each is a complete `TransitionPresentation<Record<string, never>>` factory ready to drop into a Remotion project.

**Shared imports:**

```tsx
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import type { TransitionPresentation } from "@remotion/transitions";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
```

---

## 1. Iris Open

**Effect:** Classic circular wipe — the new scene is revealed through a circle that expands from screen center. Outside the circle stays transparent so the old scene shows through.
**Energy:** Low-medium. Cinematic, intentional.
**Timing:** `linearTiming({ durationInFrames: 30-50 })`

```tsx
function irisOpen(): TransitionPresentation<Record<string, never>> {
  const component = ({
    presentationProgress,
    presentationDirection,
    children,
  }: {
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }) => {
    if (presentationDirection === "exiting") {
      return <AbsoluteFill>{children}</AbsoluteFill>;
    }
    const p = presentationProgress;
    const eased = 1 - Math.pow(1 - p, 2.5);
    const radius = eased * 75; // 75% from center covers diagonal

    return (
      <AbsoluteFill style={{ clipPath: `circle(${radius}% at 50% 50%)` }}>
        {children}
      </AbsoluteFill>
    );
  };
  return { component, props: {} };
}

// Usage
const IRIS_OPEN = irisOpen();
// <TransitionSeries.Transition presentation={IRIS_OPEN} timing={linearTiming({ durationInFrames: 40 })} />
```

**Customization tips:**
- Move the center: `circle(${radius}% at 20% 30%)` for a corner-origin iris
- Use `circle(${radius}% at 50% 100%)` for a "spotlight from below" effect
- Pair with a slight scale on the entering scene (`transform: scale(${0.95 + eased * 0.05})`) for a punch-in feel
- Slow the easing power from `2.5` to `4` for a more dramatic, slow-then-fast reveal

---

## 2. Page Tear

**Effect:** A jagged tear edge sweeps left → right across the screen, revealing the new scene underneath. The reveal boundary is a procedural zig-zag polygon.
**Energy:** Gritty, organic.
**Timing:** `linearTiming({ durationInFrames: 35 })`

```tsx
function pageTear(): TransitionPresentation<Record<string, never>> {
  // Pre-compute the jagged edge — deterministic, stable across renders.
  const segments = 24;
  const jitter: number[] = [];
  for (let i = 0; i < segments + 1; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const r = h - Math.floor(h);
    jitter.push((r - 0.5) * 6); // ±3% horizontal jitter per segment
  }

  const component = ({
    presentationProgress,
    presentationDirection,
    children,
  }: {
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }) => {
    if (presentationDirection === "exiting") {
      return <AbsoluteFill>{children}</AbsoluteFill>;
    }
    const p = presentationProgress;
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const sweep = -5 + eased * 115;

    const pts: string[] = [];
    pts.push(`0% 0%`);
    pts.push(`${sweep + jitter[0]}% 0%`);
    for (let i = 1; i < segments; i++) {
      const y = (i / segments) * 100;
      pts.push(`${sweep + jitter[i]}% ${y}%`);
    }
    pts.push(`${sweep + jitter[segments]}% 100%`);
    pts.push(`0% 100%`);
    const clipPath = `polygon(${pts.join(", ")})`;

    return (
      <AbsoluteFill style={{ clipPath, WebkitClipPath: clipPath }}>
        {children}
      </AbsoluteFill>
    );
  };
  return { component, props: {} };
}

const PAGE_TEAR = pageTear();
```

**Customization tips:**
- Increase the `±3%` jitter to `±6%` for a wilder, more chaotic tear
- Sweep right→left: change `sweep = 100 - eased * 115` and start polygon points from the right
- Add a soft inset shadow on the right side of the revealed area for a "paper edge" depth effect (place behind the clip, not on the clipped element)

---

## 3. Camera Shake Cut

**Effect:** Old scene shakes violently with rising intensity, then smash-cuts to the new scene which fades in cleanly. No shake on the entering scene.
**Energy:** Maximum impact.
**Timing:** `linearTiming({ durationInFrames: 20-25 })`

```tsx
function cameraShakeCut(): TransitionPresentation<Record<string, never>> {
  const component = ({
    presentationProgress,
    presentationDirection,
    children,
  }: {
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }) => {
    const p = presentationProgress;

    if (presentationDirection === "entering") {
      const opacity = interpolate(p, [0.5, 0.8], [0, 1], clamp);
      return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
    }

    // Shake intensity ramps 0 → 1 over [0, 0.5], crashes 0.5 → 0.625
    const intensity = p < 0.5 ? p * 2 : Math.max(0, 1 - (p - 0.5) * 8);
    const shakeX = Math.sin(p * 173.3) * 22 * intensity;
    const shakeY = Math.cos(p * 211.7) * 16 * intensity;
    const rot = Math.sin(p * 233.1) * 2 * intensity;
    const opacity = interpolate(p, [0.48, 0.6], [1, 0], clamp);

    return (
      <AbsoluteFill
        style={{
          opacity,
          transform: `translate(${shakeX}px, ${shakeY}px) rotate(${rot}deg)`,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  };
  return { component, props: {} };
}

const CAMERA_SHAKE_CUT = cameraShakeCut();
```

**Customization tips:**
- Increase shake amplitude `22 → 40` for an even more violent shake
- Use higher trig frequencies (`* 300` instead of `* 173.3`) for a more chaotic feel
- Add `filter: blur(${intensity * 4}px)` on the exiting wrap for motion blur
- Replace the fade-in with a small scale punch (`scale(${1.05 - eased * 0.05})`) on the entering wrap

---

## 4. Color Wash

**Effect:** A solid brand-color panel sweeps in from the left, fully covers the frame at `p=0.5`, then sweeps off to the right revealing the new scene. Old scene fades out as the panel covers; new scene fades in as the panel leaves.
**Energy:** Medium. Feels intentional, "designed".
**Timing:** `linearTiming({ durationInFrames: 40 })`

```tsx
function colorWash(
  color = "#10b981",
): TransitionPresentation<Record<string, never>> {
  const component = ({
    presentationProgress,
    presentationDirection,
    children,
  }: {
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }) => {
    const p = presentationProgress;
    const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

    if (presentationDirection === "exiting") {
      const opacity = interpolate(p, [0.35, 0.5], [1, 0], clamp);
      return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
    }

    // Panel: -100% (p=0, off-screen left) → 0% (p=0.5, full cover) → 100% (p=1, off-screen right)
    const translateX = interpolate(eased, [0, 1], [-100, 100]);
    // New scene fades in once the panel is past center
    const sceneOpacity = interpolate(p, [0.5, 0.65], [0, 1], clamp);

    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ opacity: sceneOpacity }}>{children}</AbsoluteFill>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: color,
            transform: `translateX(${translateX}%)`,
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>
    );
  };
  return { component, props: {} };
}

const COLOR_WASH = colorWash("#10b981");
```

**Customization tips:**
- Use a gradient: `background: "linear-gradient(135deg, #10b981, #0ea5e9)"` for a more dynamic wash
- Sweep vertically: replace `translateX` with `translateY` and switch the sceneOpacity timing
- Add a subtle box-shadow on the panel's leading edge to make it feel like it has depth
- Pair with a brand logo centered on the panel that's visible during the full-cover frame (`p ≈ 0.5`)

---

## 5. Hex Mosaic Flip

**Effect:** A grid of rectangular tiles (alternating two brand shades) flips away individually with a diagonal cascade stagger, revealing the new scene underneath. Tech / futuristic feel.
**Energy:** Medium-high. Visually rich.
**Timing:** `linearTiming({ durationInFrames: 45-55 })`

```tsx
function hexMosaicFlip(
  colorA = "#0a0a0a",
  colorB = "#1a1a1a",
  rows = 6,
  cols = 10,
): TransitionPresentation<Record<string, never>> {
  // Diagonal cascade: top-left earliest, bottom-right latest, up to 55% delay
  const stagger: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r + c) / (rows + cols - 2);
      stagger.push(idx * 0.55);
    }
  }

  const component = ({
    presentationProgress,
    presentationDirection,
    children,
  }: {
    presentationProgress: number;
    presentationDirection: "entering" | "exiting";
    children: React.ReactNode;
    passedProps: Record<string, never>;
  }) => {
    if (presentationDirection === "exiting") {
      return <AbsoluteFill>{children}</AbsoluteFill>;
    }
    const tileW = 100 / cols;
    const tileH = 100 / rows;
    const tiles: React.ReactNode[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const delay = stagger[i];
        const denom = Math.max(0.001, 1 - delay);
        const p = Math.max(0, Math.min(1, (presentationProgress - delay) / denom));
        const eased = 1 - Math.pow(1 - p, 2);
        const rot = eased * 92;       // ~90° to be edge-on
        const scale = 1 - eased * 0.25;
        const opacity = p > 0.95 ? 0 : 1;
        const color = (r + c) % 2 === 0 ? colorA : colorB;

        tiles.push(
          <div
            key={i}
            style={{
              position: "absolute",
              top: `${r * tileH}%`,
              left: `${c * tileW}%`,
              width: `${tileW + 0.6}%`,
              height: `${tileH + 0.6}%`,
              background: color,
              transform: `perspective(1000px) rotateY(${rot}deg) scale(${scale})`,
              transformOrigin: "center center",
              opacity,
              pointerEvents: "none",
            }}
          />,
        );
      }
    }

    return (
      <AbsoluteFill>
        {children}
        {tiles}
      </AbsoluteFill>
    );
  };
  return { component, props: {} };
}

const HEX_MOSAIC_FLIP = hexMosaicFlip();
```

**Customization tips:**
- Reverse the cascade (bottom-right first): use `((rows-1-r) + (cols-1-c)) / (rows + cols - 2)`
- Center-out cascade: `Math.hypot(r - rows/2, c - cols/2) / Math.hypot(rows/2, cols/2)`
- Use `rotateX` instead of `rotateY` for horizontal flip (tiles open like blinds)
- Replace solid colors with `background: \`linear-gradient(135deg, ${colorA}, ${colorB})\`` per tile for a more premium look
- More tiles (`rows=10, cols=16`) for a tighter mosaic
- Smaller `92°` rotation (e.g., `70°`) keeps tiles partially visible at the end — useful as a layer over content

---

## Full Setup Pattern

```tsx
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import {
  IRIS_OPEN,
  PAGE_TEAR,
  CAMERA_SHAKE_CUT,
  COLOR_WASH,
  HEX_MOSAIC_FLIP,
} from "./NewTransitions";

const T_IRIS    = linearTiming({ durationInFrames: 40 });
const T_TEAR    = linearTiming({ durationInFrames: 35 });
const T_SHAKE   = linearTiming({ durationInFrames: 22 });
const T_WASH    = linearTiming({ durationInFrames: 40 });
const T_MOSAIC  = linearTiming({ durationInFrames: 50 });

export const Reel = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={90}><SceneA /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={IRIS_OPEN} timing={T_IRIS} />
    <TransitionSeries.Sequence durationInFrames={90}><SceneB /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={COLOR_WASH} timing={T_WASH} />
    <TransitionSeries.Sequence durationInFrames={90}><SceneC /></TransitionSeries.Sequence>
    {/* etc */}
  </TransitionSeries>
);
```

---

## Verification Recipe

When building or modifying any of these, render against this harness:

```tsx
// TransitionTest.tsx
const SceneA: React.FC = () => (
  <AbsoluteFill style={{ background: "#d22e2e", justifyContent: "center", alignItems: "center" }}>
    <div style={{ color: "white", fontSize: 160, fontWeight: 800 }}>SCENE A</div>
  </AbsoluteFill>
);
const SceneB: React.FC = () => (
  <AbsoluteFill style={{ background: "#2e6dd2", justifyContent: "center", alignItems: "center" }}>
    <div style={{ color: "white", fontSize: 160, fontWeight: 800 }}>SCENE B</div>
  </AbsoluteFill>
);

export const TransitionTest: React.FC<{ presentation: TransitionPresentation<any> }> = ({ presentation }) => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={30}><SceneA /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={presentation} timing={linearTiming({ durationInFrames: 30 })} />
    <TransitionSeries.Sequence durationInFrames={30}><SceneB /></TransitionSeries.Sequence>
  </TransitionSeries>
);
```

Then render the composition to mp4 and `ffmpeg -vf "select=eq(n,F)"` frames at `n=0`, mid (`n=15`), and end (`n=29`) — they should show pure Scene A, mid-transition, and Scene B respectively. If frame 0 shows Scene B already, the entering wrap's mechanic isn't hiding Scene B at `p=0` (see [architecture.md](./architecture.md)).
