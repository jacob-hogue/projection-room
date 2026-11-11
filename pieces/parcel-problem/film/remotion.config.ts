import { Config } from '@remotion/cli/config';

// Speed without a visible cost: JPEG frames (the H.264 output cannot show the difference),
// every core, and a longer first-frame timeout for the font and data loads.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
// Rasterizing already uses several threads per tab; more tabs only contend.
Config.setConcurrency(2);
Config.setDelayRenderTimeoutInMilliseconds(120000);
Config.setOverwriteOutput(true);
Config.setPublicDir('./public');
// Vulkan captures a frame in about 220 ms here against 500 ms for angle; software GL takes 20 s.
Config.setChromiumOpenGlRenderer('vulkan');
