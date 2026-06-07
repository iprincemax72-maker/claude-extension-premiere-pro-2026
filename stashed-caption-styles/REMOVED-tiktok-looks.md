# Stashed caption styles — loud / TikTok looks

Removed from `extension/com.claudebridge.panel/index.html` on 2026-06-07 at the
user's request ("remove the tiktok ones, keep Karaoke + the clean ones").

**Kept:** Fade Up, Word by Word, Karaoke, Clean, Minimal+, Highlight, Editorial,
Type-on · Style cards: Fade Up, Word by Word, Classic, Minimal, Karaoke.

**Stashed here (this file):** Quick Looks → Pop, Beast, Beast Blue, Bold Yellow,
Neon, Rainbow · Style cards → Hormozi, Big Bold, TikTok Pop.

> The underlying render styles (`hormozi`, `reels`, `tiktok`, `karaoke`) still
> live in `Captions.tsx` and were NOT touched — so re-import is purely pasting the
> UI cards + `CAP_LOOKS` entries back. Nothing in the renderer needs to change.

---

## 1. Quick Look buttons

Re-insert **inside `<div class="cap-looks" id="capLooks">`**, right after the
`data-look="tiktok"` (Type-on) button:

```html
        <!-- Loud / TikTok-style looks to the RIGHT -->
        <button type="button" class="cap-look" data-look="pop"><span class="cap-look-prev"><b style="color:#FF5D8F;-webkit-text-stroke:1px #000">POP</b></span><span class="cap-look-name">Pop</span></button>
        <button type="button" class="cap-look" data-look="beast"><span class="cap-look-prev"><b style="color:#15110d;background:#F5C542;padding:2px 6px;border-radius:5px">BEAST</b></span><span class="cap-look-name">Beast</span></button>
        <button type="button" class="cap-look" data-look="beastblue"><span class="cap-look-prev"><b style="color:#fff;background:#5AA9FF;padding:2px 6px;border-radius:5px">BLUE</b></span><span class="cap-look-name">Beast Blue</span></button>
        <button type="button" class="cap-look" data-look="boldyellow"><span class="cap-look-prev"><b style="color:#F5C542;-webkit-text-stroke:1px #000">BOLD</b></span><span class="cap-look-name">Bold Yellow</span></button>
        <button type="button" class="cap-look" data-look="neon"><span class="cap-look-prev"><b style="color:#4ECB71;-webkit-text-stroke:1px #063">NEON</b></span><span class="cap-look-name">Neon</span></button>
        <button type="button" class="cap-look" data-look="rainbow"><span class="cap-look-prev"><b><span style="color:#E2885F">a</span><span style="color:#5AA9FF">b</span><span style="color:#4ECB71">c</span></b></span><span class="cap-look-name">Rainbow</span></button>
```

## 2. Style picker cards

Re-insert **inside `<div class="cap-styles" id="capStyles">`**, right after the
`data-style="karaoke"` (Karaoke) `<label>`:

```html
        <label class="cap-style" data-style="hormozi">
          <input type="radio" name="capStyle" value="hormozi">
          <div class="cap-style-name">Hormozi</div>
          <div class="cap-style-desc">Bold, active word in a color box</div>
          <div class="cap-style-prev"><span>big</span><b style="background:var(--accent-2);color:#15110d;padding:0 4px;border-radius:4px">BOLD</b></div>
        </label>
        <label class="cap-style" data-style="reels">
          <input type="radio" name="capStyle" value="reels">
          <div class="cap-style-name">Big Bold</div>
          <div class="cap-style-desc">Punchy spring pop, 1–3 words</div>
          <div class="cap-style-prev"><b class="hot" style="font-size:13px">BOLD</b></div>
        </label>
        <label class="cap-style" data-style="tiktok">
          <input type="radio" name="capStyle" value="tiktok">
          <div class="cap-style-name">TikTok Pop</div>
          <div class="cap-style-desc">Words type on with a little wobble</div>
          <div class="cap-style-prev"><span>type</span><span>on</span><b class="hot">pop</b></div>
        </label>
```

## 3. `CAP_LOOKS` preset entries

Re-insert into the `const CAP_LOOKS = { … }` object (order doesn't matter):

```js
  beast:     { style: 'hormozi', highlight: '#F5C542', uppercase: true,  fontWeight: 900, strokePx: 5, shadowPct: 55, vary: false, keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  beastblue: { style: 'hormozi', highlight: '#5AA9FF', uppercase: true,  fontWeight: 900, strokePx: 5, shadowPct: 55, vary: false, keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  pop:       { style: 'reels',   highlight: '#FF5D8F', uppercase: true,  fontWeight: 900, strokePx: 3, shadowPct: 55, vary: false, keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  boldyellow:{ style: 'reels',   highlight: '#F5C542', uppercase: true,  fontWeight: 900, strokePx: 3, shadowPct: 55, vary: false, keywords: true,  box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  rainbow:   { style: 'karaoke', highlight: '#E2885F', uppercase: true,  fontWeight: 800, strokePx: 2, shadowPct: 55, vary: true,  keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  neon:      { style: 'reels',   highlight: '#4ECB71', uppercase: true,  fontWeight: 900, strokePx: 3, shadowPct: 70, vary: false, keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#063b1e' },
```

---

To re-import: tell me "bring back the tiktok caption styles" and I'll paste these
three blocks back into `index.html` (and mirror to the installed panel).

---

# Also removed later: Karaoke (2026-06-07, follow-up)

User then asked to remove **Karaoke** too. The `karaoke` render style still lives
in `Captions.tsx` (the kept "Highlight" look uses it under the hood), so re-import
is again just pasting the UI card + look + `CAP_LOOKS` entry back.

## Quick Look button — re-insert in `#capLooks` (it sat before the `clean` button)

```html
        <button type="button" class="cap-look" data-look="karaoke"><span class="cap-look-prev"><b style="color:#fff;font-weight:700">word <span style="color:#E2885F">pop</span></b></span><span class="cap-look-name">Karaoke</span></button>
```

## Style card — re-insert in `#capStyles` (after the `minimal` card)

```html
        <!-- Highlight / loud styles to the RIGHT -->
        <label class="cap-style" data-style="karaoke">
          <input type="radio" name="capStyle" value="karaoke">
          <div class="cap-style-name">Karaoke</div>
          <div class="cap-style-desc">Active word highlights as it's spoken</div>
          <div class="cap-style-prev"><span>the</span><b class="hot">word</b><span>now</span></div>
        </label>
```

## `CAP_LOOKS` entry

```js
  karaoke:   { style: 'karaoke', highlight: '#E2885F', uppercase: false, fontWeight: 800, strokePx: 2, shadowPct: 55, vary: false, keywords: false, box: false, maxWords: 4, align: 'center', strokeColor: '#000000' },
```

---

# Also removed later: Minimal+, Highlight, Editorial, Type-on (2026-06-07, follow-up 2)

Removed these four **Quick Looks**, leaving only Fade Up, Word by Word, Clean.
Render styles (`minimal`, `karaoke`, `tiktok`) stay in `Captions.tsx`; re-import =
paste the buttons + `CAP_LOOKS` entries back into `#capLooks`.

## Quick Look buttons — re-insert in `#capLooks` (after the `clean` button)

```html
        <button type="button" class="cap-look" data-look="minimalkw"><span class="cap-look-prev"><b style="color:#fff;font-weight:700">go <span style="color:#4ECB71">green</span></b></span><span class="cap-look-name">Minimal+</span></button>
        <button type="button" class="cap-look" data-look="highlight"><span class="cap-look-prev"><b style="color:#fff;font-weight:700">it's <span style="color:#E2885F">key</span></b></span><span class="cap-look-name">Highlight</span></button>
        <button type="button" class="cap-look" data-look="editorial"><span class="cap-look-prev"><b style="color:#EDEAE3;font-weight:700;letter-spacing:.02em">editorial</b></span><span class="cap-look-name">Editorial</span></button>
        <button type="button" class="cap-look" data-look="tiktok"><span class="cap-look-prev"><b style="color:#5AA9FF">type on</b></span><span class="cap-look-name">Type-on</span></button>
```

## `CAP_LOOKS` entries

```js
  highlight: { style: 'karaoke', highlight: '#E2885F', uppercase: false, fontWeight: 800, strokePx: 2, shadowPct: 55, vary: false, keywords: true,  box: false, maxWords: 4, align: 'center', strokeColor: '#000000' },
  tiktok:    { style: 'tiktok',  highlight: '#5AA9FF', uppercase: false, fontWeight: 800, strokePx: 2, shadowPct: 55, vary: false, keywords: false, box: false, maxWords: 3, align: 'center', strokeColor: '#000000' },
  minimalkw: { style: 'minimal', highlight: '#4ECB71', uppercase: false, fontWeight: 700, strokePx: 0, shadowPct: 40, vary: false, keywords: true,  box: false, maxWords: 5, align: 'center', strokeColor: '#000000' },
  editorial: { style: 'minimal', highlight: '#EDEAE3', uppercase: false, fontWeight: 700, strokePx: 0, shadowPct: 45, vary: false, keywords: false, box: false, maxWords: 5, align: 'center', strokeColor: '#000000', trackingPct: 2, lineHtPct: 116 },
```
