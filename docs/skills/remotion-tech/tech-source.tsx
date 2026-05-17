// remotion-tech v2 — dev/tutorial components with multi-act motion.

import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};
const SF = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif';
const MONO = '"JetBrains Mono", "Fira Code", "Cascadia Code", "Menlo", monospace';

const motion = {
  pop: { damping: 11, stiffness: 200, mass: 0.6 },
  slam: { damping: 9, stiffness: 240, mass: 0.85 },
  haptic: { damping: 16, stiffness: 260, mass: 0.5 },
};

// ═════════════════════════════════════════════════════════════════════════
// Tiny syntax highlighter (improved over v1 — handles JSX-ish tags too)
// ═════════════════════════════════════════════════════════════════════════
const highlight = (code: string, lang: string): React.ReactNode[] => {
  const flags = new Uint8Array(code.length); // 0=plain, 1=kw, 2=str, 3=num, 4=cmt, 5=tag
  const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|new|async|await|def|print|true|false|null|undefined|public|private|interface|type|enum)\b/g;
  const strings = /(["'`])((?:\\.|(?!\1).)*?)\1/g;
  const numbers = /\b\d+(\.\d+)?\b/g;
  const comments = /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const jsxTags = /<\/?[A-Z][a-zA-Z0-9]*/g;

  let m;
  comments.lastIndex = 0;
  while ((m = comments.exec(code))) for (let i = m.index; i < m.index + m[0].length; i++) flags[i] = 4;
  strings.lastIndex = 0;
  while ((m = strings.exec(code))) if (flags[m.index] === 0) for (let i = m.index; i < m.index + m[0].length; i++) flags[i] = 2;
  jsxTags.lastIndex = 0;
  while ((m = jsxTags.exec(code))) if (flags[m.index] === 0) for (let i = m.index; i < m.index + m[0].length; i++) flags[i] = 5;
  keywords.lastIndex = 0;
  while ((m = keywords.exec(code))) if (flags[m.index] === 0) for (let i = m.index; i < m.index + m[0].length; i++) flags[i] = 1;
  numbers.lastIndex = 0;
  while ((m = numbers.exec(code))) if (flags[m.index] === 0) for (let i = m.index; i < m.index + m[0].length; i++) flags[i] = 3;

  // 0=plain, 1=keyword, 2=string, 3=number, 4=comment, 5=jsx-tag
  const colors = ["#e6edf3", "#ff7b72", "#a5d6ff", "#79c0ff", "#8b949e", "#7ee787"];
  const out: React.ReactNode[] = [];
  let cur = "", curFlag = flags[0] ?? 0;
  for (let i = 0; i < code.length; i++) {
    if (flags[i] === curFlag) cur += code[i];
    else {
      out.push(<span key={i} style={{ color: colors[curFlag] }}>{cur}</span>);
      cur = code[i];
      curFlag = flags[i];
    }
  }
  if (cur) out.push(<span key="end" style={{ color: colors[curFlag] }}>{cur}</span>);
  return out;
};

// ═════════════════════════════════════════════════════════════════════════
// 1. CODE SNIPPET — typewriter with proper cursor + cmd-key chrome
// ═════════════════════════════════════════════════════════════════════════
export type CodeSnippetProps = {
  code: string;
  language?: "tsx" | "js" | "py" | "sh";
  charsPerFrame?: number;
  startFrame?: number;
  bg?: string;
  title?: string;
};

export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  code = "const greet = (name) => `hello, ${name}`;\nconsole.log(greet('world'));",
  language = "tsx",
  charsPerFrame = 1.2,
  startFrame = 0,
  bg = "#0a0a0a",
  title,
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  const typed = Math.floor(Math.max(0, f * charsPerFrame));
  const visible = code.slice(0, Math.min(typed, code.length));
  const cursorOn = (f % 30) < 15;
  // Window pops in
  const windowOp = interpolate(f, [0, 8], [0, 1], clamp);
  const windowScale = interpolate(f, [0, 12], [0.96, 1], clamp);

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", padding: "5%" }}>
      <div
        style={{
          background: "#0d1117",
          borderRadius: 16,
          width: "100%",
          maxWidth: 1400,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          overflow: "hidden",
          opacity: windowOp,
          transform: `scale(${windowScale})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            background: "#161b22",
            borderBottom: "1px solid #30363d",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
          ))}
          <div style={{ marginLeft: 14, fontFamily: MONO, fontSize: 18, color: "#7d8590" }}>
            {title || `${language}.${language}`}
          </div>
        </div>
        <pre
          style={{
            margin: 0,
            padding: 30,
            fontFamily: MONO,
            fontSize: 32,
            lineHeight: 1.5,
            color: "#e6edf3",
            whiteSpace: "pre-wrap",
            minHeight: 200,
          }}
        >
          {highlight(visible, language)}
          {typed < code.length ? (
            <span style={{ background: "#e6edf3", opacity: cursorOn ? 0.8 : 0, marginLeft: 1 }}>
              &nbsp;
            </span>
          ) : null}
        </pre>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 2. TERMINAL COMMAND — typing pace varies (slows on punctuation)
// ═════════════════════════════════════════════════════════════════════════
export type TerminalCommandProps = {
  command: string;
  output?: string;
  prompt?: string;
  charsPerFrame?: number;
  startFrame?: number;
  bg?: string;
};

export const TerminalCommand: React.FC<TerminalCommandProps> = ({
  command = "npm run build",
  output = "✓ Compiled successfully in 1.4s\n✓ Generated 14 routes\n",
  prompt = "ansh@mac ~ $",
  charsPerFrame = 1.5,
  startFrame = 0,
  bg = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const f = frame - startFrame;
  // Typing pace varies — pause briefly on punctuation
  let typed = 0;
  for (let i = 0; i < command.length; i++) {
    const pace = /[.,;\s]/.test(command[i]) ? charsPerFrame * 0.6 : charsPerFrame;
    typed += pace;
    if (typed > f) break;
    typed = i + 1;
  }
  const visible = command.slice(0, Math.min(Math.floor(typed), command.length));
  const isDone = visible.length >= command.length;
  const outputStart = command.length / charsPerFrame + 14;
  const outputProgress = Math.max(0, f - outputStart);
  // Output streams faster than typing (machine output)
  const outputVisible = (output || "").slice(0, Math.floor(outputProgress * 5));

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", padding: "5%" }}>
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 16,
          width: "100%",
          maxWidth: 1500,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 22px",
            background: "#2a2a2a",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c }} />
          ))}
          <div style={{ marginLeft: 14, fontFamily: SF, fontSize: 18, color: "#999" }}>
            Terminal — bash
          </div>
        </div>
        <div
          style={{
            padding: 36,
            fontFamily: MONO,
            fontSize: 28,
            lineHeight: 1.5,
            color: "#e0e0e0",
            minHeight: 280,
          }}
        >
          <div>
            <span style={{ color: "#7ee787" }}>{prompt}</span> <span>{visible}</span>
            {!isDone ? <span style={{ opacity: f % 30 < 15 ? 1 : 0 }}>▌</span> : null}
          </div>
          {output ? (
            <div style={{ marginTop: 14, whiteSpace: "pre-wrap", color: "#bbb" }}>
              {outputVisible}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 3. KEYBOARD SHORTCUT — keys press DOWN then settle (mechanical-keyboard feel)
// ═════════════════════════════════════════════════════════════════════════
export type KeyboardShortcutProps = {
  keys: string[];
  startFrame?: number;
  staggerFrames?: number;
  capColor?: string;
  bg?: string;
};

export const KeyboardShortcut: React.FC<KeyboardShortcutProps> = ({
  keys = ["⌘", "⇧", "P"],
  startFrame = 0,
  staggerFrames = 6,
  capColor = "#f6f6f6",
  bg = "transparent",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        flexDirection: "row",
      }}
    >
      {keys.map((k, i) => {
        const f = frame - startFrame - i * staggerFrames;
        const pop = spring({ frame: f, fps, config: motion.haptic });
        // Press-down animation 6 frames after stagger
        const pressF = f - (keys.length * staggerFrames + 8);
        // 3-stage press: down → bottom → release
        const press = interpolate(pressF, [0, 3, 8, 14], [0, 8, 8, 0], clamp);
        // Keycap depresses shadow when pressed
        const shadowDepth = interpolate(pressF, [0, 3, 8, 14], [8, 1, 1, 8], clamp);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                display: "inline-block",
                background: capColor,
                color: "#111",
                fontFamily: SF,
                fontWeight: 800,
                fontSize: 80,
                padding: "24px 38px",
                borderRadius: 18,
                minWidth: 90,
                textAlign: "center",
                boxShadow: `0 ${shadowDepth}px 0 #c0c0c0, 0 ${shadowDepth + 4}px 24px rgba(0,0,0,0.3), inset 0 -4px 0 rgba(0,0,0,0.08)`,
                transform: `scale(${pop}) translateY(${press}px)`,
                opacity: pop,
              }}
            >
              {k}
            </div>
            {i < keys.length - 1 ? (
              <div style={{ fontSize: 80, fontWeight: 700, color: "#888", opacity: pop }}>+</div>
            ) : null}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 4. FILE TREE
// ═════════════════════════════════════════════════════════════════════════
export type FileTreeNode = { name: string; type: "folder" | "file"; children?: FileTreeNode[]; };

export type FileTreeProps = {
  root: FileTreeNode;
  framesPerNode?: number;
  startFrame?: number;
  bg?: string;
};

const flattenTree = (node: FileTreeNode, depth = 0): { node: FileTreeNode; depth: number }[] => {
  const out: { node: FileTreeNode; depth: number }[] = [{ node, depth }];
  if (node.children) for (const c of node.children) out.push(...flattenTree(c, depth + 1));
  return out;
};

const DEFAULT_TREE: FileTreeNode = {
  name: "src", type: "folder", children: [
    { name: "components", type: "folder", children: [
      { name: "Button.tsx", type: "file" },
      { name: "Card.tsx", type: "file" },
    ]},
    { name: "lib", type: "folder", children: [
      { name: "utils.ts", type: "file" },
    ]},
    { name: "App.tsx", type: "file" },
  ]
};

export const FileTree: React.FC<FileTreeProps> = ({
  root = DEFAULT_TREE,
  framesPerNode = 8,
  startFrame = 0,
  bg = "#0d1117",
}) => {
  const frame = useCurrentFrame();
  const nodes = flattenTree(root);

  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "5% 8%",
        fontFamily: MONO,
        color: "#e6edf3",
        fontSize: 30,
      }}
    >
      <div>
        {nodes.map(({ node, depth }, i) => {
          const f = frame - startFrame - i * framesPerNode;
          const op = interpolate(f, [0, 10], [0, 1], clamp);
          const x = interpolate(f, [0, 10], [-30, 0], clamp);
          return (
            <div
              key={i}
              style={{
                paddingLeft: depth * 36,
                opacity: op,
                transform: `translateX(${x}px)`,
                lineHeight: 1.6,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ width: 30, fontSize: 28 }}>
                {node.type === "folder" ? "📁" : "📄"}
              </span>
              <span style={{ color: node.type === "folder" ? "#7ee787" : "#e6edf3" }}>
                {node.name}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 5. PULL REQUEST CARD
// ═════════════════════════════════════════════════════════════════════════
export type PullRequestCardProps = {
  title: string;
  number?: number;
  author?: string;
  branch?: string;
  adds?: number;
  removes?: number;
  state?: "open" | "merged" | "closed";
  startFrame?: number;
  bg?: string;
};

export const PullRequestCard: React.FC<PullRequestCardProps> = ({
  title = "feat: add user authentication flow",
  number = 42,
  author = "ansh",
  branch = "feature/auth",
  adds = 312,
  removes = 88,
  state = "merged",
  startFrame = 0,
  bg = "#0d1117",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - startFrame, fps, config: motion.haptic });
  const stateColor = state === "merged" ? "#a371f7" : state === "open" ? "#3fb950" : "#f85149";
  // adds/removes counters tick up
  const addCount = Math.round(adds * interpolate(frame, [10, 32], [0, 1], clamp));
  const rmCount = Math.round(removes * interpolate(frame, [10, 32], [0, 1], clamp));

  return (
    <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", padding: "5%" }}>
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 18,
          padding: 36,
          maxWidth: 1400,
          width: "100%",
          color: "#e6edf3",
          fontFamily: SF,
          transform: `scale(${enter})`,
          opacity: enter,
          boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              background: stateColor,
              color: "#fff",
              padding: "8px 22px",
              borderRadius: 100,
              fontSize: 24,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              boxShadow: `0 0 ${enter * 20}px ${stateColor}55`,
            }}
          >
            {state}
          </div>
          <div style={{ fontSize: 26, color: "#7d8590" }}>#{number}</div>
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            marginTop: 22,
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 22, fontSize: 26, color: "#7d8590" }}>
          <span style={{ color: "#e6edf3" }}>{author}</span> wants to merge{" "}
          <code style={{ fontFamily: MONO, color: "#79c0ff" }}>{branch}</code>
        </div>
        <div style={{ marginTop: 26, display: "flex", gap: 22, fontFamily: MONO, fontSize: 30 }}>
          <div style={{ color: "#3fb950", fontVariantNumeric: "tabular-nums" }}>+{addCount}</div>
          <div style={{ color: "#f85149", fontVariantNumeric: "tabular-nums" }}>-{rmCount}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// 6. LOADING DOTS
// ═════════════════════════════════════════════════════════════════════════
export type LoadingDotsProps = {
  color?: string;
  size?: number;
  bg?: string;
  label?: string;
};

export const LoadingDots: React.FC<LoadingDotsProps> = ({
  color = "#79c0ff",
  size = 30,
  bg = "transparent",
  label,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: bg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <div style={{ display: "flex", gap: size * 0.5 }}>
        {[0, 1, 2].map((i) => {
          const off = i * 6;
          const t = ((frame - off) % 36) / 36;
          const scale = 0.6 + 0.4 * Math.max(0, Math.sin(t * Math.PI));
          const opacity = 0.4 + 0.6 * Math.max(0, Math.sin(t * Math.PI));
          return (
            <div
              key={i}
              style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: color,
                transform: `scale(${scale})`,
                opacity,
                boxShadow: `0 0 ${size * 0.4}px ${color}`,
              }}
            />
          );
        })}
      </div>
      {label ? (
        <div
          style={{
            fontFamily: SF,
            fontSize: 32,
            color: "#999",
            letterSpacing: "0.06em",
          }}
        >
          {label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
