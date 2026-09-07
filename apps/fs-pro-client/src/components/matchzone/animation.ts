import { IMatchFramePlayer } from '@/utils/matchReplaySocket';

type PlayerAnimation = 'idle' | 'walk' | 'run' | 'dribble';

export function getPlayerAnimation(p: IMatchFramePlayer): PlayerAnimation {
  const previous = previousPlayer(p.id);

  if (!previous) {
    return p.withBall ? 'dribble' : 'idle';
  }

  const dx = p.x - previous.x;
  const dy = p.y - previous.y;

  const distance = Math.sqrt(dx * dx + dy * dy);

  if (p.withBall && distance > 0.1) {
    return 'dribble';
  }

  if (distance < 0.1) {
    return 'idle';
  }

  if (distance <= 1) {
    return 'walk';
  }

  return 'run';
}
