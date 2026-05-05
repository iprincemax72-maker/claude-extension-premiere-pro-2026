import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Smoke-test composition shipped with the template so the install can be
// verified with `npm run render -- HelloWorld out.mp4` before any user prompt.
export const HelloWorld: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30, 60, 90], [0, 1, 1, 0]);
  return (
    <AbsoluteFill style={{ background: "#0d0d10", justifyContent: "center", alignItems: "center" }}>
      <div style={{ color: "#d97757", fontSize: 120, fontWeight: 700, fontFamily: "sans-serif", letterSpacing: -2, opacity }}>
        Claude × Premiere
      </div>
    </AbsoluteFill>
  );
};
