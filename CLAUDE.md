# CLAUDE.md — Single source of truth (v2.5)

> Hi Claude. This is **Claude Extension Premiere Pro 2026** — a CEP panel that brings Claude inside Adobe Premiere Pro for AI-generated motion graphics + AI-powered video editing (auto-cut). The user runs on a **Claude Code subscription**, not an API key.
>
> Read this end-to-end before doing anything. It covers install, every feature, the architecture, every hard-won quirk, and the failure modes.

---

## 30-second elevator pitch

A CEP panel docked in Premiere Pro 2023+ that does two main things:

1. **Generate motion graphics from natural language** — chat with Claude, it writes a Remotion composition, renders an MP4, and the panel offers to drop it on your timeline.
2. **Auto-cut talking-head clips** — point at a selected clip, the panel runs ffmpeg silencedetect + asks Claude to transcribe and find filler words / false starts, then ripple-deletes the cuts.

Plus 60+ suggestion chips, settings panel with themes & accents, prompt expand, history, references, real-time progress, and an auto-spawning local bridge that never asks the user to open a terminal.

```
Premiere CEP Panel  ─HTTP─►  Local Node bridge  ─spawns─►  claude CLI (your subscription)
   (UI + ExtendScript)        (localhost:3737)             ─spawns─►  ffmpeg (silence, transcode)
   index.html + host.jsx                                   ─spawns─►  Remotion (motion graphics)
```

---

## DEBUGGING — read the log first

**There is ONE unified log that captures every module.** Before guessing at any
bug, read it. It's the single source of truth for what actually happened across
the panel, bridge, autocut, autoedit, and ExtendScript — time-ordered.

File: `~/PremiereClaude/logs/unified.jsonl` (one JSON object per line)

Each line: `{ t, session, module, level, msg, data?, reqId? }`
- **module**: `panel` | `bridge` | `autocut` | `autoedit` | `captions` | `host` | `render`
- **level**: `debug` | `info` | `warn` | `error`
- **reqId**: ties a panel action → bridge handling → render together

### How to read it (fastest first)

```bash
# Pretty live tail (needs jq; falls back to raw without it)
bash bridge/tail-logs.sh

# Errors + warnings only, live
bash bridge/tail-logs.sh --errors

# Dump the last 200 lines and exit (good for a snapshot)
bash bridge/tail-logs.sh --dump 200

# One module only
bash bridge/tail-logs.sh --dump --module panel

# Or hit the bridge endpoint (returns parsed JSON):
curl -s "http://127.0.0.1:3737/logs/recent?n=300&level=error" | jq .
curl -s "http://127.0.0.1:3737/logs/recent?n=100&module=autoedit" | jq .

# Or just read the raw file:
tail -100 ~/PremiereClaude/logs/unified.jsonl
```

### What's captured automatically
- **Panel**: every uncaught error (`window.onerror` + `unhandledrejection`,
  with file/line/stack), boot marker (`panel loaded` + version), chat send
  failures, autocut/autoedit failures, cancellations.
- **Bridge**: startup, every chat request + done/error (with reqId), update
  checks.
- **ExtendScript (host)**: `evalES` captures EvalScript errors AND any
  `{ok:false}` / `{error}` JSON that host.jsx returns — so a broken Premiere
  call surfaces here instead of silently returning null.
- **autocut / autoedit**: their per-request file logs ALSO mirror into the
  unified log, so render events sit inline with the panel action that triggered them.
- **captions**: panel (`captions: transcribe/create start|ready|rejected|failed`,
  import placement) + bridge (`module:captions` transcribe/render/split/native),
  tied by `reqId`. Debug a captions bug with:
  `bash bridge/tail-logs.sh --dump --module captions` (then cross-ref the same
  reqId under `module=panel`).

### How to log a new event
- **Panel JS**: `cclog('info'|'warn'|'error', 'message', optionalDataObj)`
- **Bridge JS**: `clog('module', 'level', 'msg', dataObj, reqId)`
- Anything POSTing `{module, level, msg, data}` to `/log` lands in the same file.

Log rotates at 5 MB → `unified.jsonl.1`. `bridge.log` (raw terminal stdout)
still exists as a secondary; the unified JSONL is the one to read.

---

## INSTALL — one-prompt agent playbook

Prereqs the user must have:
- Adobe Premiere Pro 2023 or newer (tested on Premiere Pro 2026)
- Internet for first install
- A Claude Code Pro or Max plan (the bridge spawns the `claude` CLI; no API key)

**If you are an agent installing this on a fresh machine, follow these steps literally.**

### Step 1 — Clone

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

If git is missing: `winget install -e --id Git.Git` (Win) or `xcode-select --install` (Mac), then open a fresh shell.

### Step 2 — Run the installer

**Tell the user to close Premiere Pro first.**

```bash
# macOS
bash install.sh
```

```powershell
# Windows — must include the bypass flag
powershell -ExecutionPolicy Bypass -File install.ps1
```

Installer auto-installs **Node LTS**, **Claude Code CLI**, **ffmpeg**, copies the panel, drops the bridge into `~/PremiereClaude/`, pre-scaffolds a Remotion project + runs `npm install` (2–4 min), and places a Desktop launcher. Idempotent.

### Step 3 — Log into Claude (manual, you can't do this for the user)

If the installer warns *"Claude CLI may not be logged in"*:

```bash
claude /login
```

Browser opens; user clicks Allow.

### Step 4 — Verify

Tell the user to:
1. Open Premiere Pro
2. Window → Extensions → **Claude**
3. The panel's status pill should go green within 1–2 seconds (bridge auto-spawns)
4. Smoke test: type `Generate a 3 second logo intro that says HELLO in white on dark blue` and hit ↵

First render finishes in ~60s (Remotion is pre-installed, so `npm install` doesn't happen at render time).

### Common install failures

| Symptom | Fix |
|---|---|
| Status pill stays red after panel opens | Bridge auto-spawn failed. Open `~/PremiereClaude/bridge.log` and check. Worst case: double-click `Flimify Bridge.command` on the Desktop. |
| `claude` not on PATH | Open a new shell, re-run installer. On Windows verify `npm config get prefix` is in PATH. |
| Render fails with "ffmpeg not found" | `brew install ffmpeg` (Mac) or `winget install -e --id Gyan.FFmpeg` (Win) |
| Panel doesn't appear in Window menu | `PlayerDebugMode` didn't apply or panel folder didn't copy. Re-run installer. |
| First render takes 5+ minutes | Remotion's `npm install` ran at render time. Check `~/PremiereClaude/remotion-intro/node_modules/remotion` exists. If not: `cd ~/PremiereClaude/remotion-intro && npm install`. |
| "5-hour usage limit reached" | User burned through Claude Code plan quota. Wait or upgrade plan. |

---

## ARCHITECTURE

### Three components

```
extension/com.claudebridge.panel/
  index.html         # Entire UI: HTML + inline CSS + inline JS (~95k lines)
  CSXS/manifest.xml  # CEP manifest, hosts PPRO 23+
  jsx/host.jsx       # ExtendScript bridge between panel JS and Premiere

bridge/
  bridge.js                # Node HTTP server on localhost:3737
  start.command            # macOS Desktop launcher (backup; auto-spawn is primary)
  start.bat                # Windows Desktop launcher (backup)
  remotion-template/       # Pre-scaffolded Remotion project the installer copies
    package.json           # to ~/PremiereClaude/remotion-intro/ + runs npm install
    src/Root.tsx           # Claude adds new compositions to src/ and registers
    src/HelloWorld.tsx     # them in Root.tsx
    src/index.ts
    tsconfig.json
    remotion.config.ts

install.sh    # macOS auto-installer
install.ps1   # Windows auto-installer
README.md     # User-facing
CLAUDE.md     # This file — agent-facing
```

### Runtime locations after install

- `~/PremiereClaude/bridge.js` — the running bridge
- `~/PremiereClaude/remotion-intro/` — pre-scaffolded Remotion project; Claude writes new components into `src/` and registers them in `Root.tsx`
- `~/PremiereClaude/output/` — rendered files, pasted images, ffmpeg keyframes
- `~/PremiereClaude/bridge.log` — bridge stdout/stderr (raw terminal output)
- `~/PremiereClaude/logs/unified.jsonl` — **THE UNIFIED LOG. Read this first when debugging anything.** One JSONL line per event from every module (panel, bridge, autocut, autoedit, host/ExtendScript), time-ordered. See "DEBUGGING — read the log first" below.
- `~/Library/Application Support/Adobe/CEP/extensions/com.claudebridge.panel/` (macOS) — installed panel
- `%APPDATA%\Adobe\CEP\extensions\com.claudebridge.panel\` (Windows) — installed panel

### Bridge endpoints (`bridge/bridge.js`)

| Endpoint | Method | Body | Returns |
|---|---|---|---|
| `/ping` | GET | — | `{ok, session, outputDir}` |
| `/log` | POST | `{module, level, msg, data?, reqId?}` | `{ok}` — appends one line to the unified log (`~/PremiereClaude/logs/unified.jsonl`). Fire-and-forget; the panel uses this for `cclog()`. |
| `/logs/recent` | GET | `?n=300&module=panel&level=error` | `{ok, count, logFile, lines[]}` — parsed recent unified-log lines, optionally filtered by module + min level. Use this to read the log without shell access. |
| `/chat` | POST | `{message, context, versions?, maxParallel?}` | `{reply, imports[]}` — spawns `claude -p`, streams tool events to SSE. When `versions > 1` (animation tabs), the bridge FANS OUT: it builds N distinct takes of the one prompt **in parallel**, each in an isolated copy of the Remotion project (`setupVersionWorkspace` — node_modules symlinked, src copied, so concurrent builds never collide on `Root.tsx`), capped at `maxParallel` concurrent renders (`runWithConcurrency`). Each version gets a "VERSION i OF N — make a distinct take" nudge + a `_v{i}_{seed}` output-filename suffix so the renders don't clobber each other in the shared output dir. Every render comes back in ONE `imports[]` array (the panel drops a card per entry). Metering consumes one credit per version (owner-exempt; degrades to "as many as you can afford" if the user runs out mid-batch). Workspaces are cleaned up after. |
| `/complete` | POST | `{prefix}` | `{completion}` — inline autocomplete |
| `/expand` | POST | `{prompt, level}` | `{expanded}` — light / medium / heavy |
| `/autocut` | POST | `{clipPath, clipDuration, clipIn?, clipOut?, includeSilence?, findFillers?, findRepeats?, useTranscript?}` | `{cuts[], totalCut, transcribed, summary, method}` |
| `/autocut-cancel` | POST | — | `{ok}` — aborts the currently-running autocut claude subprocess so the user can recover from a stuck pipeline without restarting the bridge |
| `/autoedit` | POST | `{clipPath, clipDuration, clipIn?, clipOut?, density?, styleOverride?, premiereCaptions?, reqId?}` | `{ok, reqId, applied[], skipped[], summary, logFile}` — LEGACY one-shot single-clip pipeline (transcript → moment-picker → render graphics in parallel). Still works; the panel no longer uses it (see v2 below) |
| `/autoedit/analyze` | POST | `{segments:[{path,inSec,outSec,timelineStart}], span:{start,end}, density?, reqId?}` | `{ok, reqId, questions:[{id,q,type,options:[{value,label}]}], sentenceCount, durationSec}` — **AUTO-EDIT v2 phase 1.** Extracts + concatenates the audio of N timeline segments (multi-clip selection AND nested sequences both flatten to segments via `ccGetSelectedClips`), transcribes once (Parakeet), caches the transcript by `reqId`, and returns smart **content-based interview questions** (plus 2 fixed: style-consistency + tone). Transcript times are mapped back to absolute timeline seconds via the segment offset map. |
| `/autoedit/run` | POST | `{reqId, answers:{styleConsistency,tone,...}, density?}` | `{ok, reqId, applied[], skipped[], planReport, summary, logFile}` — **AUTO-EDIT v2 phase 2.** Uses the cached transcript: answer-steered `detectMoments` → spacing/gap-fill → **`verifyPlan` fit-check** (deterministic clamp to span + light Claude review that drops bad/duplicate picks) → `generateMomentsParallel` with a **style directive** (`styleConsistency:'same'` locks ONE `STYLE_PRESETS[tone]` look across every graphic; `'vary'` forces per-moment diversity). Applied items carry `timelineSec` (absolute) so `ccAutoEditApply` places them correctly for multi-clip/nested. |
| `/autoedit/rerender` | POST | `{reqId, idx, change}` | `{ok, reqId, idx, file, atSec, timelineSec, durationSec, type, label}` — **AUTO-EDIT v2 per-graphic change.** Re-renders ONE graphic (the plan moment at `idx`) with the user's `change` applied, reusing the run's locked style/resolution/placement (the run persists its final `plan` + `genOpts` into `_autoeditCache` keyed by reqId, 30-min TTL). `buildPrompt` appends a `CHANGE` directive when `genOpts.changeDirective` is set. The panel then swaps the new file on the timeline in place via `ccAutoEditReplace`. Same-session only (needs the cached plan); returns a session-expired error otherwise. |
| `/autoedit-cancel` | POST | — | `{ok}` — aborts the currently-running autoedit pipeline (analyze OR run; kills all in-flight child renders + the interview/verify Haiku calls) |
| `/update` | POST | — | `{ok, updated[], bridgeChanged, premiereRestartNeeded}` — pulls from GitHub raw |
| `/check-update` | GET | — | `{ok, localVersion, remoteVersion, updateAvailable}` — non-destructive version probe (doesn't write); used by the panel header to show an "update available" badge without forcing a pull |
| `/version` | GET | — | `{mtime, session}` — panel's `index.html` mtime + the bridge session ID. Used by the panel's hot-reload heartbeat to detect when the file on disk has changed |
| `/restart` | POST | — | `{ok, restartingIn}` — spawns a replacement bridge and exits after 300ms. Used by the auto-update flow when `bridgeChanged: true` |
| `/preview/<file>` | GET | — | Streams a file from `~/PremiereClaude/output/` with byte-range support |
| `/delete-file` | POST | `{path}` | `{ok, deleted?}` — deletes a rendered file from disk for the panel's "Delete" buttons (render cards + History entries). SAFE-GUARDED: media extensions only, path must resolve inside `OUTPUT_DIR` or a `*/output/*` folder under the user's home, no `..` traversal, regular files only. Idempotent (already-gone returns `{ok, alreadyGone}`). Rejects system files / paths outside the output area with 403. |
| `/progress-stream` | GET | — | SSE — pushes `{ text, pct }` per work-stage event |
| `/addedit` | POST | — | `{ok}` — osascript-driven menu click to run Premiere's "Add Edit to All Tracks" (Cmd+Shift+K), with fallthrough to "Add Edit" (Cmd+K) if the All-Tracks variant doesn't exist on the user's Premiere build |
| `/addedit-keystroke` | POST | — | `{ok}` — fires the raw Cmd+Shift+K keystroke via System Events. Backup path for builds where the menu-click variant fails (different Premiere locale / accessibility permissions) |
| `/applylog` | POST | `{steps: string[]}` | `{ok, file}` — appends a list of human-readable step strings to a new `autocut-apply-<ts>.log` in the output dir, so the panel can drop a trace after a multi-cut session |
| `/undo` | POST | `{count?: number}` | `{ok}` — bangs Cmd+Z N times via osascript (clamped 1–200) by clicking Edit > Undo in Premiere's menu. Backup path when `ccUndo()` from host.jsx can't reach the undo stack |
| `/testclaude` | GET | — | `{variants: [...]}` — diagnostic probe; spawns the `claude` CLI with 5 different `stdio`/cwd/env configurations and reports which ones return `{"ok":true}` within the timeout. Used during install troubleshooting when the bridge can't get claude to respond |

> Removed in earlier cleanup: `/panel` (dev-mode index.html preview) and `/dev/reload-stream` (SSE file-watch reload). Both gone — see the comment at bridge.js line 1802.

### ExtendScript functions (`extension/com.claudebridge.panel/jsx/host.jsx`)

Every function returns a JSON string. Every operation wrapped in try/catch — Premiere is fragile.

- `ccGetContext()` → project name, sequence name, playhead seconds, selected clips
- `ccImportToTimeline(path, mode)` — `mode` is `overwrite` or `overlay`. Imports the file, finds `ProjectItem`, places on the right track. Imports land in a dedicated project bin (see `_ccEnsureBin`).
- `_ccEnsureBin(name)` — find-or-creates a top-level project bin by name (default `CC_BIN_NAME = "Flimify Graphics"`), so every Flimify import (renders, Auto-Edit graphics, caption clips, previews) lands in ONE tidy folder inside the Premiere project instead of cluttering the root. All `importFiles(...)` calls pass `(_ccEnsureBin(CC_BIN_NAME) || rootItem)` as the target bin; falls back to root if creation fails. `_ccFindItemByPath` still locates items (it recurses into bins), so timeline placement is unaffected.
- `ccOpenInSource(path)` — loads file in Premiere's Source Monitor (`app.sourceMonitor.openProjectItem`)
- `ccImportFile(path)` — bin import only, no timeline placement (legacy fallback)
- `ccGetSelectedClip()` — walks video then audio tracks, returns the FIRST selected clip's source path, duration, in/out points, timeline position (legacy single-clip path; resolves media path via getMediaPath → column metadata → XMP → QE walk)
- `ccGetSelectedClips()` — **Auto-Edit v2 selection.** Returns EVERY selected clip across all tracks, resolved down to a flat list of audio `segments:[{path,inSec,outSec,timelineStart}]` in timeline order, plus `{count, clips[], span, durationSec}`. Supports **multi-clip selection** (a whole cut-up video) and **nested sequences**: a clip with no media file but a matching `app.project.sequences` entry is walked (`_ccFindNestedSequence` → `_ccNestedAudioSegments`) to pull its underlying audio-track media within the used in/out, mapped onto the outer timeline. Linked A/V duplicates are de-duped. This is the fix for "Auto-Edit won't work on a nested layer even though it has audio."
- `ccApplyAutoCuts(cutsJson)` — applies a list of `{start, end}` cuts using QE's `extract()` (in/out + extract). Cuts run chronologically with a cumulative shift offset so ripple-deletes don't drift. Cumulative ripple math: every applied cut subtracts its duration from later cuts' timeline positions.
- `ccAutoEditApply(payloadJson)` — applies a multi-edit autoedit payload (filler-cuts + graphic-overlay imports + B-roll moves) to the active sequence in one atomic batch. Each item places at `timelineSec` (absolute timeline time, sent by v2 for multi-clip/nested) when present, else falls back to the legacy `timelineStart + (atSec − inPoint)` source-time offset. Returns per-item placement `applied:[{index, file, track:"V20", atSec, durationSec, type}]` — the panel keeps each graphic's track + snapped second so a single one can later be swapped.
- `ccAutoEditReplace(payloadJson)` — swaps ONE already-placed Auto-Edit graphic for a freshly re-rendered file, in place, disturbing nothing else. Input `{file, track:"V20", atSec, oldFile?, durationSec?}`. Imports the new file, **lifts** the old clip (QE `item.remove(false,false)` = no ripple, leaves a gap) found by matching `track` + `start.seconds ≈ atSec` within a frame tolerance, then DOM `overwriteClip`s the new file at the same time/track. Backs the panel's per-graphic "Change" button.
- `ccGetSequenceCaptions()` — returns the Premiere-side captions for the selected clip (if any) as `[{startSec, endSec, text}]`. Used by `/autoedit` to feed Claude the existing transcript without re-running Whisper.
- `ccProbeTranscript()` — quick check for whether the selected clip has a transcript attached (returns `{hasTranscript: bool, count: n}`).
- `ccSetPlayhead(timeSec)` — moves the sequence playhead to a frame-snapped time. Computes ticks from the sequence's own `ticksPerFrame` so it lands EXACTLY on a frame boundary, not between.
- `ccRippleDeleteAt(startSec, endSec)` — ripple-delete an in/out range across all tracks (uses QE `extract()`). Used by individual auto-cut row Apply buttons.
- `ccCountItems()` / `ccTargetAllTracks()` / `ccTryRazorAtPlayhead()` — internal helpers used by ccApplyAutoCuts to verify a razor-then-extract actually changed item counts (catches "extract did nothing" failures silently).
- `ccUndo(count)` — probes multiple undo APIs: `app.menuFunctionId(101/16/7/0xA01)`, `app.executeCommand("Undo")`, OS-level Cmd+Z / Ctrl+Z via osascript / PowerShell SendKeys as last resort
- `ccMaximizeFrame()` — toggles the panel's frame-maximize for the backtick (`` ` ``) shortcut
- `ccVersion()` — returns `{ok, version}` so the panel can sanity-check jsx hot-reload took effect

---

## FEATURES (v2.5)

### Auto-spawning bridge

**The user never sees a terminal.** When the panel mounts:
1. Pings `localhost:3737`
2. If alive → status pill goes green
3. If dead → spawns `node ~/PremiereClaude/bridge.js` detached, logs to `~/PremiereClaude/bridge.log`. **Cross-platform node resolution:** macOS tries `/usr/local/bin/node`, `/opt/homebrew/bin/node`, then PATH `node`; Windows tries `%ProgramFiles%\nodejs\node.exe`, `%ProgramFiles(x86)%\…`, `%LOCALAPPDATA%\Programs\nodejs\node.exe`, scoop, then PATH `node`. PATH is rebuilt with the OS-correct separator (`;` on Windows, `:` on Unix) by prepending to the real `Path`/`PATH` key, and the bridge is spawned with `windowsHide:true` so no console window flashes.
4. Polls `/ping` every 500ms for up to 10s
5. Goes green when ping succeeds; falls back to "run Flimify Bridge" hint if 10s passes

Bridge stays alive across panel opens/closes — only dies on reboot or manual kill.

The Desktop launcher (`Flimify Bridge.command` / `Flimify Bridge.bat`) is now a **fallback**, not the primary entry.

**Windows runtime note (`spawnClaude`)** — the bridge spawns the Claude CLI through `spawnClaude(args, opts)` (not raw `spawn('claude', …)`). On macOS/Linux that's a transparent passthrough to `claude` on PATH. On Windows, npm installs the CLI as `claude.cmd` (a batch shim) which Node's `spawn` can't exec directly, and which would mangle the multi-KB `--append-system-prompt` arg if routed through a shell — so `resolveClaude()` finds the package's JS entry (`%APPDATA%\npm\node_modules\@anthropic-ai\claude-code` → its `bin`) and runs it with the same `node` (`process.execPath`), falling back to a real `claude.exe` on PATH, then to `claude.cmd` via shell as a last resort.

### Auto-update

Source-of-truth resolution: the bridge prefers a **local repo** if it finds one (`~/All Claude Work/claude-extension-premiere-pro-2026`, or `CLAUDE_BRIDGE_LOCAL_SOURCE`), else **GitHub raw**. It syncs the latest `index.html`, `host.jsx`, `manifest.xml`, and `bridge.js`; diffs against on-disk and writes (atomically — temp file + rename) only when bytes differ.

**`checkForUpdates()` runs on launch AND on a 3-minute interval** (`_updatePoll`). This periodic check is what makes a long-running bridge pick up pushed changes without a manual restart — it was the missing piece that made auto-update appear broken. Panel/host/manifest changes apply silently (the panel's `/version` mtime poll reloads it when safe); a `bridge.js` change triggers a self-restart **only when idle** (`_bridgeBusy()` = no in-flight chat/autoedit/autocut, tracked via `_heavyInflight`), deferred to the next tick otherwise.

**Self-restart mechanics** (`_autoRestartForBridgeUpdate`): under launchd (`CLAUDE_BRIDGE_LAUNCHD=1` in the plist) it `process.exit(1)` so `KeepAlive{Crashed:true}` relaunches ONE clean instance (exit 0 wouldn't, since `SuccessfulExit:false`). Non-launchd runs spawn a replacement (`_selfRespawn`). A 25s sentinel (`.last-update-restart`) prevents any relaunch storm.

**THERE CAN BE ONLY ONE** (`_killOtherBridges`): on startup and on every `EADDRINUSE`, the bridge SIGKILLs any other `PremiereClaude/bridge.js` process before binding. This permanently fixed the orphaned-bridge-squatting-the-port class of bugs (`kickstart` only kills the job's tracked pid, not orphans). If you ever see EADDRINUSE loops, an orphan was the cause — this now self-heals.

**Critical caveat for development:** set `CLAUDE_BRIDGE_NO_UPDATE=1` before spawning a dev bridge, otherwise auto-update will overwrite your in-progress edits with whatever is committed.

A small ↻ button in the panel header triggers `/update` manually (force). Toast feedback: *"Updated: panel UI, ExtendScript"* / *"Already up to date"* / *"Update failed: ..."*.

### Chat + render flow

1. User types prompt → `POST /chat` with `{message, context: {sequenceName, playhead, selectedClips, …}}`
2. Bridge spawns `claude -p --output-format stream-json --verbose --permission-mode bypassPermissions --append-system-prompt <SYSTEM_PROMPT> --no-session-persistence <message>`
3. **Each chat call is a fresh Claude invocation** (no session resume). Iteration context is passed explicitly via the Changes button.
4. Bridge parses Claude's stream-json events; each tool_use block becomes a human-readable status pushed to `/progress-stream` SSE (`Reading Root.tsx`, `Writing X.tsx`, `Rendering video`, etc.)
5. Final assistant text is collected
6. Bridge extracts `[[IMPORT:/abs/path]]` markers from the reply
7. **Premiere-importable safety net**: any file with an extension not in the allowlist (mp4, mov, m4v, avi, mkv, mxf, mts, png, jpg, jpeg, tif, tiff, gif, webp, wav, mp3, aac, m4a) gets ffmpeg-transcoded to MP4 H.264 + AAC + faststart before being sent to the panel. This catches Claude accidentally rendering WebM (which Premiere refuses).
8. Panel renders a "Render Preview" card with **Import to Timeline / Preview / Changes** buttons. **Nothing auto-imports.**
9. *Import* uses `ccImportToTimeline(path, mode)` and shows a receipt. *Preview* opens in Premiere's Source Monitor. *Changes* sets silent iteration context.

### Changes button (iteration)

Click *Changes* on a render card (or in History → Changes). A small coral chip appears above the composer: *"Iterating on filename.mp4ㅤ×"*. User types just their tweak ("make the bell red"). On send, the panel invisibly prepends:

```
Make a new version of a previous render.
Original prompt: "<original>"
Previous file: <abspath>
Change: <user tweak>
```

System prompt tells Claude: when this prefix appears, find the existing component and modify it minimally instead of designing fresh.

Without the Changes button, every prompt is a clean creative slate — different colors, layout, motion.

### Auto-cut (v2.4 pipeline)

User selects a clip in the timeline → clicks **Auto-Cut**:

**Stage 1: ffmpeg silencedetect** — Bridge runs `ffmpeg -i <clip> -af silencedetect=noise=-35dB:d=0.7 -f null -`. Stderr `time=HH:MM:SS` is parsed in real time to drive the progress bar 2% → 14%. (Threshold history: `-30dB:0.6` was too aggressive — cut quiet speech as silence; `-45dB:1.5` was too soft. `-35dB:0.7` sits in the middle: ignores quiet speech but catches genuine dead air, trims real pauses without nuking natural half-second breaths.)

**Stage 2: Claude transcribes + analyses** — Bridge spawns `claude -p` with a strict prompt that requires:
1. **Transcribe** using `asr-transcribe-to-text` skill → `whisper-cli` → `faster-whisper` → ffmpeg-extract + STT, in that order. Only set `transcribed: false` if all four fail.
2. **Find** filler words (`um`, `uh`, `like` as filler, `you know`, `I mean`, `sorta`, `kinda`), false starts (speaker restarts a sentence — cut the first attempt), and self-corrections.
3. **Merge** with the pre-computed silence cuts.
4. **Double-check** — drop cuts that orphan partial words or remove meaningful content. Conservative.
5. **Sort** by start time.
6. **Output ONLY JSON** with the exact shape:
   ```json
   {
     "transcribed": true,
     "cuts": [
       { "start": 2.30, "end": 3.10, "kind": "silence", "reason": "long pause (0.8s)" },
       { "start": 5.20, "end": 5.62, "kind": "filler",  "reason": "um" }
     ],
     "summary": "Found 6 pauses, 4 fillers. Would remove 9.8s."
   }
   ```

Bridge parses tolerantly — strict JSON first, then ``` json fence, then expanding {...} substring search. Logs reply length + first 200 chars to bridge.log for debugging.

**Stage 3: Panel shows the cuts card** — each row color-coded by kind (gray silence, coral filler, red false_start, orange mistake). Per-row Apply/Skip or "Apply all". Header shows a `transcript` badge if Claude transcribed, `silence-only` if it fell back.

**Stage 4: ccApplyAutoCuts** — Sets `seq.setInPoint(tStart) + seq.setOutPoint(tEnd)` then calls `qeSeq.extract()` (Quick Edit — `app.enableQE()`). Extract ripple-deletes the in/out range across **all tracks**, closing the gap. Cuts run chronologically with a `shiftOffset` accumulator — each applied cut adds its duration to the offset, and later cuts subtract that offset from their original timeline positions so ripples don't drift.

**Stage 5: Undo button** — After cuts apply, an Undo button appears in the card. It calls `ccUndo(appliedCount)` which presses Premiere's native Edit > Undo once per applied cut — full session reversed in one click. Premiere's regular Cmd+Z still works too.

### Settings panel

Click the ⚙ gear icon in the header. Slide-up panel with:

**Appearance**
- Theme: Dark / Dim / Midnight
- Accent color: Coral / Violet / Emerald / Amber / Sky (live CSS variable swap)
- Show boot intro toggle

**Behavior**
- Default placement: Overwrite / Overlap
- Default expand level: Low / Mid / High
- Auto-check for updates toggle

**Auto-cut**
- Pause threshold: 0.4 / 0.6 / 1.0 / 1.5 s
- Silence sensitivity: −40 / −30 / −25 dB
- Detect fillers / false starts toggle (transcript mode on/off)

**Output**
- Render audio in animations toggle (off by default — `AUDIO POLICY` in system prompt)
- Auto-open render in browser toggle

**Data**
- Clear render history
- Factory reset

All persisted to `localStorage.claudeBridge.settings`. Accent/theme apply instantly.

### Live-reload (dev convenience)

Bridge watches `index.html` and `host.jsx` via `fs.watch`. When either changes, pushes an SSE event:
- `reload` event → panel calls `location.reload()` (full refresh)
- `jsx-reload` event → panel reads `host.jsx` fresh from disk and `evalScript`s it in place. **No Premiere restart needed for jsx changes.**

There's also a polling fallback (every 1.5s, reads stat size+mtime) in case SSE silently stalls in CEP's older Chromium.

### Keyboard shortcuts

| Key | Action |
|---|---|
| ↵ | Send |
| ⇧↵ | New line |
| ⇥ | Accept ghost-text autocomplete |
| ⇧V | Paste **text** at cursor |
| ⇧B | Paste **image** as reference |
| ⇧C | Copy selected text (anywhere) or input value |
| ` (backtick) | Toggle Premiere "Maximize Frame" for the panel |
| Esc | Cancel current request / close lightbox / close history |

---

## OPERATING the system

### Restart the bridge after editing `bridge.js`

```bash
# macOS
lsof -ti tcp:3737 | xargs kill 2>/dev/null; CLAUDE_BRIDGE_NO_UPDATE=1 node ~/PremiereClaude/bridge.js
```

```powershell
# Windows
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3737 ^| findstr LISTENING') do taskkill /F /PID %a
$env:CLAUDE_BRIDGE_NO_UPDATE=1; node "$env:USERPROFILE\PremiereClaude\bridge.js"
```

(In dev mode you basically always want `CLAUDE_BRIDGE_NO_UPDATE=1` — see the auto-update warning below.)

### Reload the panel after editing `index.html` / `host.jsx`

Live-reload usually handles this. If it doesn't fire, manually close + re-open the panel (Window → Extensions → Claude, click to toggle).

### Health check

```bash
curl -s http://127.0.0.1:3737/ping
# Expected: {"ok":true,"session":"<uuid>","outputDir":"..."}
```

### Validation suite

Four test passes guard the panel + the Remotion skills. Run them after any change to `index.html`, `bridge.js`, or the v2 skill source files:

```bash
# 1. Strict TypeScript check on all 24 skill source files + the 3 showreel templates.
#    Catches prop-naming bugs and JSX-case issues that the render itself tolerates.
bash tests/skill-sources-typecheck.sh

# 2. Panel audit pt1 — boot, version, chips, history, render, lightbox, status pill at 4 viewports.
python3 tests/panel-audit.py

# 3. Panel audit pt2 — remove-missing, confirm-stack guard, settings↔history toggle, tab cycling.
python3 tests/panel-audit-edge-cases.py

# 4. Panel audit pt3 — unicode-heavy history (emoji/CJK/RTL/Devanagari/600-char), narrow + wide
#    viewports, corrupt localStorage JSON, 100-row history stress, settings double-click race,
#    Esc during confirm modal, composer focus restore, close-all-but-one tabs.
python3 tests/panel-audit-edge-cases-pt3.py
```

Each must report 0 critical / 0 minor before a release. The version assertion in pt1 loosely matches "10." so legitimate version bumps don't break the audit (you'd see it flag a missing/stale version, not a wrong number).

### Skill docs — where to look first

When generating motion graphics, **always start at the top of `docs/skills/`** and fall through:

1. **`docs/skills/CHEAT-SHEET.md`** — single-screen "I want to…" lookup. 5 seconds.
2. **`docs/skills/INDEX.md`** — flat catalog of every component grouped by use case. ~30 seconds.
3. **`docs/skills/TUTORIAL.md`** — step-by-step "build a 30-second product intro" with full code + common-mistakes section.
4. **`docs/skills/showreel/README.md`** — five render-verified cross-skill templates to copy.
5. **`docs/skills/<skill-name>/SKILL.md`** — per-skill anti-patterns + composition recipes + prop overrides + audio cues + pairings. Read when you've picked the skill and need component-specific guidance.

All 22 component skills (callouts, lower-thirds, stats, backgrounds, stingers, text-presets, music-lyrics, comparison, charts, tech, lists, frames, reactions, device-notifications, word-effects, ctas, hooks, social-ui, trend-packs, quotes, banners, logos) have the same v2 SKILL.md structure as of the May 2026 polish loop — Anti-patterns + Composition Recipes + Render Notes + Pairings.

The 7 workflow/teaching skills (ads, best-practices, production, superpowers-setup, transitions, transitions-extra, video-skill) have different shapes; they're not components but pipelines/patterns.

---

## HARD-WON KNOWLEDGE (don't relearn these)

### Things that crash Premiere — avoid

- `backdrop-filter`, animated radial gradients with `filter: blur()`, GPU-heavy CSS — was crashing PPro under load. Halo + breath animations on the empty-state logo specifically were eating frames.
- `evalScript` polling faster than ~10s — was hammering ExtendScript engine and triggering crashes. Set to 15s now.
- Unwrapped ExtendScript operations — every `.children`, `.numItems`, etc. must be in try/catch. We have a `_ccSafe(fn)` helper.
- `new Time()` constructor — not in all PPro versions. We avoid it.
- Recursive bin walks without depth limits.

### Things that DON'T work (and why) — do not reattempt without reason

- **`stream-json` in /chat with streamed body to the panel** — CEP's older Chromium buffers fetch responses; the panel gets the whole reply at the end anyway. We stream tool events server-side via SSE to drive progress, but the actual chat reply is plain JSON.
- **In-panel spawn of `node bridge.js` was historically flaky** — v2.5 retries it and it works on modern CEP. Don't undo the auto-spawn without testing.
- **Claude CLI warm pool** — claude has a hardcoded 3s stdin timeout; pre-spawned processes die before we feed input. One-shot spawns only.
- **`req.on('close')` to kill the proc** — fires on normal request end in modern Node, kills the running spawn early. Use `req.on('aborted')` instead.
- **Plain Cmd+V auto-imports image** — old paste handler called `preventDefault` whenever clipboard had image, blocking text paste. Plain paste is now always text; image attach is Shift+B.
- **`seq.razor(timeNumber, ...)`** — silently no-ops in modern Premiere because razor wants a Time object or timecode string. Use QE razor / extract instead.
- **`seq.razor` per track + clip.remove(true, true)** — fragile, only works on one track, sometimes matches wrong clip. Use `seq.setInPoint` + `seq.setOutPoint` + `qeSeq.extract()` for true cross-track ripple-delete.
- **CSS `scroll-behavior: smooth` on the log container** — in CEP's older Chromium, this animates every wheel tick instead of only programmatic scrolls. Makes scrolling feel laggy. Removed.
- **Custom JS wheel handler** — `el.scrollTop = before + e.deltaY` bypasses browser smoothing. Choppy. Removed in favor of native wheel.

### Things to be careful about

- **Auto-update can clobber local edits.** If you're editing local files while developing, run the bridge with `CLAUDE_BRIDGE_NO_UPDATE=1`. The bridge fetches the latest from GitHub raw on every launch — if GitHub is behind your local, you lose work.
- **Disk space matters.** Bridge can't write rendered files if root volume is full. ffmpeg silently fails. Renders end up zero-byte. Keep `~/PremiereClaude/output/` clean — old MOVs add up fast (renders can be 100-300 MB).
- **CEP textareas eat keystrokes.** Backtick fullscreen, paste shortcuts — all need capture-phase document listeners that preventDefault and forward via ExtendScript.

---

## SYSTEM PROMPT (what Claude sees on `/chat`)

The relevant bits Claude is told:

- It's inside an Adobe Premiere Pro panel; user messages may be prefixed with `[PREMIERE CONTEXT]` describing the project, sequence, playhead, selected clips.
- For motion-graphics requests, **build with Remotion**. If `remotion-video-skill` / `remotion-best-practices` skills are installed, use them. Otherwise write Remotion code directly (React framework: `useCurrentFrame`, `interpolate`, `AbsoluteFill`, `<Composition>`).
- Render into `~/PremiereClaude/output/`.
- **Output format requirements** — must be Premiere-importable. MP4 with H.264 for motion, MOV with ProRes 4444 for transparency, PNG for stills. **Never WebM / VP8 / VP9** — Premiere refuses these. Always pass `--codec h264` to Remotion.
- **Audio policy** — renders are SILENT by default. No `<Audio>`, no SFX, no music, no stingers. Only add audio if user explicitly says "with audio" — and keep peaks below −20 dBFS.
- **References** — `[REFERENCE: /abs/path]` lines in the message mean: Read images directly, ffmpeg-extract a frame from videos, mirror colors/typography/composition in the design.
- **Pre-scaffolded Remotion project** at `~/PremiereClaude/remotion-intro/` — don't run `npx create-video`, reuse it. Add new components in `src/`, register in `Root.tsx`. Render with `npx remotion render src/index.ts <CompositionId> ~/PremiereClaude/output/<filename>.mp4 --codec h264`.
- **Project reuse policy** — reuse the project shell (deps, node_modules, fonts). **Do NOT reuse components or styles** from prior renders. Treat every prompt as a fresh creative slate. Create components with unique names (timestamp suffix or descriptive). Only exception: when message starts with "Make a new version of a previous render." — that's iteration; find the existing component and modify minimally.
- Emit `[[IMPORT:/abs/path]]` marker so the panel auto-handles the result.

---

## VERSION HISTORY (recent)

- **2.5** — Auto-spawn bridge from the panel; no more Desktop launcher needed
- **2.4** — Robust undo (probes menuFunctionId / executeCommand / OS keystrokes); fixed premature "Done" flash; beefier transcript prompt
- **2.3** — Progress bar monotonic floor; asymptotic curve disabled once bridge takes over
- **2.2** — Live-reload polling fallback; halved boot intro
- **2.1** — Settings panel (themes, accent, autocut config, toggles)
- **2.0** — Old intro restored after the BMS experiment was rejected
- **1.9** — BookMyShow-style intro (later reverted)
- **1.8** — Chronological auto-cut with cumulative offset
- **1.7** — "Overlay" → "Overlap"
- **1.6** — Settings + boot intro + repo updates
- **1.5** — Live status updates via SSE; FPS lag fixed (removed halo/breath); native wheel scroll
- **1.4** — Removed jsx mismatch version tag
- **1.3** — Auto-cut real progress percentages from bridge
- **1.2** — Auto-cut transcript pipeline (silence + Claude analyse + double-check)
- **1.1** — Auto-cut MVP (silence-only) + Apply All + Undo button

---

## USER COLLABORATION STYLE

- Casual, direct. Imperfect English at times — translate intent generously; don't ask for clarification when you can guess.
- **Action over analysis.** Build, don't deliberate.
- **No filler.** "Sure, I'll help…" is forbidden. State what you're doing in one line, then do it.
- **Hates broken features.** If something can't work robustly, say so up front and offer a workaround.
- **Wants to see things WORK over polish.**
- **OK with bold suggestions** — will redirect if it's wrong.

---

## QUICK TRIAGE TABLE

| Symptom | Likely cause | Fix |
|---|---|---|
| Status pill red, "Bridge offline · starting…" stuck | Node not on PATH or bridge.log shows error | Check `~/PremiereClaude/bridge.log`. Verify `node` works. Fall back to Desktop launcher. |
| "Stuck on Working" | First-time Remotion render — `npm install` running | Should not happen since installer pre-runs it. Check `~/PremiereClaude/remotion-intro/node_modules/remotion` exists. |
| Panel doesn't appear in Window menu | PlayerDebugMode not set or panel didn't copy | Re-run installer. Restart Premiere. |
| "Apply all" returns "Applied 0" | host.jsx outdated (hot-reload didn't fire) | Close + reopen the panel. Verify version tag matches `host.jsx`'s `HOST_JSX_VERSION`. |
| Render fails with "file not supported" in Premiere import | Claude rendered WebM/VP9 | Should be caught by `ensurePremiereImportable()` transcode safety net. If not, check ffmpeg is installed. |
| Cuts go to wrong timestamps | Source-to-timeline translation broken (clip has trim) | `ccGetSelectedClip()` returns `inPoint`, `timelineStart` — `ccApplyAutoCuts` translates each cut. Check the trace in panel's debug pane. |
| Premiere crashes on heavy renders | Heavy CSS or fragile ExtendScript | Restart Premiere. Try simpler prompts. |
| Settings button doesn't open the panel | JS error in settings init halted before listener attached | Check Chrome devtools console (or load `http://localhost:3737/panel` in real Chrome to see errors clearly). |
| Bridge auto-update overwrote local changes | Auto-update enabled while developing locally | Set `CLAUDE_BRIDGE_NO_UPDATE=1` in the env before spawning bridge. |

---

*This file is the single source of truth. If you change architecture or add a feature, update this file in the same commit.*
