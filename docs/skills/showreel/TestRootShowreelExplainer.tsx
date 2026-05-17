import React from "react";
import { Composition } from "remotion";
import { ShowreelExplainer } from "./ShowreelExplainer";

export const TestRootShowreelExplainer: React.FC = () => (
  <>
    <Composition
      id="showreel-explainer"
      component={ShowreelExplainer}
      durationInFrames={580}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
