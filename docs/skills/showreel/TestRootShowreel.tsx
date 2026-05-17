import React from "react";
import { Composition } from "remotion";
import { Showreel } from "./Showreel";

export const TestRootShowreel: React.FC = () => (
  <>
    <Composition
      id="showreel"
      component={Showreel}
      durationInFrames={410}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
