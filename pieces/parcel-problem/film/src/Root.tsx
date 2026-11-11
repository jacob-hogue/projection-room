import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, FILM_SECONDS } from './beats';

export const Root: React.FC = () => (
  <Composition id="ParcelProblem" component={Film} durationInFrames={FILM_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
);
