import React from "react";
import { Composition } from "remotion";
import { ShowreelV } from "./ShowreelV";

export const TestRootShowreelV: React.FC = () => (
  <>
    <Composition
      id="showreel-v"
      component={ShowreelV}
      durationInFrames={435}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
