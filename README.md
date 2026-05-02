# Claude Bridge for Adobe Premiere Pro

A CEP panel that brings **Claude** straight into Premiere Pro. Chat, generate motion graphics with [Remotion](https://remotion.dev), and drop them onto your timeline — all without leaving your edit.

> Uses your existing **Claude Code subscription**. No API key required.

![status](https://img.shields.io/badge/Premiere_Pro-2025-9999ff) ![status](https://img.shields.io/badge/macOS-only-000) ![status](https://img.shields.io/badge/license-MIT-green)

---

## What it does

- **Chat with Claude** inside a panel docked in Premiere
- **Generate motion graphics** from natural language prompts — Claude uses the Remotion skill to render real MP4s
- **Auto-place renders on your timeline** in 3 modes: Insert, Overwrite, or Overlay (lowest empty track above your footage)
- **Reference images / videos** — paste, drag-drop, or pick files. Claude reads them and matches the visual style.
- **Inline AI prompt autocomplete** — start typing, see Claude finish your sentence in ghost text. Tab to accept.
- **Prompt Expand** — three intensity levels (Light / Medium / Heavy) that turn `"make a 3 second logo intro"` into a detailed creative brief with hex codes, easing curves, and second-by-second beats
- **History** of every render, with one-click re-import or "Use prompt" to iterate
- **Preview in Source Monitor** — click a button on any rendered file to load it into Premiere's source panel
- **Lightbox preview** for reference thumbnails

---

## Architecture

```
Premiere CEP Panel  ─HTTP─►  Local Node bridge  ─spawns─►  claude CLI
   (UI + ExtendScript)        (localhost:3737)             (your subscription)
```

- **Panel** (`extension/com.claudebridge.panel/`) — HTML/CSS/JS chat UI + ExtendScript (`host.jsx`) for timeline operations
- **Bridge** (`bridge/bridge.js`) — small Node HTTP server that spawns `claude -p` for each request, parses replies, and orchestrates Remotion renders
- **`claude` CLI** — Anthropic's Claude Code CLI; the bridge invokes it as a subprocess and uses your existing OAuth-authenticated session

---

## Requirements

- **macOS** (Darwin 22+) **or Windows 10/11**
- **Adobe Premiere Pro 2023+**
- **Node.js 18+** ([nodejs.org](https://nodejs.org))
- **Claude Code CLI** ([claude.com/product/claude-code](https://www.claude.com/product/claude-code)) — logged into your subscription
- **Remotion CLI deps** auto-installed on first render
- **ffmpeg** (optional, only for video reference frames) — `brew install ffmpeg` on macOS, [ffmpeg.org](https://ffmpeg.org/download.html) on Windows

---

## Quick install (one command)

```bash
# macOS
git clone https://github.com/iprincemax72-maker/claude-bridge-premiere.git
cd claude-bridge-premiere
bash install.sh
```

```powershell
# Windows (PowerShell)
git clone https://github.com/iprincemax72-maker/claude-bridge-premiere.git
cd claude-bridge-premiere
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer enables `PlayerDebugMode`, copies the panel into Adobe's CEP folder, drops the bridge into your home directory, and puts the launcher on your Desktop. Idempotent — safe to re-run for updates.

> **For AI agents:** see [CLAUDE.md](CLAUDE.md) for the full agent-facing install + operation guide.

---

## Manual install — macOS

### 1. Enable unsigned CEP extensions (one-time)

```bash
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

(Replace `CSXS.12` with `CSXS.11` for older Premiere versions.)

### 2. Drop the panel into the CEP extensions folder

```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions/
cp -R extension/com.claudebridge.panel \
  ~/Library/Application\ Support/Adobe/CEP/extensions/
```

### 3. Drop the bridge somewhere local

```bash
mkdir -p ~/PremiereClaude
cp bridge/bridge.js ~/PremiereClaude/
cp bridge/start.command ~/Desktop/"Claude Bridge.command"
chmod +x ~/Desktop/"Claude Bridge.command"
```

### 4. Make sure `claude` CLI works

```bash
claude --version
```

If not installed, follow [Claude Code install instructions](https://docs.claude.com/en/docs/claude-code).

---

## Manual install — Windows

### 1. Enable unsigned CEP extensions (one-time)

Open **PowerShell** and run:

```powershell
reg add "HKCU\Software\Adobe\CSXS.12" /t REG_SZ /v PlayerDebugMode /d 1 /f
```

(Replace `CSXS.12` with `CSXS.11` if you're on an older Premiere version.)

### 2. Drop the panel into the CEP extensions folder

```powershell
$dest = "$env:APPDATA\Adobe\CEP\extensions"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force extension\com.claudebridge.panel $dest\
```

### 3. Drop the bridge somewhere local

```powershell
$pc = "$env:USERPROFILE\PremiereClaude"
New-Item -ItemType Directory -Force -Path $pc | Out-Null
Copy-Item -Force bridge\bridge.js $pc\
Copy-Item -Force bridge\start.bat "$env:USERPROFILE\Desktop\Claude Bridge.bat"
```

### 4. Make sure `claude` CLI works

```powershell
claude --version
```

If not installed, follow the [Claude Code install instructions for Windows](https://docs.claude.com/en/docs/claude-code).

---

## Usage

1. **Start the bridge** by double-clicking the launcher on your Desktop:
   - macOS: `Claude Bridge.command`
   - Windows: `Claude Bridge.bat`

   A terminal window opens with the bridge running on `localhost:3737`.
2. **Open Premiere Pro** → **Window** → **Extensions** → **Claude**
3. Status pill turns green; type a prompt or click a suggestion chip and hit ↵
4. When you're done, **close the terminal window** to stop the bridge

### Keyboard shortcuts (inside the panel)

| Key | Action |
|---|---|
| ↵ | Send message |
| ⇧↵ | New line |
| ⇥ | Accept ghost-text autocomplete |
| ⇧V | Paste image from clipboard as reference |
| ⇧B | Paste text from clipboard at cursor |
| Esc | Cancel current request / close lightbox / close history |

### Example prompts

- *"Make a 3 second logo intro that says CRUXDEV in white on a deep blue gradient"*
- *"Create a sleek animated lower third with name and title"*
- *"Generate a clean 5 to 1 countdown with big white numerals on black"*
- *"Make a TikTok-style caption that pops in word by word with a slight bounce"*
- *"Create a 1 second glitch transition between two clips"*
- *"Make a YouTube end card with subscribe and next-video tile"*

Drop any image onto the input area first, then type *"make me an intro in this style"* — Claude will read your image and base the design on it.

---

## How the integration works

When you ask for motion graphics:

1. Panel sends `POST /chat` to the local bridge with your message + Premiere context (active sequence, playhead, selected clips)
2. Bridge spawns `claude -p` with a system prompt that tells it: *"You're inside Premiere. Use the Remotion skill. Render to `~/PremiereClaude/output/`. Emit `[[IMPORT:/path]]` markers when done."*
3. Claude scaffolds a Remotion project, writes the composition code, runs `npx remotion render`, and emits the import marker
4. Bridge returns the reply with parsed marker paths
5. Panel calls ExtendScript `ccImportToTimeline(path, mode)` — finds the imported `ProjectItem` recursively, places it on the right track per your active mode, and shows a `Preview` button receipt

**No streaming progress** — CEP's older Chromium buffers fetch responses, so you get an estimated progress bar instead of live status updates. The estimate uses an asymptotic curve based on what your prompt is asking for (chat ~25s baseline, render keywords ~180s, +25s for each reference).

---

## Performance notes (honest)

The Claude CLI cold-starts every spawn. There's no way around this without an API key and `--bare` mode (which the design intentionally avoids — this project uses your subscription). So:

- Simple chat reply: ~6-8s
- Inline autocomplete: ~7-10s after you pause typing
- Light expand: ~10s
- Medium expand: ~13s
- Heavy expand: ~25-30s
- First Remotion render: 3-5 minutes (npm install dominates)
- Subsequent renders in the same session: 30-60s

If you want sub-second autocomplete, run `claude setup-token` and modify the bridge to use `--bare` mode with `ANTHROPIC_API_KEY` — but that's not the default.

---

## File layout

```
extension/com.claudebridge.panel/
  index.html         # Entire UI (HTML + inline CSS + inline JS, ~46k lines of JS)
  CSXS/manifest.xml  # CEP manifest
  jsx/host.jsx       # ExtendScript: ccGetContext, ccImportToTimeline, ccOpenInSource

bridge/
  bridge.js          # Node HTTP server, spawns claude for each request
  start.command      # Double-clickable launcher for macOS Desktop
```

---

## Troubleshooting

**"Bridge offline"** — start the bridge by double-clicking `Claude Bridge.command`.

**Panel doesn't show up in Premiere** — ensure `PlayerDebugMode` is set (step 1 of install) and restart Premiere.

**"claude CLI not found"** — install the CLI; the bridge tries `/opt/homebrew/bin`, `/usr/local/bin`, and your `PATH`.

**Premiere crashes on heavy renders** — try restarting Premiere; the panel uses defensive ExtendScript but a fragile project state (locked tracks, missing media) can occasionally compound into a crash.

**Cmd+V doesn't paste** — Premiere captures it. Use **Shift+V** for images, **Shift+B** for text.

**Capital V or B won't type** — those keys are now reserved for Shift+V/B paste. Use Caps Lock instead.

---

## License

MIT. See [LICENSE](LICENSE).

This project is not affiliated with Anthropic or Adobe. "Claude" is a trademark of Anthropic; "Adobe Premiere Pro" is a trademark of Adobe.
