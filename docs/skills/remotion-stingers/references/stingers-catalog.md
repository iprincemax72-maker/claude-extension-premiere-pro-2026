# Stingers Catalog

Full source in [stingers-source.tsx](./stingers-source.tsx).

## BrandReveal
```tsx
<BrandReveal brand="CRUXDEV" tagline="Tools for Creators" accent="#10b981" />
```
Mask-wipe from center reveals the brand text; line draws beneath; tagline fades in last.

## EndCard
```tsx
<EndCard primary="THANKS FOR WATCHING" secondary="Like · Subscribe · See you next time" accent="#ef4444" />
```
Primary title bounces up; subscribe row springs in below with a pulsing heart icon.

## ChapterBumper
```tsx
<ChapterBumper number="02" title="The Reckoning" numLabel="PART" accent="#10b981" />
```
Tiny "PART 02" tag + horizontal divider that draws + big italic serif title that rises in.

## SponsorPlate
```tsx
<SponsorPlate sponsor="ACME" prefix="BROUGHT TO YOU BY" />
```
White card pops in with bouncy spring; subtle prefix above, large brand name below.

## Pairing with audio

These look great with a sound stinger underneath — a brand sound, whoosh, or short musical sting. Drop a `<Audio>` track in the parent composition synced to the stinger's duration.
