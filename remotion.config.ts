import { existsSync } from "node:fs";
import { Config } from "@remotion/cli/config";

/**
 * Remotion render config.
 *
 * The engine owns the pixel pipeline, so Remotion's job is compositing and encoding
 * only. These settings keep the renderer faithful to what the engine produced.
 */
Config.setVideoImageFormat("png");
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
// Use the locally installed Google Chrome instead of downloading Remotion's
// chrome-headless-shell. Two reasons: the download is a 94 MB round trip that makes
// first render minutes slower, and a pinned local browser makes the render
// reproducible on this machine.
const LOCAL_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (existsSync(LOCAL_CHROME)) {
  Config.setBrowserExecutable(LOCAL_CHROME);
}
