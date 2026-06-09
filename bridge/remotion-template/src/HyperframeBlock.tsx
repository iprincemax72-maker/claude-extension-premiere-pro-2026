// HyperframeBlock — renders a self-contained HyperFrames HTML/CSS/GSAP block
// THROUGH Remotion. HyperFrames blocks register a paused GSAP timeline at
// window.__timelines[compositionId]; we mount the block in an iframe and seek
// that timeline to (frame / fps) every Remotion frame. Same deterministic
// model HyperFrames itself uses — so the existing Remotion render/alpha/
// hardware-accel/import pipeline drives HyperFrames content with zero new
// tooling.
//
// Use it from a Composition Claude writes:
//   <HyperframeBlock src={staticFile('my-block.html')} compositionId="main" />
//
// Notes:
//  - Pure DOM/CSS/GSAP blocks render perfectly. Raw-WebGL/Three.js shader
//    blocks render their DOM but NOT the shader canvas in headless Chrome —
//    HyperFrames mode tells Claude to avoid them.
//  - No background is painted here, so transparent blocks stay transparent
//    (ProRes 4444 alpha passes straight through).
import {
  AbsoluteFill, continueRender, delayRender,
  useCurrentFrame, useVideoConfig,
} from 'remotion';
import React, {useEffect, useRef, useState} from 'react';

export const HyperframeBlock: React.FC<{
  src: string;
  compositionId?: string;
}> = ({src, compositionId = 'main'}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [fetchHandle] = useState(() => delayRender('hyperframe:fetch'));
  const [readyHandle] = useState(() => delayRender('hyperframe:ready'));
  const ready = useRef(false);

  const seek = (f: number) => {
    const win = iframeRef.current?.contentWindow as any;
    const tl = win && win.__timelines && win.__timelines[compositionId];
    if (tl && typeof tl.seek === 'function') {
      tl.pause();
      tl.seek(Math.floor(f) / fps);
    }
  };

  // 1. Fetch the block HTML (from public/ via staticFile).
  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => r.text())
      .then((t) => { if (alive) { setHtml(t); continueRender(fetchHandle); } })
      .catch(() => { if (alive) { setHtml('<html><body></body></html>'); continueRender(fetchHandle); } });
    return () => { alive = false; };
  }, [src, fetchHandle]);

  // 2. Once the iframe's scripts run, wait for the timeline + fonts, seek to
  //    the first frame, then release the render. Hard timeout so a misbehaving
  //    block can never hang the render forever.
  const onLoad = () => {
    const win = iframeRef.current?.contentWindow as any;
    if (!win) { continueRender(readyHandle); return; }
    const started = (win.performance && win.performance.now && win.performance.now()) || 0;
    const check = () => {
      const tl = win.__timelines && win.__timelines[compositionId];
      const elapsed = ((win.performance && win.performance.now && win.performance.now()) || 0) - started;
      if (tl) {
        const fonts = win.document.fonts ? win.document.fonts.ready : Promise.resolve();
        Promise.resolve(fonts).then(() => {
          seek(frame);
          ready.current = true;
          continueRender(readyHandle);
        });
      } else if (elapsed < 25000) {
        win.setTimeout(check, 12);
      } else {
        // No timeline registered (bad block) — render whatever painted.
        ready.current = true;
        continueRender(readyHandle);
      }
    };
    check();
  };

  // 3. Drive the timeline on every frame.
  useEffect(() => {
    if (ready.current) seek(frame);
  }, [frame, fps, compositionId]);

  return (
    <AbsoluteFill>
      {html !== null && (
        <iframe
          ref={iframeRef}
          srcDoc={html}
          onLoad={onLoad}
          width={width}
          height={height}
          scrolling="no"
          style={{border: 'none', width, height, display: 'block', background: 'transparent'}}
        />
      )}
    </AbsoluteFill>
  );
};
