import { Config } from "@remotion/cli/config";
import os from "os";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// No audio in the bundled output by default — the panel's audio policy keeps
// renders silent unless the user explicitly asks for sound.
Config.setAudioCodec("aac");

// Use most of the machine's cores (Remotion's default is conservative).
// Capped at 8 so weak machines stay responsive and big frames don't OOM.
Config.setConcurrency(Math.max(2, Math.min(8, (os.cpus() || []).length - 1)));

// VideoToolbox encode on Macs (H.264/H.265/ProRes, v4.0.228+) — big encode
// speedup; silently falls back to software on Windows/Linux.
Config.setHardwareAcceleration("if-possible");
