# Reactions Catalog

| Component | Props | Lands |
|-----------|-------|-------|
| `MindBlown` | `emoji`, `size`, `color`, `startFrame`, `bg` | 🤯 with 12 radiating explosion lines |
| `FireBurst` | `count` (8), `emoji`, `durationFrames` (60), `bg` | Fire emojis rising fountain |
| `HundredSlam` | `emoji`, `size`, `startFrame`, `bg` | 💯 slams from above + impact rings |
| `HeartEyes` | `emoji`, `size`, `startFrame`, `bg` | 😍 with 6 mini hearts orbit-rising |
| `SideEye` | `emoji`, `size`, `from` ("left"\|"right"), `bg` | 👀 peeks from edge with shift |
| `CryingLaugh` | `emoji`, `size`, `corner`, `startFrame`, `bg` | 😂 bouncing loop in any corner |
| `EyesPeek` | `emoji`, `size`, `startFrame`, `holdFrames` (80), `bg` | 👀 rises, peeks, retreats |
| `SparkleField` | `count` (16), `emoji`, `durationFrames` (80), `bg` | ✨ pop around screen |

## Stack Recipes

**Punchline reaction sequence:**
```tsx
<Sequence durationInFrames={50}><HundredSlam /></Sequence>
<Sequence from={20}><FireBurst count={12} /></Sequence>
```

**"Sus" moment:**
```tsx
<SideEye from="right" />
<EyesPeek startFrame={30} />
```

**Cute/wholesome:**
```tsx
<HeartEyes />
<SparkleField count={20} />
```
