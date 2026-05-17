---
name: remotion-tech
description: Six developer-focused tutorial components for Remotion — CodeSnippet with syntax-color reveal, TerminalCommand with typing prompt, KeyboardShortcut keycap badges, FileTree reveal, PullRequestCard, and LoadingDots. Use when the user asks for "code snippet", "terminal command", "keyboard shortcut", "keycaps", "file tree", "pull request", "PR card", "loading dots", or any dev/tutorial content.
---

# Remotion Tech

Six components built for developer / tutorial / tech-channel content. Render-verified to mp4.

- [Source](./references/tech-source.tsx)

## The Six Components

| Name | Use | Animation |
|------|-----|-----------|
| **CodeSnippet** | Syntax-colored animated code block reveal | Character-by-character reveal (`charsPerFrame`); supports `tsx`, `js`, `py`, `sh` |
| **TerminalCommand** | macOS-style terminal with typing prompt | Typed command + then output |
| **KeyboardShortcut** | Cmd+Shift+P-style keycap badges | Each key cap springs in with `staggerFrames` between |
| **FileTree** | Animated indented folder/file reveal | One node per `framesPerNode` (default ~6f) |
| **PullRequestCard** | GitHub-style PR card with +/- stats | Card pops in, +/- numbers count up |
| **LoadingDots** | Three-dot pulse loop | Sin-based pulse, loops infinitely (safe to hold) |

## When to Load

- "Code / snippet / monospace / syntax" → **CodeSnippet**
- "Terminal / shell / bash / command line / $ prompt" → **TerminalCommand**
- "Keyboard / shortcut / hotkey / Cmd+/keycap" → **KeyboardShortcut**
- "File tree / folder structure / directory" → **FileTree**
- "Pull request / PR / git / GitHub card" → **PullRequestCard**
- "Loading / dots / typing indicator" → **LoadingDots**

## Golden rules

1. **CodeSnippet language picker is limited.** Pass `language: "tsx" | "js" | "py" | "sh"`. Other languages render as plain monochrome text — don't pretend they have syntax highlighting they don't.
2. **Typing speed (`charsPerFrame`) is per-frame, not per-second.** Default ~2–3 chars/frame ≈ 60–90 chars/sec at 30fps. Faster than realistic typing — intentional for short-form video.
3. All animations are `useCurrentFrame()` driven, no `useState`, no `setTimeout`.
4. **FileTree expects a recursive `FileTreeNode` shape** (`{ name, type: "folder" | "file", children? }`) — read the type from source if unsure.

## Anti-patterns

- **Don't** put a CodeSnippet line longer than ~80 characters. The mono font + padding fits ~80 chars at the default 1920×1080 canvas. Past 80 it horizontally clips. Wrap long lines manually with `\n`.
- **Don't** show real production code via CodeSnippet — viewers can't read code that fast even at slow `charsPerFrame`. Use short, illustrative snippets (3–8 lines), not the actual implementation.
- **Don't** stack two KeyboardShortcuts in the same frame. Two competing keycap groups confuse — Cmd+S above and Cmd+Shift+S below reads as two unrelated shortcuts. Sequence them instead.
- **Don't** use TerminalCommand for output >12 lines. The terminal box height is fixed and longer output overflows. For multi-screen output, sequence multiple TerminalCommands or use a FileTree if the result is a directory listing.
- **Don't** chain three or more tech components in a row. CodeSnippet → TerminalCommand → FileTree reads as a dense info dump and viewers tune out. Break with a talking-head clip or a body B-roll between.
- **Don't** rely on PullRequestCard for accurate diffs >999 lines. The +/- counters use the count-up animation, which works visually but feels weird past ~3 digits.

## Composition Recipes

**Code-tutorial snippet:**
```tsx
<Sequence durationInFrames={150}>
  <CodeSnippet
    code={`const sum = (a: number, b: number) => a + b;
console.log(sum(2, 3));`}
    language="tsx"
    title="src/utils.ts"
    charsPerFrame={2}
  />
</Sequence>
```

**Install command:**
```tsx
<Sequence durationInFrames={130}>
  <TerminalCommand
    command="npm install remotion"
    output="added 142 packages in 8s"
    prompt="$"
  />
</Sequence>
```

**Keyboard shortcut reveal:**
```tsx
<Sequence durationInFrames={70}>
  <KeyboardShortcut keys={["Cmd", "Shift", "P"]} capColor="#10b981" />
</Sequence>
```

**Repo structure tour:**
```tsx
<Sequence durationInFrames={120}>
  <FileTree root={{
    name: "remotion-app",
    type: "folder",
    children: [
      { name: "src", type: "folder", children: [
        { name: "Root.tsx", type: "file" },
        { name: "HelloWorld.tsx", type: "file" },
      ]},
      { name: "package.json", type: "file" },
    ],
  }} framesPerNode={8} />
</Sequence>
```

**Open-source contribution moment (PR card):**
```tsx
<Sequence durationInFrames={80}>
  <PullRequestCard
    title="Fix off-by-one in transition timing"
    number={1042}
    author="anshdhakad"
    branch="main"
    adds={28}
    removes={6}
  />
</Sequence>
```

**Build-in-progress overlay:**
```tsx
<AbsoluteFill>
  <YourScreenRecording />
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 80 }}>
    <LoadingDots label="Compiling..." />
  </AbsoluteFill>
</AbsoluteFill>
```

## Common Prop Overrides

```tsx
// Slower typing for readability
<CodeSnippet code={`...`} language="py" charsPerFrame={1.2} />

// Custom terminal prompt
<TerminalCommand command="git push origin main" prompt="anshdhakad@mac ~/dev $" />

// Branded keycap color
<KeyboardShortcut keys={["Ctrl", "C"]} capColor="#ff7a4d" />

// Larger PR card
<PullRequestCard title="Big merge" adds={1242} removes={387} />
```

## Render Notes

- **1920×1080 landscape, 30fps** is the canonical canvas. All tech components use monospace fonts with fixed sizing — vertical 1080×1920 squashes them. For vertical, fork and drop font sizes by ~35%.
- Render with `--mute` (correct Remotion flag; `--audio-codec=no-audio` is invalid).
- For overlay on a screen-recording: `bg="transparent"` and render with `--codec prores --prores-profile 4444 --mute`.
- **Audio cue points:**
  - CodeSnippet: keystroke ticks every `charsPerFrame` (light keyboard SFX)
  - TerminalCommand: typing ticks per char; output appears with "newline ding"
  - KeyboardShortcut: each cap lands at `i * staggerFrames` → keycap click per key
  - FileTree: each node appears at `i * framesPerNode` → light click per node
  - PullRequestCard: card lands ~14f → GitHub-merge "ping" SFX
  - LoadingDots: dot pulse period ~30 frames (1s) → no SFX needed (loops)

## Pairing with other skills

- **CodeSnippet + TerminalCommand** — write the code, then run it
- **KeyboardShortcut + CornerWatermark** (`remotion-social-ui`) — shortcut card with your channel mark
- **FileTree → ChapterBumper** (`remotion-stingers`) — tour the codebase then chapter into the explanation
- **PullRequestCard + LikeBurst** (`remotion-social-ui`) — "we merged it!" moment with celebratory hearts
- **LoadingDots + SoundWaveBars** (`remotion-music-lyrics`) — building animation with music waves underneath
- **CodeSnippet + TypewriterPro** (`remotion-text-presets`) — narrate the code with on-screen text
