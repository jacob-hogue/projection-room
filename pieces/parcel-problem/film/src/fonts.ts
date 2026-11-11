import { loadFont as loadSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Only the weights the film uses; loading every variation can time out the first frame.
export const { fontFamily: SANS } = loadSans('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'] });
export const { fontFamily: MONO } = loadMono('normal', { weights: ['400', '500'], subsets: ['latin'] });
