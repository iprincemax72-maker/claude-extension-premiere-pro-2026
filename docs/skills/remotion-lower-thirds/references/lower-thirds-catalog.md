# Lower Thirds Catalog

Five drop-in lower-third components. Full source is in [lower-thirds-source.tsx](./lower-thirds-source.tsx) — copy what you need into your project.

All five anchor at bottom-left with 80px / 120px title-safe padding for 1920×1080.

---

## 1. NewsBroadcast

**Effect:** Red bar slides in from the left with bold name on top, role on a black bar beneath. Quick spring entry.

```tsx
<NewsBroadcast
  name="VERA DIXIE"
  role="Content Creator"
  accent="#dc2626"  // bar color
  bg="transparent"   // for overlay use
/>
```

**Customization:** swap `accent` for any brand color. Drop `role` to get just the bar.

---

## 2. MinimalBauhaus

**Effect:** Thin accent line draws across, then text rises into place. Bauhaus geometric vibe.

```tsx
<MinimalBauhaus
  name="Vera Dixie"
  role="Vlogger · NYC"
  accent="#10b981"
  textColor="#ffffff"
  bg="transparent"
/>
```

**Customization:** white background variant looks great — flip `textColor` to `#0a0a0a` and skip `bg`. Increase the spring `stiffness` for a snappier entry.

---

## 3. RetroVhs

**Effect:** Chromatic RGB-split title with green REC badge. Glitches/jitters in for the first 14 frames, then settles. Mono font.

```tsx
<RetroVhs
  name="VERA"
  role="LIVE FROM NYC"
  bg="transparent"
/>
```

**Customization:** swap the RGB-split colors (`#ff2e63` red, `#28e1c5` cyan) for brand palette. Drop the role line for tighter look.

---

## 4. EditorialItalic

**Effect:** Magazine-style italic serif. Words fade in left-to-right, then a yellow highlighter underline draws beneath.

```tsx
<EditorialItalic
  name="Vera Dixie"
  role="The Standard"
  accent="#fde047"
  textColor="#ffffff"
  bg="transparent"
/>
```

**Customization:** swap to dark text on white for a true magazine feel. Bump `fontSize` (currently 72) up for hero moments.

---

## 5. GlitchLowerThird

**Effect:** Damaged-feed look — RGB-split title against a dark card with pink border. Random "tear" strips flicker for the first 18 frames. Settles into a clean state.

```tsx
<GlitchLowerThird
  name="VERA DIXIE"
  role="signal lost"
  bg="transparent"
/>
```

**Customization:** modify the tear-strip colors or count (currently 2 strips). Increase `glitch` decay length for longer chaos.

---

## Notes

- All five accept `bg="transparent"` — render to ProRes 4444 with `--codec prores --prores-profile 4444` to preserve alpha for Premiere.
- Default position is bottom-left (`LT_LEFT=80`, `LT_BOTTOM=120`). To move elsewhere, edit those constants at the top of the source file.
- Animations are entirely deterministic per-frame — no `useState`, no CSS transitions. Safe to render in Lambda or any parallel pipeline.
