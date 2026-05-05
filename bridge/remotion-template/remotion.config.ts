import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// No audio in the bundled output by default — the panel's audio policy keeps
// renders silent unless the user explicitly asks for sound.
Config.setAudioCodec("aac");
