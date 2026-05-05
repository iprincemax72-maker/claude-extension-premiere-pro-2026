# Claude Extension Premiere Pro 2026

A CEP panel that brings **Claude** straight into Premiere Pro. Chat, generate motion graphics with [Remotion](https://remotion.dev), and drop them onto your timeline — all without leaving your edit.

> Uses your existing **Claude Code subscription**. No API key required.

![status](https://img.shields.io/badge/Premiere_Pro-2024%2B-9999ff) ![status](https://img.shields.io/badge/macOS-supported-success) ![status](https://img.shields.io/badge/Windows-supported-success) ![status](https://img.shields.io/badge/license-MIT-green)

---

## What it does

- **Chat with Claude** inside a panel docked in Premiere
- **Generate motion graphics** from natural language — Claude uses the Remotion framework to render real MP4s
- **Render preview card** appears after every render with **Import to Timeline / Preview / Changes** buttons. Nothing is auto-imported; you decide.
- **Iterate cleanly** — the *Changes* button silently injects the original prompt + previous file path into your next message so Claude makes a true V2 of the same thing instead of a fresh design
- **Two timeline placement modes** — *Overwrite* (replace at playhead on V1) or *Overlay* (place on the lowest empty track above your footage). Sticky preference.
- **Reference images / videos** — paste, drag-drop, or pick. Claude reads them and matches the visual style.
- **Inline AI prompt autocomplete** — start typing, see Claude finish your sentence in ghost text. Tab to accept.
- **Prompt Extend** — three intensity buttons (Low / Mid / High) that turn `"make a 3 second logo intro"` into a detailed creative brief with hex codes, easing curves, and second-by-second beats
- **History** of every render with one-click *Preview*, *Use Prompt*, *Re-import*, *Changes*, and *Delete*
- **No audio in renders** — by default Claude won't add SFX, music, or stingers (unless you explicitly ask). Saves your ears.

---

## Architecture

```
Premiere CEP Panel  ─HTTP─►  Local Node bridge  ─spawns─►  claude CLI
   (UI + ExtendScript)        (localhost:3737)             (your subscription)
```

- **Panel** (`extension/com.claudebridge.panel/`) — HTML/CSS/JS chat UI + ExtendScript (`host.jsx`) for timeline operations
- **Bridge** (`bridge/bridge.js`) — Node HTTP server that spawns `claude -p` for each request, parses replies, orchestrates Remotion renders
- **Remotion template** (`bridge/remotion-template/`) — pre-scaffolded Remotion project the installer copies + npm-installs so first render is ~60s instead of ~5 min
- **`claude` CLI** — Anthropic's Claude Code CLI; the bridge invokes it as a subprocess and uses your existing OAuth-authenticated session

---

## Requirements

- **macOS** (Darwin 22+) **or Windows 10/11**
- **Adobe Premiere Pro 2024+** (tested on Premiere Pro 2026)
- **Claude Code** ([Pro or Max plan](https://www.claude.com/pricing)) — the bridge uses your Claude Code login, not an API key
- Internet — for downloading Node, Claude CLI, ffmpeg, and Remotion deps on first install

The auto-installer handles **Node.js**, **Claude Code CLI**, **ffmpeg**, and the **Remotion project setup** for you.

---

## Quick install — one command

> **Close Premiere Pro before installing** (so it picks up the new panel on next launch).

### macOS

```bash
git clone https://github.com/iprincemax72-maker/claude-extension-premiere-pro-2026.git
cd claude-extension-premiere-pro-2026
bash install.sh
```

### Windows (PowerShell)

```powershell
git clone https://github.com/iprincemax72-maker/claude-extension-premiere-pro-2026.git
cd claude-extension-premiere-pro-2026
powershell -ExecutionPolicy Bypass -File install.ps1
```

What the installer does:

1. Auto-installs **Node.js LTS**, **Claude Code CLI**, **ffmpeg** if missing (via `brew` on macOS, `winget` on Windows, then `npm` for Claude CLI)
2. Checks Claude CLI authentication and tells you to run `claude /login` if not
3. Enables `PlayerDebugMode` for CSXS 8–12 (HKCU on Windows, no admin)
4. Copies the panel into Adobe's CEP folder
5. Drops the bridge into `~/PremiereClaude/`
6. Pre-scaffolds the Remotion project and runs `npm install` (the slow step — 2–4 min)
7. Places the desktop launcher

Idempotent — safe to re-run for updates.

### One-time after install: log in to Claude

If the installer warns *"Claude CLI may not be logged in"*, open a new terminal and run:

```bash
claude /login
```

A browser tab opens; click **Allow**. You're set.

> **For AI agents:** see [CLAUDE.md](CLAUDE.md) for the full step-by-step install + verification playbook.

---

## Usage

1. **Start the bridge** by double-clicking the launcher on your Desktop:
   - macOS: `Claude Bridge.command`
   - Windows: `Claude Bridge.bat`

   A terminal window opens with the bridge running on `localhost:3737`.
2. **Open Premiere Pro** → **Window** → **Extensions** → **Claude**
3. Status pill turns green; type a prompt or click a suggestion chip and hit ↵
4. After render, the panel shows a card with **Import to Timeline / Preview / Changes** — click whichever you want
5. When you're done, **close the bridge terminal window** to stop the server

### Keyboard shortcuts (inside the panel)

| Key | Action |
|---|---|
| ↵ | Send message |
| ⇧↵ | New line |
| ⇥ | Accept ghost-text autocomplete |
| ⇧V | Paste **text** from clipboard at cursor |
| ⇧B | Paste **image** from clipboard as reference |
| ⇧C | Copy selected text (anywhere on the page) — falls back to input value |
| ` | Toggle Premiere's **Maximize Frame** for the panel |
| Esc | Cancel current request / close lightbox / close history |

### Example prompts

- *"Make a 3 second logo intro that says CRUXDEV in white on a deep blue gradient"*
- *"Create a sleek animated lower third with name and title"*
- *"Generate a clean 5 to 1 countdown with big white numerals on black"*
- *"Make a TikTok-style caption that pops in word by word with a slight bounce"*
- *"Create a 1 second glitch transition between two clips"*
- *"Make a YouTube end card with subscribe and next-video tile"*

Drop any image onto the input area first, then type *"make me an intro in this style"* — Claude reads your image and bases the design on it.

### Iterating with the Changes button

After a render, click **Changes** on the card (or in History → Changes on any past render). The composer focuses with a small chip *"Iterating on filename.mp4 ✕"*. Type just your tweak — *"make the bell red"*, *"shorter to 2 seconds"*, *"darker background"* — and send. Claude finds the existing component and modifies it minimally, keeping every other styling decision intact.

Without the Changes button, every prompt is a fresh design — different colors, layout, motion. Use Changes when you want V2/V3 of the same thing.

---

## How the integration works

When you ask for motion graphics:

1. Panel sends `POST /chat` to the local bridge with your message + Premiere context (active sequence, playhead, selected clips)
2. Bridge spawns `claude -p` with a system prompt that tells it: *"You're inside Premiere. Use the pre-scaffolded Remotion project at `~/PremiereClaude/remotion-intro/`. Render to `~/PremiereClaude/output/`. Emit `[[IMPORT:/path]]` markers when done. No audio."*
3. Claude writes a new composition file in `src/`, registers it in `Root.tsx`, runs `npx remotion render`, and emits the import marker
4. Bridge returns the reply with parsed marker paths
5. Panel renders a **Render Preview card**. Clicking *Import to Timeline* calls ExtendScript `ccImportToTimeline(path, mode)` — finds the `ProjectItem`, places it on the right track per your active mode, and shows a receipt.

**No streaming progress** — CEP's older Chromium buffers fetch responses, so you get an estimated progress bar instead of live status updates. The estimate uses an asymptotic curve based on what your prompt is asking for.

---

## Performance notes (honest)

The Claude CLI cold-starts every spawn. There's no way around this without an API key and `--bare` mode (which the design intentionally avoids — this project uses your subscription).

| Operation | Wall time |
|---|---|
| Simple chat reply | ~12s |
| Inline autocomplete | ~7-10s after you pause typing |
| Light expand | ~10s |
| Mid expand | ~13s |
| High expand | ~25-30s |
| Simple render (intro, lower third, caption) | ~55s |
| Complex render (multi-scene, 3D, particles) | ~110s |
| Iteration via Changes button | ~35s |
| Reference image/video | +20s |

> **First-render speed** comes from the pre-scaffolded Remotion project. The installer runs `npm install` once during setup — your first user prompt afterward doesn't pay that cost.

---

## File layout

```
extension/com.claudebridge.panel/
  index.html         # Entire UI (HTML + inline CSS + inline JS)
  CSXS/manifest.xml  # CEP manifest, hosts PPRO 23+
  jsx/host.jsx       # ExtendScript: ccGetContext, ccImportToTimeline,
                     # ccOpenInSource, ccImportFile, ccMaximizeFrame

bridge/
  bridge.js                # Node HTTP server, spawns claude per request
  start.command            # macOS Desktop launcher
  start.bat                # Windows Desktop launcher
  remotion-template/       # Pre-scaffolded Remotion project the installer
    package.json           # copies to ~/PremiereClaude/remotion-intro/ and
    src/Root.tsx           # npm-installs once during setup
    src/HelloWorld.tsx
    src/index.ts
    tsconfig.json
    remotion.config.ts

install.sh    # macOS auto-installer
install.ps1   # Windows auto-installer
CLAUDE.md     # Agent-facing install + operation guide
```

After install, your runtime locations:

- `~/PremiereClaude/bridge.js` — running bridge
- `~/PremiereClaude/remotion-intro/` — pre-scaffolded Remotion project (Claude adds new compositions here)
- `~/PremiereClaude/output/` — rendered files, pasted images, ffmpeg keyframes
- `~/PremiereClaude/bridge.log` — bridge stdout/stderr
- `~/Library/Application Support/Adobe/CEP/extensions/com.claudebridge.panel/` (macOS)
- `%APPDATA%\Adobe\CEP\extensions\com.claudebridge.panel\` (Windows)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| **"Bridge offline"** in panel | Start the bridge — double-click `Claude Bridge.command` (macOS) or `Claude Bridge.bat` (Windows) on your Desktop |
| **Panel doesn't appear in Premiere** | Restart Premiere completely. If still missing, `PlayerDebugMode` didn't apply or the panel folder didn't copy — re-run the installer. |
| **`claude` not found after install** | The npm global bin isn't on PATH yet. Open a fresh shell and re-run `install.sh` / `install.ps1`. On Windows you may need to add `$(npm config get prefix)` to PATH manually. |
| **First render takes 5+ minutes** | The installer's `npm install` for Remotion may have failed. Check `~/PremiereClaude/remotion-intro/node_modules/remotion` exists. If not: `cd ~/PremiereClaude/remotion-intro && npm install`. |
| **Render fails with "ffmpeg not found"** | Install manually: `brew install ffmpeg` (macOS) or `winget install -e --id Gyan.FFmpeg` (Windows) |
| **Claude says "5-hour usage limit reached"** | You've burned through your Claude Code plan quota. Wait or upgrade your plan. |
| **Premiere crashes on heavy renders** | Restart Premiere. Try simpler prompts; complex multi-scene renders can compound into rare crashes. |
| **Cmd+V doesn't paste** | Premiere captures it. Use **Shift+V** for text, **Shift+B** for images. |
| **Capital V / B / C won't type** | Those keys are reserved for Shift+V/B/C shortcuts. Use Caps Lock instead. |

---

## License

MIT. See [LICENSE](LICENSE).

This project is not affiliated with Anthropic or Adobe. "Claude" is a trademark of Anthropic; "Adobe Premiere Pro" is a trademark of Adobe.
