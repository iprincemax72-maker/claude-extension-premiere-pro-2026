// The "QUICKSHIP" 30-second product intro from docs/skills/TUTORIAL.md.
// Render this to confirm the tutorial code actually works.

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { WaitZoomHook } from "./hooks";
import { WordPopCaption } from "./text-presets";
import { PolaroidFrame } from "./frames";
import { ProgressRing } from "./stats";
import { CodeSnippet } from "./tech";
import { TapToFollow } from "./ctas";
import { AnimatedGradient } from "./backgrounds";

export const ProductIntro: React.FC = () => (
  <AbsoluteFill style={{ background: "#0a0a0a" }}>
    {/* HOOK 0–90 */}
    <Sequence durationInFrames={90}>
      <WaitZoomHook text="meet QUICKSHIP" punchWord="QUICKSHIP" />
    </Sequence>

    {/* FEATURE 1: 90–330 */}
    <Sequence from={90} durationInFrames={240}>
      <AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 200 }}>
          <WordPopCaption words={["fast", "shipping", "anywhere"]} framesPerWord={28} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 200 }}>
          <PolaroidFrame content="🚚" caption="2-day worldwide" />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>

    {/* FEATURE 2: 330–570 */}
    <Sequence from={330} durationInFrames={240}>
      <AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 180 }}>
          <WordPopCaption words={["94%", "on-time", "rate"]} framesPerWord={28} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", marginTop: 240 }}>
          <ProgressRing target={94} label="on time" />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>

    {/* FEATURE 3: 570–810 */}
    <Sequence from={570} durationInFrames={240}>
      <AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 160 }}>
          <WordPopCaption words={["just", "3 lines", "of code"]} framesPerWord={28} />
        </AbsoluteFill>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", marginTop: 280 }}>
          <CodeSnippet
            code={`import { ship } from "quickship";
const order = await ship("anywhere");
console.log(order.id);`}
            language="tsx"
            charsPerFrame={1.5}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>

    {/* CTA: 810–900 */}
    <Sequence from={810} durationInFrames={90}>
      <AbsoluteFill>
        <AnimatedGradient colorA="#10b981" colorB="#3b82f6" speed={1.5} />
        <AbsoluteFill style={{ zIndex: 1 }}>
          <TapToFollow label="follow @quickship" />
        </AbsoluteFill>
      </AbsoluteFill>
    </Sequence>
  </AbsoluteFill>
);
