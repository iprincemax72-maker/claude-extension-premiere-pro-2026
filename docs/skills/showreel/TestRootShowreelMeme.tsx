import React from "react";
import { Composition } from "remotion";
import { ShowreelMeme } from "./ShowreelMeme";

export const TestRootShowreelMeme: React.FC = () => (
  <>
    <Composition
      id="showreel-meme"
      component={ShowreelMeme}
      durationInFrames={510}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
