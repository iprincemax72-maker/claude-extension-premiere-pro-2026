// ShowreelV — vertical 1080x1920 cross-skill stress test.
//
// Vertical short-form composition mixing 8+ skill families with proper
// motion timing and overlays. This is the harder cousin of Showreel.tsx
// — uses transparency, simultaneous layered overlays, and back-to-back
// reactions at the boundaries of what the cross-skill anti-patterns
// allow (max 2 reactions in a row, never simultaneously).
//
// Scenes:
//   0–60     CoquetteIntro (trend-packs)
//   60–135   POVCaption (hooks) + CornerWatermark (social-ui) overlay
//   135–195  iMessageBubble (social-ui) — chat moment
//   195–255  HeartEyes (reactions) over the bubble
//   255–315  NumberedList (lists) 3-item — vertical-native
//   315–375  LikeBurst (social-ui) — engagement moment
//   375–435  AnimatedGradient (backgrounds) + SubscribeArrow (ctas) end

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { CoquetteIntro } from "./trend-packs";
import { POVCaption } from "./hooks";
import { iMessageBubble, CornerWatermark, LikeBurst } from "./social-ui";
import { HeartEyes } from "./reactions";
import { NumberedList } from "./lists";
import { SubscribeArrow } from "./ctas";
import { AnimatedGradient } from "./backgrounds";

export const ShowreelV: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* SCENE 1: coquette intro (trend-packs) */}
      <Sequence durationInFrames={60}>
        <CoquetteIntro text="LET'S GO" />
      </Sequence>

      {/* SCENE 2: POV caption with persistent watermark in corner */}
      <Sequence from={60} durationInFrames={75}>
        <AbsoluteFill>
          <POVCaption sentence="you just got the job" />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <CornerWatermark handle="@anshdhakad" position="bottom-left" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 3: chat moment */}
      <Sequence from={135} durationInFrames={60}>
        <AbsoluteFill>
          <iMessageBubble text="WAIT WHAT" />
          <AbsoluteFill style={{ zIndex: 1, pointerEvents: "none" }}>
            <CornerWatermark handle="@anshdhakad" position="bottom-left" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 4: heart eyes reaction */}
      <Sequence from={195} durationInFrames={60}>
        <HeartEyes />
      </Sequence>

      {/* SCENE 5: 3 things list */}
      <Sequence from={255} durationInFrames={60}>
        <NumberedList
          title="3 things"
          items={["start now", "ship fast", "stay weird"]}
          framesPerItem={18}
          accent="#ff7a4d"
        />
      </Sequence>

      {/* SCENE 6: like burst engagement moment */}
      <Sequence from={315} durationInFrames={60}>
        <LikeBurst />
      </Sequence>

      {/* SCENE 7: gradient hero + subscribe pointer end */}
      <Sequence from={375} durationInFrames={60}>
        <AbsoluteFill>
          <AnimatedGradient colorA="#ec4899" colorB="#8b5cf6" speed={1.2} />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <SubscribeArrow color="#ffffff" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
