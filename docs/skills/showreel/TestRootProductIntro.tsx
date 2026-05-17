import React from "react";
import { Composition } from "remotion";
import { ProductIntro } from "./ProductIntro";

export const TestRootProductIntro: React.FC = () => (
  <>
    <Composition
      id="product-intro"
      component={ProductIntro}
      durationInFrames={900}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
