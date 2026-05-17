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

    {/* FEATURE 1: 90–330. Sequential within the feature: caption first
        (own full-frame), then the supporting visual (own full-frame).
        Stacking WordPopCaption + visual in one AbsoluteFill doesn't work
        because WordPopCaption fills its frame and centers its own content. */}
    <Sequence from={90} durationInFrames={90}>
      <WordPopCaption words={["fast", "shipping", "anywhere"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={180} durationInFrames={150}>
      <PolaroidFrame content="🚚" caption="2-day worldwide" />
    </Sequence>

    {/* FEATURE 2: 330–570 */}
    <Sequence from={330} durationInFrames={90}>
      <WordPopCaption words={["94%", "on-time", "rate"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={420} durationInFrames={150}>
      <ProgressRing target={94} label="on time" />
    </Sequence>

    {/* FEATURE 3: 570–810 */}
    <Sequence from={570} durationInFrames={90}>
      <WordPopCaption words={["just", "3 lines", "of code"]} framesPerWord={28} />
    </Sequence>
    <Sequence from={660} durationInFrames={150}>
      <CodeSnippet
        code={`import { ship } from "quickship";
const order = await ship("anywhere");
console.log(order.id);`}
        language="tsx"
        charsPerFrame={1.5}
      />
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
