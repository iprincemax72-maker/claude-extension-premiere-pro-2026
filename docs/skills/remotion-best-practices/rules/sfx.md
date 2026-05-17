---
name: sfx
description: Including sound effects
metadata:
  tags: sfx, sound, effect, audio
---

To include a sound effect, use the `<Audio>` tag from `remotion` (NOT from `@remotion/sfx` — that package only exports URL constants, not the Audio component):

```tsx
import { Audio } from "remotion";
import { whoosh } from "@remotion/sfx";

<Audio src={whoosh} />;
```

Or pass the URL directly:

```tsx
import { Audio } from "remotion";

<Audio src="https://remotion.media/whoosh.wav" />;
```

The `@remotion/sfx` package (v4.0.462) exports these URL constants — drop-in safe for `<Audio src={...} />`:

| Import name          | URL                                              |
|----------------------|--------------------------------------------------|
| `whoosh`             | `https://remotion.media/whoosh.wav`              |
| `whip`               | `https://remotion.media/whip.wav`                |
| `pageTurn`           | `https://remotion.media/page-turn.wav`           |
| `uiSwitch`           | `https://remotion.media/switch.wav`              |
| `mouseClick`         | `https://remotion.media/mouse-click.wav`         |
| `shutterModern`      | `https://remotion.media/shutter-modern.wav`      |
| `shutterOld`         | `https://remotion.media/shutter-old.wav`         |
| `ding`               | `https://remotion.media/ding.wav`                |
| `bruh`               | `https://remotion.media/bruh.wav`                |
| `vineBoom`           | `https://remotion.media/vine-boom.wav`           |
| `windowsXpError`     | `https://remotion.media/windows-xp-error.wav`    |

Note: the pre-installed Remotion bridge renders SFX-free by default (`--mute` flag). Pass `withAudio: true` in metadata or remove the `--mute` flag at render time to include audio in the output.

For more sound effects, search the internet. A good resource is https://github.com/kapishdima/soundcn/tree/main/assets.
