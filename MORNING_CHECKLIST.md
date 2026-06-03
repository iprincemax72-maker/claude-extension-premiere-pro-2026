# Morning checklist — verify the overnight work

A 5-minute walkthrough to confirm the state of the system before you start any new work.

## 1. Read the wrap

Skim the TL;DR at the top of `MORNING_REPORT.md`:

```bash
head -40 MORNING_REPORT.md
```

This is the morning skim. If anything sounds wrong, that's the place to start digging.

## 2. Confirm the bridge is alive

```bash
curl -s http://127.0.0.1:3737/ping
```

Expected: `{"ok":true,"session":"<uuid>","outputDir":"..."}` — bridge is running. If you see a connection refused or empty output, the bridge process exited:

```bash
# Restart it with the sentinel so auto-update doesn't clobber edits.
cd ~/All\ Claude\ Work/PremiereClaude && CLAUDE_BRIDGE_NO_UPDATE=1 nohup node bridge.js > bridge.log 2>&1 &
```

## 3. Run the validation suite

```bash
cd ~/All\ Claude\ Work/claude-extension-premiere-pro-2026
bash tests/skill-sources-typecheck.sh        # strict tsc on 27 skill sources
python3 tests/panel-audit.py                 # pt1: boot/chips/render
python3 tests/panel-audit-edge-cases.py      # pt2: remove-missing/confirm-guard
python3 tests/panel-audit-edge-cases-pt3.py  # pt3: unicode/viewports/races
```

All four must report **0 critical / 0 minor**. If anything fails, the regression is in the last commit (see `git log --oneline -1`).

## 4. Open Premiere and smoke-test the panel

1. Open Premiere Pro
2. Window → Extensions → Claude
3. Status pill should turn green within 2 seconds
4. Version tag should read **10.18** (or higher)
5. Type any prompt and hit ↵ — chat should respond, render preview card should appear

If the status pill stays red:
- Check `~/PremiereClaude/bridge.log` for errors
- Confirm `node` is on PATH from Premiere's environment
- Worst case: double-click `Flimify Bridge.command` on the Desktop

## 5. Spot-check a few rendered compositions

The night's renders are at `/tmp/test-renders/`. Skim a few to confirm visual quality:

```bash
open /tmp/test-renders/showreel.mp4               # 5-skill highlight reel
open /tmp/test-renders/showreel-v.mp4             # 8-skill TikTok vertical
open /tmp/test-renders/showreel-explainer.mp4     # 6-skill tutorial format
open /tmp/test-renders/product-intro.mp4          # 30-second product intro
open /tmp/test-renders/stress-test.mp4            # edge-case verification
```

If any composition looks broken (black frames, misaligned text, missing components), check the matching file under `docs/skills/showreel/`.

## 6. Decide what to push

```bash
git -C ~/All\ Claude\ Work/claude-extension-premiere-pro-2026 log --oneline --since="00:00 yesterday" | head -30
```

60+ commits, none pushed (per the overnight rule). Review the log; push the ones you want.

```bash
git push origin main   # when you're ready
```

## 7. (Optional) Review the deeper docs

- `docs/skills/INDEX.md` — flat catalog of every component
- `docs/skills/TUTORIAL.md` — step-by-step "build a 30-second product intro"
- `docs/skills/CHEAT-SHEET.md` — single-screen "I want to…" lookup
- `docs/skills/showreel/README.md` — five render-verified cross-skill templates

These were written so future Claude (or you) can pick the right component / skill / pattern in seconds without reading every SKILL.md.

## 8. If anything is wrong

Two-minute triage path:

1. Was the validation suite passing in step 3? If no — `git log -p` the last commit that touched the failing area.
2. Does the panel work in step 4? If no — see CLAUDE.md "QUICK TRIAGE TABLE" at the bottom.
3. Does a specific composition look wrong? — `docs/skills/showreel/README.md` documents the templates; per-skill `SKILL.md` documents the components.

Everything is local and reversible. None of the night's commits have been pushed.

— Claude (1M-context Opus 4.7)
