import React from "react";
import { Composition } from "remotion";
import {
  LowerThird, lowerThirdDefaults,
  TitleCard, titleCardDefaults,
  ListTemplate, listDefaults, listDuration,
  StatCallout, statDefaults,
  SubscribeCTA, subscribeDefaults,
} from "./Templates";

// Let the bridge pass _meta in inputProps to override size/fps/duration to match
// the user's Premiere sequence. Falls back to the composition's own defaults.
type Meta = { width?: number; height?: number; fps?: number; durationInFrames?: number; seconds?: number };
const withMeta = (b: { width: number; height: number; fps: number; durationInFrames: number }) =>
  ({ props }: { props: Record<string, unknown> }) => {
    const m = (props._meta as Meta) || {};
    const fps = Number(m.fps) || b.fps;
    const dur = Number(m.durationInFrames) || (m.seconds ? Math.round(Number(m.seconds) * fps) : b.durationInFrames);
    return { width: Number(m.width) || b.width, height: Number(m.height) || b.height, fps, durationInFrames: dur };
  };

const SIZE = { width: 1920, height: 1080, fps: 30 };

export const FastRoot: React.FC = () => (
  <>
    <Composition id="LowerThird" component={LowerThird} {...SIZE} durationInFrames={150}
      defaultProps={lowerThirdDefaults} calculateMetadata={withMeta({ ...SIZE, durationInFrames: 150 })} />
    <Composition id="TitleCard" component={TitleCard} {...SIZE} durationInFrames={120}
      defaultProps={titleCardDefaults} calculateMetadata={withMeta({ ...SIZE, durationInFrames: 120 })} />
    <Composition id="List" component={ListTemplate} {...SIZE} durationInFrames={180}
      defaultProps={listDefaults}
      calculateMetadata={({ props }) => {
        const pp = props as Record<string, unknown>;
        const m = (pp._meta as Meta) || {};
        const fps = Number(m.fps) || SIZE.fps;
        const dur = Number(m.durationInFrames) || listDuration(props, fps);
        return { width: Number(m.width) || SIZE.width, height: Number(m.height) || SIZE.height, fps, durationInFrames: dur };
      }} />
    <Composition id="StatCallout" component={StatCallout} {...SIZE} durationInFrames={120}
      defaultProps={statDefaults} calculateMetadata={withMeta({ ...SIZE, durationInFrames: 120 })} />
    <Composition id="SubscribeCTA" component={SubscribeCTA} {...SIZE} durationInFrames={120}
      defaultProps={subscribeDefaults} calculateMetadata={withMeta({ ...SIZE, durationInFrames: 120 })} />
  </>
);
