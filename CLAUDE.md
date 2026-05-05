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

## INSTALL — for AI agents (one prompt, end-to-end)

> **If you are an AI agent installing this for the user, follow this section literally. Do every step. Do not skip verification.** If a step fails, do the troubleshooting in that step before moving on. Do NOT improvise — every command here is here for a reason.

### Prerequisites the user must already have

- Adobe Premiere Pro 2024 or newer (panel targets 23+, tested on Premiere Pro 2026)
- Internet connection (to install Node, Claude CLI, ffmpeg, and Remotion's npm deps on first render)
- A Claude.ai paid plan (Pro or Max) — the bridge spawns the `claude` CLI and uses the user's existing OAuth session, NOT an API key

If the user does NOT have Premiere installed yet, stop and tell them to install it first.

### Step 1. Clone the repo

```bash
# macOS
cd ~ && git clone https://github.com/iprincemax72-maker/claude-extension-premiere-pro-2026.git
cd claude-extension-premiere-pro-2026
```

```powershell
# Windows
cd $HOME ; git clone https://github.com/iprincemax72-maker/claude-extension-premiere-pro-2026.git
cd claude-extension-premiere-pro-2026
```

If `git` is missing on Windows: `winget install -e --id Git.Git` and open a new shell.
If on macOS: `xcode-select --install` (Apple's built-in dev tools include git).

### Step 2. Run the auto-installer

The installer will auto-install Node.js, Claude CLI, and ffmpeg if any are missing.

```bash
# macOS
bash install.sh
```

```powershell
# Windows — IMPORTANT: must be run with the bypass flag, otherwise PowerShell blocks it
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer is **idempotent** — safe to re-run if anything went sideways.

### Step 3. Verify the bridge runs

After the installer finishes, the user has a `Claude Bridge.command` (macOS) or `Claude Bridge.bat` (Windows) on their Desktop. Tell them to double-click it. A terminal window will pop up showing `Claude Bridge listening on port 3737`.

Then verify from your AI shell:

```bash
# both OSes
curl -s http://127.0.0.1:3737/ping
# Expected output: {"ok":true,"session":"<uuid>","outputDir":"..."}
```

If `curl` returns nothing or "connection refused", the bridge isn't running. Common causes:
- The user closed the terminal window — tell them to re-launch the desktop file
- Port 3737 is in use — `lsof -ti tcp:3737 | xargs kill -9` (macOS) or `Get-NetTCPConnection -LocalPort 3737 | %{ Stop-Process -Id $_.OwningProcess -Force }` (Windows)

### Step 4. Verify Claude CLI is authenticated

```bash
claude /doctor
```

Look for "logged in" / "authenticated" / "account:" in the output. If not authenticated:

```bash
claude /login
```

This opens a browser tab; user clicks Allow. After they're back in the terminal, run `claude /doctor` again to confirm.

### Step 5. Verify the panel loads in Premiere

Tell the user to:
1. Open Adobe Premiere Pro
2. Window menu → Extensions → **Claude**

If "Claude" doesn't appear in Extensions:
- The user must restart Premiere completely (not just close the project)
- If still missing, the panel folder didn't copy correctly. Re-run the installer.

If the panel opens but says "Bridge offline" or the status pill is red:
- The bridge isn't running. See Step 3.

### Step 6. Smoke test

Tell the user to type into the panel: `Generate a 3 second logo intro that says HELLO in white on dark blue`

The pre-scaffolded Remotion project means first render is ~60s, not 3–5 min. If `~/PremiereClaude/remotion-intro/node_modules/remotion` doesn't exist (installer's npm install failed), the first render falls back to installing — that's when you'd see 3–5 min.

### Optional: Remotion best-practice skills

If the user wants higher-quality Remotion output, you can install community skills like `remotion-video-skill` and `remotion-best-practices`. The bridge's system prompt tells Claude to use them if available, and falls back to direct Remotion code (from training knowledge) if not. **Plain installs work fine without these skills.**

### Common install failures and fixes

| Symptom | Cause | Fix |
|---|---|---|
| `node` not found after install | New PATH not loaded | Open a fresh shell and re-run installer |
| `claude` not found after install | Same — npm global bin not on PATH | Open fresh shell. On Windows, also try: `npm config get prefix` and ensure that path is in PATH |
| Installer says winget/brew missing | OS package manager not installed | Win: install App Installer from MS Store. Mac: install Homebrew at https://brew.sh |
| Panel doesn't show in Premiere | PlayerDebugMode didn't apply, or panel folder didn't copy | Re-run installer; check `%APPDATA%\Adobe\CEP\extensions\com.claudebridge.panel\index.html` (Win) or `~/Library/Application Support/Adobe/CEP/extensions/com.claudebridge.panel/index.html` (Mac) exists |
| Render fails with "ffmpeg not found" | Remotion can't find ffmpeg | Install ffmpeg manually: `brew install ffmpeg` (Mac) or `winget install -e --id Gyan.FFmpeg` (Win) |
| First render times out / takes forever | Remotion is doing initial `npm install` | Look at `~/PremiereClaude/bridge.log` — if it shows `npm install` running, just wait. 3–5 min is normal first time. |
| `claude` CLI hits 5-hour usage limit | User burned through their plan quota | Wait or upgrade plan. Bridge will report errors back to panel. |

### Manual install (only if the auto-installer hard-fails)

<details>
<summary>Click to expand manual steps</summary>

#### Step 1. Install dependencies

**macOS:**
```bash
brew install node ffmpeg
npm install -g @anthropic-ai/claude-code
claude /login
```

**Windows:**
```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Gyan.FFmpeg
# open a NEW PowerShell window so PATH refreshes
npm install -g "@anthropic-ai/claude-code"
claude /login
```

#### Step 2. Enable unsigned CEP extensions

**macOS:** `for v in 8 9 10 11 12; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done`
**Windows:**
```powershell
8..12 | % { New-Item -Path "HKCU:\Software\Adobe\CSXS.$_" -Force | Out-Null; New-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.$_" -Name PlayerDebugMode -Value 1 -PropertyType String -Force | Out-Null }
```

#### Step 3. Copy the panel

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

#### Step 4. Drop the bridge + launcher

**macOS:**
```bash
mkdir -p ~/PremiereClaude/output
cp bridge/bridge.js ~/PremiereClaude/
cp bridge/start.command ~/Desktop/"Claude Bridge.command"
chmod +x ~/Desktop/"Claude Bridge.command"
```

**Windows:**
```powershell
$pc = "$env:USERPROFILE\PremiereClaude"
New-Item -ItemType Directory -Force -Path "$pc\output" | Out-Null
Copy-Item -Force bridge\bridge.js $pc\
Copy-Item -Force bridge\start.bat "$([Environment]::GetFolderPath('Desktop'))\Claude Bridge.bat"
```

</details>

### What to tell the user when everything is verified

> "Installed and tested. Double-click **Claude Bridge.command** (macOS) or **Claude Bridge.bat** (Windows) on your Desktop whenever you want to use it, then open Premiere → Window → Extensions → Claude. The first render takes 3–5 minutes while Remotion installs; after that, 30–60s per render."

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
