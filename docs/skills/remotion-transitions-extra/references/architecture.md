# Architecture: How TransitionSeries Stacks Wraps

This is the single most common gotcha when building custom `TransitionPresentation` components. Get this wrong and your transition will silently fail (cover panels invisible, scenes appearing too early, etc.).

## The Stacking Order

During the transition window, **both** wraps are rendered simultaneously:

```
┌─ ENTERING wrap (Scene B + reveal mechanic)  ← on TOP
└─ EXITING wrap  (Scene A + exit mechanic)    ← BELOW
```

The entering wrap **always sits on top** of the exiting wrap. The transition's `presentationProgress` runs `0 → 1` synchronously through both wraps.

## What This Means in Practice

### ❌ Wrong: Cover panel on exiting wrap

```tsx
// This LOOKS like it should work — slide a color panel across the exiting
// scene to "wipe" it away. But the entering wrap is on top, so we never
// see the panel.
if (presentationDirection === "exiting") {
  return (
    <AbsoluteFill>
      {children}
      <ColorPanel translateX={`${interpolate(p, [0, 1], [-100, 100])}%`} />
    </AbsoluteFill>
  );
}
return <AbsoluteFill>{children}</AbsoluteFill>; // ← this covers the cover
```

At `p=0` the user sees **Scene B fully** because the entering wrap is on top and uncovered. The exiting wrap's color panel is sliding underneath, invisible.

### ✅ Right: Reveal mechanic on entering wrap

```tsx
// The entering wrap starts with the new scene HIDDEN (clip-path/mask/opacity)
// so the exiting scene below shows through, then progressively reveals it.
if (presentationDirection === "exiting") {
  return <AbsoluteFill>{children}</AbsoluteFill>;
}
// entering — clip-path grows from 0 to full size
const radius = (1 - Math.pow(1 - p, 2.5)) * 75;
return (
  <AbsoluteFill style={{ clipPath: `circle(${radius}% at 50% 50%)` }}>
    {children}
  </AbsoluteFill>
);
```

At `p=0` the clip-path is `circle(0%)` → Scene B is clipped to nothing → the exiting Scene A below shows through. As `p` grows, the circle grows, revealing Scene B.

## The Three Reveal Patterns

### Pattern 1: Clip-path or mask on the entering scene

Use when the new scene should be revealed through a shape (iris, page tear, diagonal wipe).

- Exiting wrap: just render the scene (optional fade)
- Entering wrap: wrap the scene with `clipPath` or `mask` that grows from "hides everything" to "reveals everything"

### Pattern 2: Colored panel covering the entering wrap

Use when a brand-color panel should sweep across the screen, briefly hiding both scenes.

- Exiting wrap: render the scene, fade out as the panel arrives over it
- Entering wrap: render the scene at `opacity=0` initially, with a colored panel on top that slides from off-screen → covering → off-screen. Fade the scene in as the panel leaves.

### Pattern 3: Mirrored animation on both wraps

Use for symmetric effects like shutters, slats, or bars that "close" then "open".

- Exiting wrap: render scene + mechanic in CLOSING direction (mechanic starts off, ends covering)
- Entering wrap: render scene + mechanic in OPENING direction (mechanic starts covering, ends off)
- The mechanic appears to swap roles seamlessly because both wraps' mechanics meet at the same covered state mid-transition

## Why This Matters for Designing New Transitions

Before writing code, ask: **"At `p=0`, what should the user see?"**

Almost always the answer is "Scene A" (the old scene). That means:
- The exiting wrap (which holds Scene A) must be fully visible at `p=0`
- The entering wrap (on top) must NOT occlude Scene A at `p=0` — its scene must be hidden by clip-path/opacity/transform, AND any covering panel must be off-screen or transparent

Then ask: **"At `p=1`, what should the user see?"**

Almost always "Scene B". That means:
- The entering wrap's reveal mechanic must be fully "open" (clipPath full, opacity 1)
- The exiting wrap can be anything — it'll be unmounted shortly anyway

## Verifying Your Transition

Render the transition against a high-contrast test composition (e.g., red Scene A → blue Scene B), then extract frames at `f=0`, `f=mid`, `f=end-1`. The frames should match your design intent — if `f=0` shows Scene B already, you've stacked your mechanics wrong.

See [transition-catalog-extra.md](./transition-catalog-extra.md) for five reference implementations that follow these patterns.
