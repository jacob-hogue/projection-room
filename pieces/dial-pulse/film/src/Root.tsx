import { Composition } from 'remotion';
import { Film } from './Film';
import { FPS, FILM_SECONDS, LOOP_FROM, LOOP_SECONDS } from './beats';

export const Root: React.FC = () => (
  <>
    <Composition
      id="DialPulse"
      component={Film}
      durationInFrames={FILM_SECONDS * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ offsetSeconds: 0 }}
    />
    <Composition
      id="Loop"
      component={Film}
      durationInFrames={LOOP_SECONDS * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ offsetSeconds: LOOP_FROM }}
    />
  </>
);
