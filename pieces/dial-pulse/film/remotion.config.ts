import { Config } from '@remotion/cli/config';

// Speed without a visible cost: JPEG frames (the H.264 output cannot show the difference),
// every core, and a longer first-frame timeout for the font and data loads.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency('100%');
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setOverwriteOutput(true);
Config.setPublicDir('./public');
Config.setChromiumOpenGlRenderer('angle');
