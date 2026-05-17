// Showreel — proves that multiple v2 skill components compose cleanly
// in a single Remotion timeline. Each scene comes from a different skill.
//
// Scene breakdown:
//   0–75    BrandReveal (stinger)
//   75–155  WaitZoomHook (hook) with ParticleField (backgrounds) under it
//   155–240 KaraokeLine (music-lyrics) with WavyLines (backgrounds) under it
//   240–320 DonutMetric (stats) full-frame
//   320–410 EndCard (stinger) with SubscribeArrow (ctas) stacked
//
// Renders to 1920x1080 landscape so the lower-thirds / charts behave.
//
// This is a cross-skill composition test — if it renders clean, future
// Claude can confidently chain skills.

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BrandReveal, EndCard } from "./stingers";
import { WaitZoomHook } from "./hooks";
import { KaraokeLine } from "./music-lyrics";
import { DonutMetric } from "./charts";
import { SubscribeArrow } from "./ctas";
import { ParticleField, WavyLines } from "./backgrounds";

export const Showreel: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* SCENE 1: brand reveal (stinger) */}
      <Sequence durationInFrames={75}>
        <BrandReveal brand="CRUX" tagline="design + dev" accent="#10b981" />
      </Sequence>

      {/* SCENE 2: hook over particle backdrop */}
      <Sequence from={75} durationInFrames={80}>
        <AbsoluteFill>
          <ParticleField count={80} color="#22d3ee" bg="#000814" />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <WaitZoomHook text="get ready to LAUNCH" punchWord="LAUNCH" bg="transparent" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 3: karaoke verse over wavy lines */}
      <Sequence from={155} durationInFrames={85}>
        <AbsoluteFill>
          <WavyLines color="#10b981" lines={9} bg="#0a1410" />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <KaraokeLine
              words={["build", "the", "best", "skill"]}
              framesPerWord={20}
              bg="transparent"
            />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>

      {/* SCENE 4: stats donut metric */}
      <Sequence from={240} durationInFrames={80}>
        <DonutMetric value={87} label="quality" color="#fde047" />
      </Sequence>

      {/* SCENE 5: end card with subscribe pointer */}
      <Sequence from={320} durationInFrames={90}>
        <AbsoluteFill>
          <EndCard
            primary="THAT'S A SHOWREEL"
            secondary="Like · Subscribe · See you next time"
            accent="#ed2024"
          />
          <AbsoluteFill style={{ zIndex: 1 }}>
            <SubscribeArrow color="#ed2024" />
          </AbsoluteFill>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
