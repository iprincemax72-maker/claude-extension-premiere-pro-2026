/**
 * Code block components — display code with syntax-color tokens, line
 * numbers, and an optional typewriter reveal.
 *
 * For real syntax highlighting you'd ship Prism/Highlight.js (too heavy for
 * Remotion). Instead, this exports a small token-coloriser that handles
 * common patterns reasonably well: keywords, strings, comments, numbers.
 *
 *   <CodeBlock language="js" code={`const x = 42;`} theme="dark" />
 *   <TypingCodeBlock frame={frame} cps={20} code={`...`} />
 */

import React, { type CSSProperties } from 'react';

// ─── Themes ───────────────────────────────────────────────────────────
export type CodeTheme = {
  bg: string;
  fg: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  fn: string;
  punct: string;
  lineNumber: string;
};

export const CODE_THEMES: Record<string, CodeTheme> = {
  dark: {
    bg: '#0d0d12', fg: '#d8d4c8',
    keyword: '#c678dd', string: '#98c379', number: '#e5c07b',
    comment: '#5c6370', fn: '#61afef', punct: '#abb2bf',
    lineNumber: '#444',
  },
  light: {
    bg: '#fafaf7', fg: '#1a1a1c',
    keyword: '#a626a4', string: '#50a14f', number: '#986801',
    comment: '#a0a1a7', fn: '#4078f2', punct: '#383a42',
    lineNumber: '#bbb',
  },
  cyber: {
    bg: '#0a0a14', fg: '#00ffe1',
    keyword: '#ff3d8a', string: '#ffe600', number: '#5eb6e8',
    comment: '#6e7088', fn: '#8b6dd9', punct: '#aaa',
    lineNumber: '#444',
  },
  warmCream: {
    bg: '#fdf6e3', fg: '#586e75',
    keyword: '#cb4b16', string: '#859900', number: '#b58900',
    comment: '#93a1a1', fn: '#268bd2', punct: '#586e75',
    lineNumber: '#d3cbb5',
  },
};

// ─── Token coloriser (small, intentionally simple) ────────────────────
const KEYWORDS_JS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'break', 'continue', 'switch', 'case', 'default', 'try', 'catch',
  'finally', 'throw', 'new', 'this', 'class', 'extends', 'super', 'import',
  'export', 'from', 'as', 'async', 'await', 'true', 'false', 'null', 'undefined',
  'typeof', 'instanceof', 'in', 'of', 'void', 'delete', 'yield',
]);
const KEYWORDS_TS = new Set([
  ...KEYWORDS_JS,
  'type', 'interface', 'enum', 'namespace', 'declare', 'readonly', 'public',
  'private', 'protected', 'abstract', 'implements', 'keyof', 'infer',
  'never', 'unknown', 'any', 'string', 'number', 'boolean', 'object', 'symbol',
]);
const KEYWORDS_PY = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in',
  'not', 'and', 'or', 'is', 'None', 'True', 'False', 'import', 'from',
  'as', 'with', 'try', 'except', 'finally', 'raise', 'pass', 'lambda',
  'global', 'nonlocal', 'yield', 'async', 'await',
]);
const KEYWORDS_SQL = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT',
  'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER',
  'DROP', 'INDEX', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'AS',
  'AND', 'OR', 'NOT', 'IS', 'NULL', 'IN', 'BETWEEN', 'LIKE', 'DISTINCT',
  'UNION', 'ALL', 'EXISTS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  // lowercase mirror
  'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'on',
  'group', 'by', 'order', 'limit', 'insert', 'into', 'values', 'update',
  'set', 'delete', 'create', 'table', 'and', 'or', 'not', 'in', 'as',
]);
const KEYWORDS_BASH = new Set([
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done',
  'in', 'function', 'return', 'echo', 'exit', 'export', 'source',
  'local', 'readonly', 'declare', 'case', 'esac', 'true', 'false',
  'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'sed', 'awk',
  'sudo', 'chmod', 'chown', 'curl', 'wget', 'git', 'npm', 'node', 'python',
]);
const KEYWORDS_CSS = new Set([
  'important', 'inherit', 'initial', 'unset', 'auto', 'none', 'block',
  'inline', 'flex', 'grid', 'absolute', 'relative', 'fixed', 'sticky',
  'transparent', 'currentColor',
]);
const KEYWORDS_GO = new Set([
  'func', 'var', 'const', 'type', 'struct', 'interface', 'package',
  'import', 'return', 'if', 'else', 'for', 'range', 'switch', 'case',
  'default', 'break', 'continue', 'defer', 'go', 'select', 'chan',
  'map', 'true', 'false', 'nil',
]);
const KEYWORDS_RUST = new Set([
  'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'trait',
  'impl', 'pub', 'use', 'mod', 'crate', 'self', 'Self', 'super',
  'return', 'if', 'else', 'match', 'for', 'while', 'loop', 'in',
  'break', 'continue', 'as', 'where', 'true', 'false', 'None', 'Some',
  'Ok', 'Err', 'unsafe', 'async', 'await', 'dyn', 'ref', 'move',
]);

function keywordSet(language: string): Set<string> {
  const l = language.toLowerCase();
  if (l === 'ts' || l === 'typescript' || l === 'tsx') return KEYWORDS_TS;
  if (l === 'py' || l === 'python')                      return KEYWORDS_PY;
  if (l === 'sql')                                       return KEYWORDS_SQL;
  if (l === 'bash' || l === 'sh' || l === 'shell')       return KEYWORDS_BASH;
  if (l === 'css')                                       return KEYWORDS_CSS;
  if (l === 'go' || l === 'golang')                      return KEYWORDS_GO;
  if (l === 'rs' || l === 'rust')                        return KEYWORDS_RUST;
  return KEYWORDS_JS;
}
function commentMarker(language: string): string {
  const l = language.toLowerCase();
  if (l === 'py' || l === 'python' || l === 'sh' || l === 'bash' || l === 'shell') return '#';
  if (l === 'sql') return '--';
  if (l === 'css') return '/*'; // partial; multi-line not handled deeply
  return '//';
}

function tokenize(line: string, language: string): { text: string; type: 'keyword'|'string'|'number'|'comment'|'fn'|'punct'|'plain' }[] {
  const tokens: { text: string; type: any }[] = [];
  const keywords = keywordSet(language);
  const commentMark = commentMarker(language);

  // Strip single-line comment first
  const commentIdx = line.indexOf(commentMark);
  let code = line;
  let comment = '';
  if (commentIdx >= 0) {
    // Make sure it's not inside a string — naive check
    const beforeComment = line.slice(0, commentIdx);
    const quotes = (beforeComment.match(/['"]/g) || []).length;
    if (quotes % 2 === 0) {
      code = line.slice(0, commentIdx);
      comment = line.slice(commentIdx);
    }
  }

  // Simple regex-based tokenizer
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|(\b\w+\b)|([^\s\w])/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) tokens.push({ text: code.slice(last, m.index), type: 'plain' });
    if (m[1] !== undefined) tokens.push({ text: m[1], type: 'string' });
    else if (m[2] !== undefined) tokens.push({ text: m[2], type: 'number' });
    else if (m[3] !== undefined) {
      const w = m[3];
      if (keywords.has(w)) tokens.push({ text: w, type: 'keyword' });
      else {
        // Function name? Check next non-space char is '('
        const after = code.slice(re.lastIndex);
        if (/^\s*\(/.test(after)) tokens.push({ text: w, type: 'fn' });
        else tokens.push({ text: w, type: 'plain' });
      }
    } else if (m[4] !== undefined) tokens.push({ text: m[4], type: 'punct' });
    last = re.lastIndex;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), type: 'plain' });
  if (comment) tokens.push({ text: comment, type: 'comment' });
  return tokens;
}

// ─── CodeBlock (static, but with token colors + line numbers) ─────────
export const CodeBlock: React.FC<{
  code: string;
  language?: string;
  theme?: keyof typeof CODE_THEMES;
  showLineNumbers?: boolean;
  fontSize?: number;
  padding?: number;
  radius?: number;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}> = ({
  code, language = 'js', theme = 'dark', showLineNumbers = true,
  fontSize = 16, padding = 24, radius = 10,
  width = 'auto', height = 'auto', style,
}) => {
  const t = CODE_THEMES[theme] || CODE_THEMES.dark;
  const lines = code.replace(/\t/g, '  ').split('\n');
  return (
    <div style={{
      width, height, padding, borderRadius: radius,
      background: t.bg, color: t.fg,
      fontFamily: '"SF Mono","JetBrains Mono","Menlo",monospace',
      fontSize, lineHeight: 1.55,
      overflow: 'auto',
      ...style,
    }}>
      {lines.map((line, i) => {
        const tokens = tokenize(line, language);
        return (
          <div key={i} style={{ display: 'flex' }}>
            {showLineNumbers && (
              <span style={{
                color: t.lineNumber,
                minWidth: '2.2em',
                paddingRight: 14,
                textAlign: 'right',
                userSelect: 'none',
              }}>{i + 1}</span>
            )}
            <span>
              {tokens.map((tok, j) => (
                <span key={j} style={{ color: tok.type === 'plain' ? t.fg : t[tok.type as keyof CodeTheme] || t.fg }}>
                  {tok.text}
                </span>
              ))}
              {line.length === 0 && <span>&#8203;</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── TypingCodeBlock (typewriter reveal, monospace + caret) ───────────
export const TypingCodeBlock: React.FC<{
  frame: number;
  code: string;
  start?: number;
  cps?: number;            // characters per second
  fps?: number;
  language?: string;
  theme?: keyof typeof CODE_THEMES;
  showLineNumbers?: boolean;
  showCaret?: boolean;
  fontSize?: number;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}> = ({
  frame, code, start = 0, cps = 18, fps = 30,
  language = 'js', theme = 'dark', showLineNumbers = true, showCaret = true,
  fontSize = 16, width = 'auto', height = 'auto', style,
}) => {
  const visibleChars = Math.max(0, Math.floor((frame - start) / fps * cps));
  const visible = code.slice(0, Math.min(visibleChars, code.length));
  const t = CODE_THEMES[theme] || CODE_THEMES.dark;
  const caretVisible = showCaret && (Math.floor(frame / 15) % 2 === 0) && visibleChars <= code.length;
  return (
    <div style={{ position: 'relative', display: 'inline-block', width, height }}>
      <CodeBlock
        code={visible}
        language={language}
        theme={theme}
        showLineNumbers={showLineNumbers}
        fontSize={fontSize}
        width={width}
        height={height}
        style={style}
      />
      {caretVisible && (
        <span style={{
          position: 'absolute',
          right: -2, bottom: 24,
          width: 2, height: fontSize,
          background: t.fg,
        }} />
      )}
    </div>
  );
};

// ─── Inline code chip (small, for use inside prose) ───────────────────
export const InlineCode: React.FC<{
  children: React.ReactNode;
  bg?: string;
  color?: string;
  style?: CSSProperties;
}> = ({ children, bg = 'rgba(255,255,255,0.06)', color = '#d8d4c8', style }) => (
  <code style={{
    background: bg, color,
    fontFamily: '"SF Mono","JetBrains Mono","Menlo",monospace',
    fontSize: '0.92em',
    padding: '2px 7px',
    borderRadius: 5,
    ...style,
  }}>{children}</code>
);
