# Stats Catalog

Full source in [stats-source.tsx](./stats-source.tsx).

## BarChartRace
```tsx
<BarChartRace
  data={[
    { label: "TikTok", value: 4200000, color: "#ec4899" },
    { label: "Instagram", value: 3100000, color: "#8b5cf6" },
    { label: "YouTube", value: 1800000, color: "#ef4444" },
    { label: "Twitter", value: 620000, color: "#06b6d4" },
  ]}
/>
```
Bars stagger in (6f delay each), fill from 0 → value with a spring, value text counts up alongside.

## ProgressRing
```tsx
<ProgressRing target={87} label="completion" color="#10b981" />
```
Circle stroke fills 0 → target%; big number in center counts up. Glow shadow on the active stroke.

## ComparisonBars
```tsx
<ComparisonBars
  a={{ label: "Before", value: 1200, color: "#ef4444" }}
  b={{ label: "After", value: 8400, color: "#10b981" }}
  unit=""
/>
```
Two vertical bars grow side-by-side from the bottom; numbers count up above each.

## StatCardGrid
```tsx
<StatCardGrid
  stats={[
    { value: 12500, prefix: "$", label: "Revenue" },
    { value: 87, suffix: "%", label: "Retention" },
    { value: 4200, label: "Customers", color: "#10b981" },
  ]}
/>
```
Three tiles pop in with stagger; each tile's number counts up from 0. Pass `color` per tile for emphasis on key metrics.
