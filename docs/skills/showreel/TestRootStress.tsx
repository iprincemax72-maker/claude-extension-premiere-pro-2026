import React from "react";
import { Composition } from "remotion";
import { StressTest } from "./StressTest";

export const TestRootStress: React.FC = () => (
  <>
    <Composition
      id="stress-test"
      component={StressTest}
      durationInFrames={690}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
