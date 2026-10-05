import 'dotenv/config';
import { updateAllPlayerDetailsForYear } from '../controllers/players/player.controller';

/** Times the yearly player progression alone on a scratch world. Never
 * point it at a real world: it ages and develops every player.
 *   DATABASE_URL=postgres://.../scratch npx ts-node --transpile-only src/scripts/timeProgression.ts */
(async () => {
  if (!/check|scratch|scale/i.test(process.env.DATABASE_URL ?? '')) throw new Error('Refusing: not a scratch database');
  const t = Date.now();
  await updateAllPlayerDetailsForYear('YCHECK', { fromDay: 0, toDay: 1000 });
  console.log(`progression: ${Date.now() - t} ms`);
  process.exit(0);
})().catch((err) => {
  const e = err as { cause?: unknown; stack?: string };
  console.error(String(e.cause ?? err).slice(0, 300));
  const frames = (e.stack ?? '').split('\n').filter((l) => l.includes('fs-pro-server') && !l.includes('node_modules'));
  console.error(frames.join('\n'));
  process.exit(1);
});
