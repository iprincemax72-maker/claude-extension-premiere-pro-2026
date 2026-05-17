---
name: remotion-reactions
description: Eight emoji-driven reaction components for Remotion — mind-blown explosion, fire emoji burst, 100 emoji slam, heart-eyes, side-eye peek, crying-laugh loop, eyes peek, and sparkle particles. Use when the user asks for "mind blown", "fire burst", "100 slam", "heart eyes", "side eye", "crying laugh", "eyes peek", "sparkles", or any meme-reaction overlay.
---

# Remotion Reactions

Eight emoji-and-particle reaction overlays for short-form video. Each is a self-contained punchy moment that lands in <60 frames.

## Quick Reference

- [Reactions Catalog](./references/reactions-catalog.md)
- [Source](./references/reactions-source.tsx)

## The Eight Reactions

| Name | Vibe | Mechanic |
|------|------|----------|
| **MindBlown** | 🤯 mind-blown moment | Big emoji + radiating explosion lines |
| **FireBurst** | 🔥 hype/spicy reaction | 6-8 fire emojis rising + drift |
| **HundredSlam** | 💯 facts | Slams in from above with shake |
| **HeartEyes** | 😍 love reaction | Pops in with floating heart particles |
| **SideEye** | 👀 suspicious | Peeks in from corner with shifty motion |
| **CryingLaugh** | 😂 dying laughing | Bounces in corner with tear-drop loop |
| **EyesPeek** | 👀 looking | Eyes rise from bottom, peek, retreat |
| **SparkleField** | ✨ magical | Sparkles pop around screen, slow fade |

## When to Load

- "Mind blown / 🤯 / brain exploding" → **MindBlown**
- "Fire / 🔥 / spicy / hype" → **FireBurst**
- "100 / 💯 / facts / no cap" → **HundredSlam**
- "Heart eyes / love / 😍" → **HeartEyes**
- "Side eye / suspicious / 👀 sus" → **SideEye**
- "Crying laughing / 😂 / dying / hilarious" → **CryingLaugh**
- "Eyes / 👀 peek / curious" → **EyesPeek**
- "Sparkles / ✨ / magical / glitter" → **SparkleField**

## Golden Rules

1. All `useCurrentFrame()` + `interpolate()`/`spring()`. Deterministic.
2. Most reactions LOOP after their entrance so they hold beat for multiple seconds.
3. Render with `--mute` + transparent bg for overlay use. (`--audio-codec=no-audio` is an invalid Remotion flag.)
4. Pair with a sound effect (Premiere side) for max impact.
