# CLAUDE.md — Agent install + operation guide

> Hi Claude. The user wants you to install or work on **Claude Extension Premiere Pro 2026**. This file tells you exactly what to do, in order, with verification steps. Read it end-to-end before acting.

---

## What this project is (in 30 seconds)

A CEP panel that lets the user chat with Claude inside Adobe Premiere Pro and have AI-generated motion graphics (rendered via the Remotion skill) drop straight onto their timeline.

```
Premiere CEP Panel  ─HTTP─►  Local Node bridge  ─spawn─►  claude CLI
   (UI + ExtendScript)        (localhost:3737)            (subscription)
```

Three parts:
- **Panel** at `extension/com.claudebridge.panel/` — HTML/CSS/JS UI + `host.jsx` (ExtendScript for timeline operations)
- **Bridge** at `bridge/bridge.js` — small Node HTTP server that spawns `claude -p` for each request
- **Launchers** at `bridge/start.command` (macOS) and `bridge/start.bat` (Windows)

The user runs on a **Claude Code subscription, not API key**. The bridge invokes the `claude` CLI as a subprocess so every call uses the user's existing OAuth-authenticated session. Do **not** suggest API-key paths unless the user explicitly asks.

---

## INSTALL — one command

There is a single installer per OS. Run it from the repo root.

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

The installer is **idempotent** — re-running it is safe and updates files in place. It will:

1. Check that `node` and `claude` CLI are installed (warns if missing, points to install URLs)
2. Enable `PlayerDebugMode` for CSXS versions 8–12 (no admin needed — uses HKCU on Windows)
3. Copy the panel to the Adobe CEP extensions folder
4. Copy the bridge to `~/PremiereClaude/` (macOS) or `%USERPROFILE%\PremiereClaude\` (Windows)
5. Place the desktop launcher
6. Print next-steps

### What to tell the user when done

> "Installed. Double-click **Claude Bridge.command** (macOS) or **Claude Bridge.bat** (Windows) on your Desktop, then open Premiere → Window → Extensions → Claude."

### Manual install (only if the installer fails)

<details>
<summary>Click to expand manual steps</summary>

#### Step 1. Enable unsigned CEP extensions

**macOS:** `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`
**Windows:** `reg add "HKCU\Software\Adobe\CSXS.12" /t REG_SZ /v PlayerDebugMode /d 1 /f`

#### Step 2. Copy the panel

**macOS:**
```bash
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions/
cp -R extension/com.claudebridge.panel ~/Library/Application\ Support/Adobe/CEP/extensions/
```

**Windows:**
```powershell
$dest = "$env:APPDATA\Adobe\CEP\extensions"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Recurse -Force extension\com.claudebridge.panel $dest\
```

#### Step 3. Drop the bridge

**macOS:**
```bash
mkdir -p ~/PremiereClaude
cp bridge/bridge.js ~/PremiereClaude/
cp bridge/start.command ~/Desktop/"Claude Bridge.command"
chmod +x ~/Desktop/"Claude Bridge.command"
```

**Windows:**
```powershell
$pc = "$env:USERPROFILE\PremiereClaude"
New-Item -ItemType Directory -Force -Path $pc | Out-Null
Copy-Item -Force bridge\bridge.js $pc\
Copy-Item -Force bridge\start.bat "$env:USERPROFILE\Desktop\Claude Bridge.bat"
```

</details>

---

## OPERATING the system

### Starting the bridge

**Always tell the user to launch the desktop file themselves.** Do NOT try to `spawn` `node bridge.js` from inside the CEP panel — that path was tried and failed in the user's CEP build (sandbox restriction). The launcher must be a separate process the user owns.

### Restarting the bridge after editing `bridge.js`

```bash
# macOS
lsof -ti tcp:3737 | xargs kill -9 2>/dev/null
node ~/PremiereClaude/bridge.js
```

```powershell
# Windows
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3737 ^| findstr LISTENING') do taskkill /F /PID %a
node "$env:USERPROFILE\PremiereClaude\bridge.js"
```

### Reloading the panel after editing `index.html` / `host.jsx`

User must close the panel and reopen it (Window → Extensions → Claude). For ExtendScript changes (`host.jsx`), they often need to **restart Premiere** because Premiere caches `.jsx` for the session.

### Health check

```bash
curl -s http://127.0.0.1:3737/ping
# Expected: {"ok":true,"session":"<uuid>","outputDir":"..."}
```

---

## Bridge endpoints (`bridge/bridge.js`)

| Endpoint | Method | Body | Returns |
|----------|--------|------|---------|
| `/ping` | GET | — | `{ok, session, outputDir}` |
| `/chat` | POST | `{message, context}` | `{reply, imports[]}` — plain JSON, NOT streaming |
| `/complete` | POST | `{prefix}` | `{completion}` — for autocomplete (Haiku, no session persistence) |
| `/expand` | POST | `{prompt, level: 'light'\|'medium'\|'heavy'}` | `{expanded}` — uses Opus by default |

All endpoints kill the spawned `claude` subprocess on `req.on('aborted')` for cancellation support.

---

## ExtendScript functions (`extension/com.claudebridge.panel/jsx/host.jsx`)

Every function returns a JSON string. Wrap every operation in try/catch — Premiere is fragile.

- `ccGetContext()` → project name, sequence name, playhead seconds, selected clips
- `ccImportToTimeline(path, mode)` — `mode` is `'insert'`, `'overwrite'`, or `'overlay'`. Imports the file, finds the `ProjectItem`, places on the right track.
- `ccOpenInSource(path)` — loads file in Premiere's Source Monitor (`app.sourceMonitor.openProjectItem`)
- `ccImportFile(path)` — bin import only, no timeline placement (legacy fallback)

---

## Hard performance limits (DO NOT promise faster than these)

The Claude CLI cold-starts every spawn (~6-8s, unavoidable without `--bare` mode + API key). So:

| Operation | Wall time |
|---|---|
| Simple chat reply | 6-8s |
| Inline autocomplete | 7-10s after pause |
| Light prompt expand | ~10s |
| Medium expand | ~13s |
| Heavy expand | ~25-30s |
| First Remotion render | 3-5 minutes (`npm install` dominates) |
| Subsequent renders | 30-60s |

**Streaming progress does not work in CEP.** CEP's older Chromium buffers fetch responses. Don't try `stream-json` — it was tried and reverted. The panel uses an **estimated progress bar** (`(1 − e^−t/T) × 92%`) instead.

---

## When working on the project

### Things that crash Premiere — avoid

- `backdrop-filter`, animated radial gradients with `filter: blur()`, GPU-heavy CSS
- `evalScript` polling faster than ~10s
- Unwrapped ExtendScript operations (every single `.children`, `.numItems`, etc. must be in try/catch)
- `new Time()` constructor (not in all PPro versions)
- Recursive bin walks without depth limits

### Things that work reliably

- `claude -p --resume <SESSION_ID>` for chat continuity
- `--append-system-prompt <text>` for project-specific behavior
- `--permission-mode bypassPermissions` for unattended Remotion installs/renders
- Plain JSON `/chat` (NOT streaming)
- Defensive ExtendScript with `_ccSafe(fn)` helpers

---

## File layout

```
.
├── README.md                       # User-facing install + usage
├── CLAUDE.md                       # This file
├── LICENSE                         # MIT
├── .gitignore
├── bridge/
│   ├── bridge.js                   # Node HTTP server
│   ├── start.command               # macOS launcher (double-click)
│   └── start.bat                   # Windows launcher (double-click)
└── extension/
    └── com.claudebridge.panel/
        ├── index.html              # Entire UI (HTML + inline CSS + inline JS)
        ├── CSXS/manifest.xml       # CEP manifest, hosts PPRO 23+
        └── jsx/host.jsx            # ExtendScript bridge
```

User's runtime locations (after install):
- `~/PremiereClaude/bridge.js` — running bridge
- `~/PremiereClaude/output/` — rendered files, pasted images, ffmpeg keyframes
- `~/PremiereClaude/bridge.log` — bridge stdout/stderr
- `~/Library/Application Support/Adobe/CEP/extensions/com.claudebridge.panel/` (macOS)
- `%APPDATA%\Adobe\CEP\extensions\com.claudebridge.panel\` (Windows)

---

## User collaboration style

The user is a **freelance video editor doing short-form social content**. Casual, direct, swears occasionally. Imperfect English in messages — translate intent generously, don't ask for clarification when you can guess.

- Action over analysis. Build, don't deliberate.
- No filler ("Sure, I'll help…" is forbidden). State what you're doing in one line, then do it.
- Hates broken features. If something can't work robustly, say so up front and offer a workaround.
- Don't create extra docs/READMEs unless explicitly asked.
- Wants to see things WORK over polish.
- OK with bold suggestions — they'll redirect if it's wrong.

---

## Common user complaints — quick triage

| Symptom | Likely cause | Fix |
|---|---|---|
| "Bridge offline" | Bridge process not running | Run `Claude Bridge.command` / `Claude Bridge.bat` |
| "Stuck on Working" | First-time Remotion render — `npm install` + render takes 3-5 min on first call | Tell user to wait; check `~/PremiereClaude/bridge.log` |
| Premiere crashes | Heavy CSS in panel OR fragile ExtendScript | Strip GPU effects, wrap ExtendScript in try/catch |
| "Can't paste text" | Old paste handler called preventDefault on image clipboards (already fixed) | Verify `paste` handler in `index.html` doesn't call `preventDefault` |
| "Cmd+V doesn't work" | Premiere captures Cmd+V | Use Shift+V (image) or Shift+B (text) |
| Capital V/B doesn't type | Reserved for Shift+V/B paste | User uses Caps Lock |

---

## What's not yet built (open follow-ups)

These were proposed and the user hasn't said yes yet — feel free to suggest them again:

1. **Use current frame as reference** — one-click button to grab the program-monitor frame at playhead via ExtendScript and auto-attach it
2. **Iterate / Adjust on last render** — receipt grows an `Adjust` button that pre-fills `[Adjusting last render at /path/...]` and tells Claude to reuse the existing Remotion project
3. **Auto-caption a selected audio clip** — local whisper.cpp transcription + animated TikTok-style captions on V2

---

*This file is the source of truth for AI agents working on this project. If you change architecture or behavior, update this file in the same commit.*
