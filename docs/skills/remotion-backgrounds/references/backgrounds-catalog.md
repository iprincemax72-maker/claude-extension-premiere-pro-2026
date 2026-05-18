# Backgrounds Catalog

Full source in [backgrounds-source.tsx](./backgrounds-source.tsx).

## AnimatedGradient
```tsx
<AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" colorC="#0a0a0a" speed={1} />
```
Two radial-gradient blobs drift across a base color. Speed `1` is calm; `3` is fast. Great brand-color backdrop.

## ParticleField
```tsx
<ParticleField count={80} color="#ffffff" bg="#0a0a0a" />
```
Pre-computed dot positions with parallax depth (smaller dots = dimmer = "farther"). Drift speed varies per dot for natural motion.

## NoiseGrain
```tsx
<NoiseGrain bg="#0a0a0a" intensity={0.4} monochrome={true} />
```
Fizzy procedural noise — new pattern every frame. Use as overlay (low opacity) for vintage texture, or standalone for TV-static title cards.

## WavyLines
```tsx
<WavyLines color="#10b981" bg="#0a0a0a" lines={7} />
```
SVG sine-wave lines with phase-staggered animation. Calm, designed feel.
