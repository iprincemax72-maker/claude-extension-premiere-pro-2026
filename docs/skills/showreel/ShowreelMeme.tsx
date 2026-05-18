// ShowreelMeme — meme/comedy composition mixing reactions + word-effects.
//
// 1080x1920 vertical (TikTok), ~16 seconds. Demonstrates that meme-coded
// components (CryingLaugh, MindBlown, CensorBar, ExpectedVsHappened,
// StampImpact) compose without fighting each other when sequenced properly.

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { POVCaption } from "./hooks";
import { MindBlown, CryingLaugh, HundredSlam } from "./reactions";
import { CensorBar, SpinningLetters } from "./word-effects";
import { StampImpact } from "./text-presets";
import { ExpectedVsHappened } from "./comparison";

export const ShowreelMeme: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* SCENE 1: POV setup */}
      <Sequence durationInFrames={75}>
        <POVCaption sentence="you find out what skibidi means" />
      </Sequence>

      {/* SCENE 2: censor (pretend the word was risky) */}
      <Sequence from={75} durationInFrames={45}>
        <CensorBar word="skibidi" caption="REDACTED" />
      </Sequence>

      {/* SCENE 3: mind blown */}
      <Sequence from={120} durationInFrames={60}>
        <MindBlown />
      </Sequence>

      {/* SCENE 4: ExpectedVsHappened twist (landscape inside vertical sequence) */}
      <Sequence from={180} durationInFrames={75}>
        <ExpectedVsHappened
          expected="A serious term"
          happened="An onomatopoeia from a YouTube short"
        />
      </Sequence>

      {/* SCENE 5: crying laugh reaction */}
      <Sequence from={255} durationInFrames={60}>
        <CryingLaugh corner="bottom-right" />
      </Sequence>

      {/* SCENE 6: HundredSlam (FACTS stamp) */}
      <Sequence from={315} durationInFrames={60}>
        <HundredSlam />
      </Sequence>

      {/* SCENE 7: SpinningLetters end stamp */}
      <Sequence from={375} durationInFrames={75}>
        <SpinningLetters text="BYE" />
      </Sequence>

      {/* SCENE 8: STAMP */}
      <Sequence from={450} durationInFrames={60}>
        <StampImpact text="THE END" color="#ed2024" />
      </Sequence>
    </AbsoluteFill>
  );
};
