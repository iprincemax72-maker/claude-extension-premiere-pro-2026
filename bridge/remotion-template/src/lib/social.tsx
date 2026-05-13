/**
 * Social-platform card mocks — Tweet, Reddit, LinkedIn, IMessage, Slack,
 * Notification banners. Pre-styled so Claude doesn't reverse-engineer
 * Twitter's CSS each time.
 *
 * Each is a self-contained card with realistic chrome. Pass content via
 * props. Most accept a `darkMode` toggle.
 */

import React, { type CSSProperties } from 'react';
import { Avatar } from './avatars';

// ─── Tweet card ───────────────────────────────────────────────────────
export const TweetCard: React.FC<{
  name?: string;
  handle?: string;
  text: string;
  time?: string;
  likes?: number | string;
  retweets?: number | string;
  replies?: number | string;
  verified?: boolean;
  avatarColor?: string;
  darkMode?: boolean;
  style?: CSSProperties;
}> = ({
  name = 'Jane Doe', handle = 'janedoe', text, time = '2h',
  likes = 1248, retweets = 234, replies = 56, verified = false,
  avatarColor, darkMode = true, style,
}) => {
  const bg = darkMode ? '#000' : '#fff';
  const fg = darkMode ? '#e7e9ea' : '#0f1419';
  const muted = darkMode ? '#71767b' : '#536471';
  const border = darkMode ? '#2f3336' : '#eff3f4';
  return (
    <div style={{
      width: 540, background: bg, color: fg,
      border: `1px solid ${border}`, borderRadius: 16, padding: '14px 16px',
      fontFamily: '"SF Pro Display","Inter",sans-serif',
      ...style,
    }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <Avatar name={name} color={avatarColor} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 15 }}>
            <span style={{ fontWeight: 700 }}>{name}</span>
            {verified && <span style={{ color: '#1d9bf0', fontSize: 16 }}>&#10004;</span>}
            <span style={{ color: muted, fontWeight: 400 }}> · @{handle} · {time}</span>
          </div>
          <div style={{ fontSize: 17, lineHeight: 1.35, marginTop: 4 }}>{text}</div>
          <div style={{ display: 'flex', gap: 36, marginTop: 14, color: muted, fontSize: 13 }}>
            <span>&#128172; {replies}</span>
            <span>&#128257; {retweets}</span>
            <span>&hearts; {likes}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Reddit post card ─────────────────────────────────────────────────
export const RedditCard: React.FC<{
  subreddit?: string;
  user?: string;
  title: string;
  upvotes?: number | string;
  comments?: number | string;
  time?: string;
  darkMode?: boolean;
  style?: CSSProperties;
}> = ({
  subreddit = 'AskReddit', user = 'someuser', title,
  upvotes = '12.3k', comments = 487, time = '4 hr. ago',
  darkMode = true, style,
}) => {
  const bg = darkMode ? '#1a1a1b' : '#fff';
  const fg = darkMode ? '#d7dadc' : '#1c1c1c';
  const muted = darkMode ? '#818384' : '#787c7e';
  return (
    <div style={{
      width: 600, background: bg, color: fg,
      border: `1px solid ${darkMode ? '#343536' : '#ccc'}`,
      borderRadius: 6, display: 'flex',
      fontFamily: '"IBM Plex Sans","SF Pro Display","Inter",sans-serif',
      ...style,
    }}>
      <div style={{
        width: 44, background: darkMode ? '#272729' : '#f6f7f8',
        borderRadius: '6px 0 0 6px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0',
        gap: 4, fontSize: 14, fontWeight: 700,
      }}>
        <div style={{ color: muted }}>&#9650;</div>
        <div>{upvotes}</div>
        <div style={{ color: muted }}>&#9660;</div>
      </div>
      <div style={{ flex: 1, padding: 12 }}>
        <div style={{ color: muted, fontSize: 12 }}>
          <span style={{ fontWeight: 700, color: fg }}>r/{subreddit}</span> · Posted by u/{user} · {time}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 8, lineHeight: 1.3 }}>{title}</div>
        <div style={{ marginTop: 12, color: muted, fontSize: 13, fontWeight: 600 }}>
          &#128172; {comments} Comments · Share · Save
        </div>
      </div>
    </div>
  );
};

// ─── LinkedIn post card ───────────────────────────────────────────────
export const LinkedInCard: React.FC<{
  name?: string; title?: string; time?: string; text: string;
  likes?: number | string; comments?: number | string;
  avatarColor?: string;
  style?: CSSProperties;
}> = ({
  name = 'Jane Doe', title = 'Founder · Acme Inc.', time = '2d',
  text, likes = '1,248', comments = 92, avatarColor, style,
}) => (
  <div style={{
    width: 540, background: '#fff', color: '#1a1a1c',
    border: '1px solid #e0e0e0', borderRadius: 10, padding: 16,
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    ...style,
  }}>
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <Avatar name={name} color={avatarColor} size={48} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        <div style={{ color: '#666', fontSize: 12 }}>{title}</div>
        <div style={{ color: '#888', fontSize: 11 }}>{time} · &#127758;</div>
      </div>
    </div>
    <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{text}</div>
    <div style={{
      marginTop: 14, paddingTop: 8, borderTop: '1px solid #e0e0e0',
      display: 'flex', justifyContent: 'space-between',
      color: '#666', fontSize: 12,
    }}>
      <span>&#128077; {likes}</span>
      <span>{comments} comments</span>
    </div>
  </div>
);

// ─── IMessage bubble ──────────────────────────────────────────────────
export const IMessage: React.FC<{
  text: string;
  side?: 'me' | 'them';
  delivered?: boolean;
  style?: CSSProperties;
}> = ({ text, side = 'me', delivered = false, style }) => {
  const isMe = side === 'me';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isMe ? 'flex-end' : 'flex-start',
      marginBottom: 4,
      ...style,
    }}>
      <div style={{
        maxWidth: '70%',
        background: isMe ? 'linear-gradient(180deg, #2997ff 0%, #007aff 100%)' : '#3a3a3c',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: 20,
        borderBottomRightRadius: isMe ? 6 : 20,
        borderBottomLeftRadius: isMe ? 20 : 6,
        fontFamily: '"SF Pro Display","Inter",sans-serif',
        fontSize: 17, lineHeight: 1.32,
      }}>
        {text}
        {delivered && isMe && (
          <div style={{ fontSize: 10, color: '#999', marginTop: 4, textAlign: 'right' }}>Delivered</div>
        )}
      </div>
    </div>
  );
};

// ─── IMessage thread (multiple bubbles in a phone-ish container) ─────
export const IMessageThread: React.FC<{
  messages: { text: string; side: 'me' | 'them' }[];
  bg?: string;
  style?: CSSProperties;
}> = ({ messages, bg = '#000', style }) => (
  <div style={{
    width: 400, background: bg, padding: 20,
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    ...style,
  }}>
    {messages.map((m, i) => <IMessage key={i} text={m.text} side={m.side} />)}
  </div>
);

// ─── Slack message ────────────────────────────────────────────────────
export const SlackMessage: React.FC<{
  name?: string;
  time?: string;
  text: string;
  avatarColor?: string;
  reactions?: { emoji: string; count: number }[];
  style?: CSSProperties;
}> = ({ name = 'jane.doe', time = '2:34 PM', text, avatarColor, reactions, style }) => (
  <div style={{
    width: 560, padding: '12px 16px',
    background: '#fff', color: '#1d1c1d',
    fontFamily: 'Lato,"SF Pro Display","Inter",sans-serif',
    display: 'flex', gap: 12,
    ...style,
  }}>
    <Avatar name={name} color={avatarColor} size={40} square />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontWeight: 900, fontSize: 15 }}>{name}</span>
        <span style={{ color: '#616061', fontSize: 12 }}>{time}</span>
      </div>
      <div style={{ marginTop: 2, fontSize: 15, lineHeight: 1.45 }}>{text}</div>
      {reactions && reactions.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {reactions.map((r, i) => (
            <div key={i} style={{
              background: '#f8f8f8',
              border: '1px solid #d4d4d4',
              borderRadius: 16, padding: '2px 8px',
              fontSize: 13,
            }}>{r.emoji} {r.count}</div>
          ))}
        </div>
      )}
    </div>
  </div>
);

// ─── Notification banner (iOS-style toast) ────────────────────────────
export const Notification: React.FC<{
  appName?: string;
  title: string;
  body?: string;
  time?: string;
  iconColor?: string;
  style?: CSSProperties;
}> = ({ appName = 'Messages', title, body, time = 'now', iconColor = '#28c840', style }) => (
  <div style={{
    width: 360, padding: '12px 14px',
    background: 'rgba(40, 40, 45, 0.92)',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    borderRadius: 20,
    color: '#fff',
    boxShadow: '0 18px 50px rgba(0,0,0,0.4)',
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    display: 'flex', gap: 10,
    ...style,
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 10,
      background: iconColor,
      flexShrink: 0,
    }} />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#bbb' }}>
        <span style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{appName}</span>
        <span>{time}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 1 }}>{title}</div>
      {body && <div style={{ fontSize: 13, marginTop: 1, color: '#d8d8da' }}>{body}</div>}
    </div>
  </div>
);

// ─── Email card (Mail / Gmail-ish) ────────────────────────────────────
export const EmailCard: React.FC<{
  from?: string;
  subject?: string;
  preview?: string;
  time?: string;
  unread?: boolean;
  avatarColor?: string;
  style?: CSSProperties;
}> = ({ from = 'Jane Doe', subject = '', preview = '', time = '2h', unread = true, avatarColor, style }) => (
  <div style={{
    width: 540, background: '#fff', color: '#1a1a1c',
    padding: 14,
    borderBottom: '1px solid #e0e0e0',
    display: 'flex', gap: 12,
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    ...style,
  }}>
    <Avatar name={from} color={avatarColor} size={40} />
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: unread ? 800 : 600, fontSize: 14 }}>{from}</span>
        <span style={{ color: '#888', fontSize: 12 }}>{time}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: unread ? 700 : 500, marginTop: 2 }}>{subject}</div>
      <div style={{ fontSize: 13, color: '#666', marginTop: 2, lineHeight: 1.3 }}>{preview}</div>
    </div>
    {unread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2997ff', marginTop: 6 }} />}
  </div>
);

// ─── TikTok-style overlay (caption + like count in the corner) ────────
export const TikTokOverlay: React.FC<{
  username?: string;
  caption?: string;
  likes?: number | string;
  comments?: number | string;
  shares?: number | string;
  style?: CSSProperties;
}> = ({ username = 'someone', caption = '', likes = '12.4K', comments = '342', shares = '89', style }) => (
  <div style={{
    position: 'absolute', inset: 0, pointerEvents: 'none',
    fontFamily: '"SF Pro Display","Inter",sans-serif',
    color: '#fff',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)',
    ...style,
  }}>
    {/* Bottom-left caption */}
    <div style={{ position: 'absolute', bottom: '8%', left: '5%', maxWidth: '70%' }}>
      <div style={{ fontWeight: 700, fontSize: 17 }}>@{username}</div>
      <div style={{ fontSize: 15, marginTop: 6, lineHeight: 1.3 }}>{caption}</div>
    </div>
    {/* Right-edge engagement column */}
    <div style={{
      position: 'absolute', right: '5%', bottom: '12%',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      fontSize: 13, fontWeight: 700,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32 }}>&hearts;</div>
        <div>{likes}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 30 }}>&#128172;</div>
        <div>{comments}</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 30 }}>&#10148;</div>
        <div>{shares}</div>
      </div>
    </div>
  </div>
);
