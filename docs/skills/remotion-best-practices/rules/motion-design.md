# Motion Design Principles for Remotion

The difference between a Remotion composition that looks "made by AI" and one that looks "designed" comes down to a handful of rules. Apply these to every component you write.

## 1. Multi-act choreography

A one-act spring (enter → static) reads as lifeless after 10 frames. Every entrance should have at least:

```
Act 1  Anticipate   — vignette tightens, color cools, faint inward pull
Act 2  Entrance     — the spring/slam itself (with overshoot, weight)
Act 3  Settle       — post-overshoot oscillation decays
Act 4  Idle         — held but ALIVE: micro-tremor, breath, slow drift
Act 5  Climax       — optional punch/shock-ring/flash (e.g. accent word)
Act 6  Aftermath    — exponential glow decay, residual echo
```

For a 60-frame hook, typical timing is:
- 0-8 Anticipate
- 8-22 Entrance
- 22-24 Settle
- 24-climax Idle
- climax-climax+12 Climax
- climax+12+ Aftermath

## 2. Purpose-specific springs

Don't use the same spring everywhere. Springs encode motion personality. Use this catalog:

```ts
const motion = {
  // Heavy text drops — high mass = audible "thunk." Use for slam titles.
  slam:   { damping: 9,  stiffness: 240, mass: 0.85 },

  // Snappy accents — no overshoot. Use for punches, click compress.
  punch:  { damping: 14, stiffness: 320, mass: 0.5 },

  // Bubble pops — light overshoot. Use for stickers, chips, icons.
  pop:    { damping: 11, stiffness: 200, mass: 0.6 },

  // Slow calm fades — for personal/editorial energy.
  drift:  { damping: 22, stiffness: 80,  mass: 1.1 },

  // Post-overshoot recovery. Use INTERNALLY after a slam.
  settle: { damping: 16, stiffness: 150, mass: 0.8 },

  // iOS-feel snap — fast, slightly damped. For Apple-style UI.
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};
```

## 3. Micro-tremor for idle elements

A held element should breathe. Use a multi-sine combiner so the motion doesn't feel mechanical:

```ts
function tremor(frame: number, amplitude = 1, speed = 0.18): number {
  return (
    Math.sin(frame * speed) * amplitude +
    Math.sin(frame * speed * 1.7) * amplitude * 0.45 +
    Math.sin(frame * speed * 0.3) * amplitude * 0.25
  );
}
```

Apply to position (`translateY`) or scale (`±0.5%`) during idle phases. Sub-pixel tremor (amplitude 0.4-1.5px) reads as "alive" without being visibly shaking.

## 4. Aftermath glow decay

After any impact (punch, slam, click), residual energy should decay exponentially — not just vanish. This is the "ring-out" that gives impacts weight.

```ts
function aftermathGlow(framesSincePunch: number, decay = 30): number {
  if (framesSincePunch < 0) return 0;
  return Math.exp(-framesSincePunch / decay);
}
```

Multiply this against your `text-shadow` blur, scale extra, or ring opacity to get a natural decay.

## 5. Secondary motion

When the primary element moves, SOMETHING ELSE should react:

- Text slams in → shadow extends BEYOND the text for 4f, then snaps back
- Bubble pops → tail wags 1 frame after bubble
- Chart bar grows → number counter ticks up alongside
- Click ripples → button compresses 1f BEFORE the ripple expands
- Heart bursts → background pink wash flashes
- Subscribed → bell appears AFTER label settles

The lag is the magic. Real-world physics has lag — your animation should too.

## 6. Chromatic aberration on impacts

For 4-6 frames during a slam or punch, split text into red/cyan ghosts offset by 5-12px. Use `mix-blend-mode: screen`. Fade to 0 over the impact's 12 frames.

```tsx
<div style={{ color: "#ff0040", transform: "translateX(8px)", mixBlendMode: "screen" }}>
  {text}
</div>
<div style={{ color: "#00d4ff", transform: "translateX(-8px)", mixBlendMode: "screen" }}>
  {text}
</div>
<div>{text}</div>
```

## 7. Sub-pixel awareness

- For dramatic motion (slam, punch) — let it be sub-pixel-free, smooth interpolation is fine.
- For idle tremor — amplitude < 2px is the sweet spot. >5px reads as broken.
- For text that should look static but alive — use `tremor(f, 0.6, 0.04)` on `translateY`.

## 8. Typography rules per use case

- **Big bold headlines:** `letter-spacing: -0.03em to -0.04em`. Default kerning is too loose for display weights.
- **Editorial / fashion-cover headlines:** `letter-spacing: -0.06em to -0.07em`. Real magazines kern this tight.
- **Counters:** `font-variant-numeric: tabular-nums`. Otherwise digits jump width as they tick.
- **Brat / anti-design:** `letter-spacing: -0.05em`, no shadow, no glow. Flat by design.
- **All-caps tracked labels:** `letter-spacing: 0.12em to 0.18em`. Loose tracking is what makes "EPISODE 04" feel editorial.

## 9. Vignettes and atmospheric perspective

For depth, use radial vignettes — tighten during anticipation, loosen during settle:

```tsx
<div style={{
  background: `radial-gradient(ellipse at 50% 50%,
    transparent 35%,
    rgba(0,0,0,${vignetteStrength}) 100%)`
}} />
```

For elements at depth (sparkles, hearts, particles): far elements should be smaller, blurred, dimmer. Near elements bigger, sharper, brighter.

## 10. Anti-patterns to never commit

- ❌ Same spring config copy-pasted across every animation
- ❌ Element goes static after entrance (no idle phase)
- ❌ Single act — `interpolate(f, [0, 12], [0, 1])` then done
- ❌ `font-variant-numeric` missing on tick-up counters
- ❌ Naive opacity-only chromatic aberration (use mix-blend-mode: screen)
- ❌ Glow that has the SAME timing as the element (glow should LAG or DECAY)
- ❌ Multi-line "trend pack" titles — keep them to one word or short phrase
- ❌ Hooks longer than 90 frames — they're openers, not body content
- ❌ Multiple high-intensity hooks back-to-back

## 11. Audio cue points

Always note where sounds should land. Sound makes weight. Common cues:

- Slam impact: at the `spring()` peak (frame ~8 for slam, ~14 for settled)
- Punch: at `punchFrame` exactly
- Click: at `clickFrame` for SubscribePop
- Ripple expand: at `clickFrame + 2`
- Bell ring: at `clickFrame + 14` for SubscribePop
- Whoosh in/out: start of any entrance and start of any exit

## 12. Frame counts that feel right

After many hooks/CTAs/banners, these timings repeatedly land:
- Hook total: 60-90 frames (2-3s @ 30fps)
- Slam entrance: 8-14 frames
- Settle: 4-6 frames
- Idle phase: as long as you need
- Punch climax: 12-16 frames total (impact 0-5, hold 5-7, decay 7-16)
- CTA loop period: 50-90 frames per cycle
- Transition: 15-30 frames

## 13. Render notes for any motion component

- 30fps is the default; 60fps doubles all numeric constants above
- Vertical 1080×1920 for short-form, landscape 1920×1080 for YouTube
- Always render with `--mute` for visual overlays (`--audio-codec=no-audio` is an invalid Remotion flag and will error; valid `--audio-codec` values are `pcm-16`, `aac`, `mp3`, `opus`).
- For alpha overlay (composite over real footage in Premiere): `--codec prores --prores-profile 4444 --mute`
- Background = `"transparent"` only when intended for ProRes 4444 alpha
