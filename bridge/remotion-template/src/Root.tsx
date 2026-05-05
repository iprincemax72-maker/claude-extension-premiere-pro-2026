import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";

// Claude registers new compositions here for each render request.
// IDs must be unique. Add new <Composition /> entries above this comment block.
export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={90}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
