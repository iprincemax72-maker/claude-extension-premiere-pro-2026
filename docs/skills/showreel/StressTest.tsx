// Stress test — deliberately pushes components with extreme/edge prop values
// to find any remaining bugs in the v2 skill sources. Each scene exercises
// a different stress case.

import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { NumberedList } from "./lists";
import { KaraokeLine } from "./music-lyrics";
import { CodeSnippet } from "./tech";
import { BarChart } from "./charts";
import { TypewriterPro } from "./text-presets";

export const StressTest: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: "#0a0a0a" }}>
      {/* STRESS 1: NumberedList at its documented cap of 7 items */}
      <Sequence durationInFrames={150}>
        <NumberedList
          title="7 things (the documented cap)"
          items={[
            "one", "two", "three", "four",
            "five", "six", "seven",
          ]}
          framesPerItem={18}
        />
      </Sequence>

      {/* STRESS 2: KaraokeLine with mixed unicode (CJK + emoji) */}
      <Sequence from={150} durationInFrames={120}>
        <KaraokeLine
          words={["sing", "歌", "🎵", "now"]}
          framesPerWord={20}
        />
      </Sequence>

      {/* STRESS 3: CodeSnippet exactly at the documented 80-char line limit */}
      <Sequence from={270} durationInFrames={120}>
        <CodeSnippet
          code={`const longButLegalLine = "this line is exactly eighty characters long ok yes";`}
          language="tsx"
          title="src/edge.ts"
          charsPerFrame={2}
        />
      </Sequence>

      {/* STRESS 4: BarChart at its documented cap of 6 categories */}
      <Sequence from={390} durationInFrames={100}>
        <BarChart data={[
          { label: "A", value: 100 },
          { label: "B", value: 80 },
          { label: "C", value: 60 },
          { label: "D", value: 45 },
          { label: "E", value: 30 },
          { label: "F", value: 15 },
        ]} />
      </Sequence>

      {/* STRESS 5: TypewriterPro with punctuation that triggers pauses */}
      <Sequence from={490} durationInFrames={200}>
        <TypewriterPro
          text="Hey. This is a test. How does it handle punctuation? Pretty well!"
        />
      </Sequence>
    </AbsoluteFill>
  );
};
