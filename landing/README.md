# Landing page — Flimify

A single, self-contained `index.html`. No build step, no dependencies (fonts load
from Google Fonts). Dark theme, Schibsted Grotesk + JetBrains Mono, coral accent.

## Run locally

```bash
cd landing
python3 -m http.server 8899
# open http://localhost:8899
```

## Deploy

It's one static file — host it anywhere:

- **Netlify / Vercel:** drag the `landing/` folder into the dashboard, or point a
  project at this repo with the publish/root directory set to `landing`.
- **GitHub Pages:** push and enable Pages on the `landing` folder (or copy the
  files to `/docs`).
- **Cloudflare Pages / S3 / any static host:** upload `index.html` + `og.png`.

No server-side code is required.

## Before you go live — fill these in

1. **Checkout + price** — bottom of `index.html`, the `CONFIG` block:
   ```js
   const CONFIG = {
     checkoutUrl: "#",      // your Stripe / Gumroad / Lemon Squeezy / Paddle link
     headlinePrice: "$19",  // price shown in the hero + CTA buttons
   };
   ```
   Every "Get it" button uses `checkoutUrl`; the hero/CTA price uses `headlinePrice`.
2. **Tier prices** — in the pricing section, edit `data-amt-m` (monthly) and
   `data-amt-a` (annual) on each tier, and the visible numbers.
3. **Demo video** — replace the `.video-frame` block (`<!-- DEMO -->`) with a
   YouTube/Vimeo `<iframe>` or a `<video>` tag. The current frame is a styled
   placeholder.
4. **Footer / legal links** — Terms, Privacy, Refunds, Contact, Changelog are `#`.
5. **Domain** — update `og:url`/canonical if you add them, and the meta `description`
   if you tweak the pitch.

## OG share image

`og.png` (1200×630) is rendered from `og.html`. To regenerate after a brand tweak,
open `og.html` at a 1200×630 viewport and screenshot it to `og.png`.

## Notes

- Fully responsive (verified 1440 / 900 / 760 / 390), no horizontal overflow,
  honours `prefers-reduced-motion`, and the content is visible even with JS off.
- **Social proof** is intentionally left out — add real testimonials once you have
  them rather than shipping placeholder quotes.
- **Remotion licensing:** the product renders with Remotion, which is
  source-available with a paid Company License for larger teams. Sort this out with
  the Remotion team before charging money / listing on a marketplace.
- The page is an independent extension and is not affiliated with Adobe or Anthropic
  (see the footer disclaimer).
