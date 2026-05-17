---
name: remotion-lists
description: Six list and step-indicator components for Remotion — NumberedList with staggered reveal, StepIndicator with progress bar, Checklist with check animations, BulletReveal, RecipeStep, and SectionBreak. Use when the user asks for "numbered list", "5 tips", "3 reasons", "checklist", "step 1 of 3", "recipe step", "section break", "chapter divider", or any explainer / tutorial list.
---

# Remotion Lists & Steps

Six components for tutorial / explainer / list-style content. Render-verified to mp4.

- [Source](./references/lists-source.tsx)

## The Six Components

| Name | Use | Default canvas |
|------|-----|----------------|
| **NumberedList** | "3 reasons why" — items stagger in with 01/02/03 prefixes | Vertical 1080×1920 |
| **StepIndicator** | "Step 1 of 3" with thin progress bar | Vertical 1080×1920 |
| **Checklist** | N-item list, each animates check from unchecked to checked | Vertical 1080×1920 |
| **BulletReveal** | Animated bullets fade-in with checkmarks | Vertical 1080×1920 |
| **RecipeStep** | "Step 2: whisk eggs" recipe card | Landscape 1920×1080 |
| **SectionBreak** | Full-frame chapter divider | Landscape 1920×1080 |

## When to Load

- "Numbered list / N reasons / N tips / list reveal" → **NumberedList**
- "Step indicator / step 1 of 3 / progress bar" → **StepIndicator**
- "Checklist / todo / check off" → **Checklist**
- "Bullet / bullet points / explainer" → **BulletReveal**
- "Recipe step / cooking / instruction card" → **RecipeStep**
- "Section break / chapter divider / part 1" → **SectionBreak**

## Golden rules

1. **NumberedList, Checklist, BulletReveal** all take `items: string[]` + `framesPerItem` for stagger control. Default ~12f/item ≈ 400ms/item at 30fps.
2. **StepIndicator + RecipeStep** are SINGULAR cards — they show one step at a time. Sequence them for multi-step flows.
3. All animations are `useCurrentFrame()` driven, no `useState`.
4. **Vertical 1080×1920 is the default for the list components** (TikTok/Reels). RecipeStep and SectionBreak are landscape (cooking-show / chapter aesthetic).

## Anti-patterns

- **Don't** put more than 7 items in NumberedList / Checklist / BulletReveal. The vertical canvas fits 5–7 comfortably; past 7, items shrink below readable size or get cropped at the bottom. For longer lists, split into two Sequences with a `SectionBreak` between.
- **Don't** speed up `framesPerItem` below 8. The eye needs ~250ms to absorb a list item — faster than 8f reads as motion blur, not content.
- **Don't** use Checklist for a list where items are pre-checked. The animation IS the check happening — pre-checked items have no reveal. Use BulletReveal instead.
- **Don't** put long sentences (>40 chars) in a NumberedList item. The component is sized for short labels ("Hydrate", "Sleep more", "Cut sugar"). Long sentences wrap weird and break the visual rhythm.
- **Don't** put a SectionBreak in a video without showing the chapter content right after. The card sets an expectation — if nothing follows, viewers feel cheated.
- **Don't** chain >2 RecipeSteps without a recipe-intro card. By step 3 the viewer needs context refresh — break to a wide shot of the dish before the next step.

## Composition Recipes

**"5 things you didn't know" list:**
```tsx
<Sequence durationInFrames={120}>
  <NumberedList
    title="5 things you didn't know"
    items={[
      "Bananas are berries",
      "Octopuses have three hearts",
      "Honey never spoils",
      "Sharks predate trees",
      "Bees can recognize faces",
    ]}
    framesPerItem={20}
  />
</Sequence>
```

**Multi-step tutorial (sequenced StepIndicators):**
```tsx
<Sequence from={0}   durationInFrames={120}><StepIndicator step={1} total={3} title="Install Remotion" /></Sequence>
<Sequence from={120}><YourClipForStep1 /></Sequence>
<Sequence from={X}   durationInFrames={120}><StepIndicator step={2} total={3} title="Write the composition" /></Sequence>
<Sequence from={X+120}><YourClipForStep2 /></Sequence>
<Sequence from={Y}   durationInFrames={120}><StepIndicator step={3} total={3} title="Render with --mute" /></Sequence>
```

**Morning routine checklist:**
```tsx
<Sequence durationInFrames={150}>
  <Checklist
    items={["Hydrate", "Stretch", "10-min walk", "Cold shower", "Journal"]}
    framesPerItem={18}
  />
</Sequence>
```

**Recipe walkthrough (landscape):**
```tsx
<Sequence durationInFrames={90}><RecipeStep step={1} instruction="Beat 3 eggs with salt" hint="Use a fork, not a whisk" /></Sequence>
<Sequence from={90} durationInFrames={X}><YourCookingClip /></Sequence>
<Sequence from={X+90} durationInFrames={90}><RecipeStep step={2} instruction="Heat butter in nonstick pan" hint="Medium-low, no smoke" /></Sequence>
```

**Long-form chaptering:**
```tsx
<Sequence from={0}   durationInFrames={90}><SectionBreak numeral="01" title="The setup" /></Sequence>
<Sequence from={90}><Chapter1Body /></Sequence>
<Sequence from={X}   durationInFrames={90}><SectionBreak numeral="02" title="The twist" /></Sequence>
<Sequence from={X+90}><Chapter2Body /></Sequence>
```

**Quick explainer (BulletReveal):**
```tsx
<Sequence durationInFrames={100}>
  <BulletReveal
    items={[
      "Same setup, less time",
      "Hydration matters",
      "Sleep is half the work",
    ]}
    framesPerItem={20}
  />
</Sequence>
```

## Common Prop Overrides

```tsx
// Brand accent
<NumberedList items={[...]} accent="#ff7a4d" />

// Slower per-item stagger (more reading time)
<Checklist items={[...]} framesPerItem={28} />

// StepIndicator with brand color
<StepIndicator step={2} total={5} title="Build it" accent="#10b981" />

// SectionBreak with custom numeral (Roman, word, etc.)
<SectionBreak numeral="III" title="The reckoning" />

// RecipeStep without hint
<RecipeStep step={5} instruction="Plate and serve" />
```

## Render Notes

- **Vertical 1080×1920** default for NumberedList / StepIndicator / Checklist / BulletReveal. **Landscape 1920×1080** for RecipeStep / SectionBreak.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For overlay (list on top of footage): set `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - NumberedList: items land at `i * framesPerItem + 14` → tick per item
  - StepIndicator: progress bar advances to step ratio at ~30f → "step click" SFX
  - Checklist: each check animation completes at `(i+1) * framesPerItem` → "tick" SFX per check
  - BulletReveal: bullet appears at `i * framesPerItem + 10` → soft pop per bullet
  - RecipeStep: card lands ~14f → page-turn or paper-shuffle SFX
  - SectionBreak: numeral lands ~12f → cinematic boom / film-thwack

## Pairing with other skills

- **NumberedList + ParticleField** (`remotion-backgrounds`) — list over a tech backdrop
- **StepIndicator + CodeSnippet** (`remotion-tech`) — tutorial flow showing the code at each step
- **Checklist + EndCard** (`remotion-stingers`) — to-do list at the outro
- **RecipeStep + SoundWaveBars** (`remotion-music-lyrics`) — cooking show with audio waves vibe
- **SectionBreak → ChapterBumper** (`remotion-stingers`) — these overlap; use SectionBreak for shorter beats, ChapterBumper for cinematic chapter moments
- **BulletReveal + WatchThisStamp** (`remotion-hooks`) — explainer points + emphasis stamp on the key bullet
