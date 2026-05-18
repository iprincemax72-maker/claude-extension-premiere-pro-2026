---
name: remotion-quotes
description: Four editorial quote-card components for Remotion — PullQuote with accent bar, BigQuote full-frame editorial, QuoteWithAttribution with speaker name, and AuthorTagline corner-pull-quote. Use when the user asks for "quote card", "pull quote", "big quote", "editorial quote", "author tagline", "quote with name", or "podcast quote".
---

# Remotion Quotes

Four editorial-style quote cards for podcasts, interviews, books, or pull-quote moments. Render-verified to mp4.

- [Source](./references/quotes-source.tsx)

## The Four Quote Cards

| Name | Use | Choreography |
|------|-----|--------------|
| **PullQuote** | Italic serif with thick accent bar on the left | Bar draws 0–14f; text slides in 8–22f; bar pulses 3x then settles; idle breath after frame 30 |
| **BigQuote** | Full-frame editorial quote with huge quotation marks | Opening mark pops at frame 4; closing mark pops at 20 with 30° rotation; text fades+blurs in 0–26f; attribution at 20–34f |
| **QuoteWithAttribution** | Quote + speaker name + role beneath | Quote fade 0–20f; accent line draws 18–30f; name/role rises 24–36f |
| **AuthorTagline** | Small corner pull-quote with author tagline | Slide-in from corner side 0–14f via spring |

## When to Load

- "Pull quote / quote card / accent bar" → **PullQuote**
- "Big quote / editorial quote / massive quote / book quote" → **BigQuote**
- "Quote with name / who said / attribution / speaker" → **QuoteWithAttribution**
- "Author tagline / corner pull-quote" → **AuthorTagline**

## Golden rules

1. All four take a `quote` (or `text`) string. The italic serif (Times/Playfair/Georgia) is intentional — don't override to Helvetica.
2. **Default `bg` is `#1a1410`** on three of them (warm dark brown). AuthorTagline defaults to `bg="transparent"` because it's a corner overlay.
3. Animations are `useCurrentFrame()` driven, no `useState`.
4. **PullQuote and BigQuote are FULL-FRAME** components — sequence them in time, don't stack with other foregrounds (see the "stacking" anti-pattern in `TUTORIAL.md`).

## Anti-patterns

- **Don't** use BigQuote for short quotes (≤8 words). The 380-pixel opening/closing quotation marks dominate visually — short text in the middle reads as decoration around the marks rather than the focal point. Use PullQuote for short quotes.
- **Don't** put long attribution on BigQuote (>30 chars). The bottom-attribution is sized for "— Theodore Roosevelt" not "— Theodore Roosevelt, 26th President of the United States, in his 1899 speech…". For long context, use QuoteWithAttribution which gives more room for the role line.
- **Don't** use AuthorTagline as the only on-screen content. It's a corner accent meant to overlay other footage — by itself in an empty frame it feels lonely. Pair with body content (a talking head, a slideshow, etc.).
- **Don't** override PullQuote's italic serif font. The accent bar + bold italic combo is the visual identity; sans-serif text with an accent bar reads as a generic blockquote, not editorial.
- **Don't** chain three+ quote cards back-to-back. Quote-heavy content overwhelms; viewers tune out. Pair one quote with body footage / a stat reveal / a talking head between quotes.
- **Don't** use QuoteWithAttribution without filling in `role`. The component reserves space for the role line; omitting it leaves an awkward gap below the name. If you only have a name, use AuthorTagline.

## Composition Recipes

**Magazine pull-quote moment:**
```tsx
<Sequence durationInFrames={120}>
  <PullQuote quote="we are what we repeatedly do" accent="#ff7a4d" />
</Sequence>
```

**Cinematic chapter quote:**
```tsx
<Sequence durationInFrames={150}>
  <BigQuote
    quote="do what you can with what you have where you are"
    attribution="Theodore Roosevelt"
  />
</Sequence>
```

**Podcast guest quote with full attribution:**
```tsx
<Sequence durationInFrames={120}>
  <QuoteWithAttribution
    quote="small steps every day"
    name="Ansh Dhakad"
    role="creator, crux"
    accent="#10b981"
  />
</Sequence>
```

**Subtle corner tagline over real footage:**
```tsx
<AbsoluteFill>
  <YourFootage />
  <AbsoluteFill style={{ zIndex: 1 }}>
    <AuthorTagline
      quote="you cannot pour from an empty cup"
      author="ANCIENT WISDOM"
      corner="bottom-left"
    />
  </AbsoluteFill>
</AbsoluteFill>
```

## Common Prop Overrides

```tsx
// PullQuote brand color
<PullQuote quote="ship daily" accent="#7c3aed" />

// BigQuote on a brand-color background
<BigQuote quote="…" attribution="…" bg="#0a0a0a" markColor="#ff7a4d" />

// QuoteWithAttribution centered with smaller text
<QuoteWithAttribution quote="…" name="…" role="…" fontSize={70} />

// AuthorTagline in different corner
<AuthorTagline quote="…" author="…" corner="top-right" />
```

## Render Notes

- **1920×1080 landscape, 30fps** for PullQuote/BigQuote/QuoteWithAttribution. AuthorTagline works in either orientation since it's a corner overlay.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For transparent overlay (AuthorTagline specifically): render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - PullQuote: bar lands ~14f → pen-stroke SFX; bar pulses ~30f / ~36f / ~42f → soft taps
  - BigQuote: opening mark ~12f → "page-turn" SFX; closing mark ~28f → settling chime
  - QuoteWithAttribution: line draws ~24f → soft tick; name rises ~32f → "stamp" SFX
  - AuthorTagline: slides in ~14f → soft whoosh

## Pairing with other skills

- **PullQuote + ChapterBumper** (`remotion-stingers`) — chapter title introducing the quote
- **BigQuote + WavyLines** (`remotion-backgrounds`) — calm waves behind the editorial moment
- **QuoteWithAttribution + iMessageBubble** (`remotion-social-ui`) — quote shows where it came from in a chat
- **AuthorTagline + CornerWatermark** (`remotion-social-ui`) — opposite corners, tagline + brand
- **PullQuote → MarkerUnderline** (`remotion-text-presets`) — quote then highlight one key word that follows
