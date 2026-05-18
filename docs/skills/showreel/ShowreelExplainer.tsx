// ShowreelExplainer — long-form tutorial composition mixing tutorial-coded
// skills (stingers, backgrounds, tech, stats, lists, callouts).
//
// 1920x1080 landscape, 19.3 seconds (580 frames @ 30fps).
//
// Demonstrates the "don't chain 3+ tech components without B-roll" rule
// by SHOWING what B-roll between them looks like (in this case a stat
// reveal serves as the B-roll equivalent between CodeSnippet and
// TerminalCommand).

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { ChapterBumper } from "./stingers";
import { CodeSnippet, TerminalCommand } from "./tech";
import { SectionBreak } from "./lists";
import { ProgressRing } from "./stats";
import { PullQuote } from "./callouts";
import { WavyLines } from "./backgrounds";

export const ShowreelExplainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* SCENE 1: chapter bumper — sets up the tutorial */}
      <Sequence durationInFrames={75}>
        <AbsoluteFill>
          <WavyLines color="#10b981" lines={9} bg="#0a0a0a" />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <ChapterBumper number="01" title="Setup" numLabel="STEP" accent="#10b981" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 2: tech tutorial — code snippet */}
      <Sequence from={75} durationInFrames={120}>
        <CodeSnippet
          code={`const remotionConfig = {
  videoCodec: "h264",
  audio: "mute",
};`}
          language="tsx"
          title="remotion.config.tsx"
          charsPerFrame={1.5}
        />
      </Sequence>

      {/* SCENE 3: terminal command */}
      <Sequence from={195} durationInFrames={120}>
        <TerminalCommand
          command="npx remotion render src/index.ts MyComp out.mp4 --mute"
          output="✓ Rendered 300/300 frames in 8.2s"
          prompt="$"
        />
      </Sequence>

      {/* SCENE 4: "we shipped this fast" stat reveal — serves as B-roll
          between the two tech moments per the anti-pattern guidance */}
      <Sequence from={315} durationInFrames={90}>
        <ProgressRing target={94} label="render success" color="#10b981" />
      </Sequence>

      {/* SCENE 5: section break for chapter 2 */}
      <Sequence from={405} durationInFrames={75}>
        <SectionBreak numeral="02" title="The Result" />
      </Sequence>

      {/* SCENE 6: pull quote — the takeaway */}
      <Sequence from={480} durationInFrames={100}>
        <PullQuote
          text="Fast, deterministic, frame-perfect."
          attribution="Remotion 4"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
