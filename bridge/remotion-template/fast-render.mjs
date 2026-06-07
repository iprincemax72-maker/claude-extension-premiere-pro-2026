// Super Fast render helper. Spawned by the bridge with one JSON arg:
//   { entry, bundleDir, id, props, meta, outFile }
// Bundles the fast-template project ONCE into bundleDir (reused on later calls),
// then renders the chosen template to a transparent ProRes 4444 .mov overlay.
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import fs from "fs";

const arg = JSON.parse(process.argv[2] || "{}");

let serveUrl = arg.bundleDir;
const cached = fs.existsSync(arg.bundleDir) && fs.existsSync(arg.bundleDir + "/index.html");
if (!cached) {
  serveUrl = await bundle({ entryPoint: arg.entry, outDir: arg.bundleDir });
}

const inputProps = { ...(arg.props || {}), _meta: arg.meta || {} };
const composition = await selectComposition({ serveUrl, id: arg.id, inputProps });
await renderMedia({
  composition,
  serveUrl,
  codec: "prores",
  proResProfile: "4444",
  imageFormat: "png",
  inputProps,
  outputLocation: arg.outFile,
});
console.log("OK " + composition.id + " " + composition.width + "x" + composition.height + " " + composition.durationInFrames + "f");
