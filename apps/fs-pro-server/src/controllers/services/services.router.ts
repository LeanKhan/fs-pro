import { Router } from 'express';
import {
  generateFamilyNames,
  generateNames,
  getFaceSvg,
  worldgenHealthy,
  type FaceVersion,
  type NameReturnParts,
} from '../../services/worldgen/client';
import log from '../../helpers/logger';

/**
 * The services API: one HTTP surface over fs-pro's own Go microservices so
 * the client and the rest of the server never talk to them directly or
 * depend on their internals.
 *
 * `worldgen` (services/worldgen) owns non-football generation - names and
 * faces today, news and similar content generators later - so its routes
 * live under /api/services/worldgen/* and grow there. Faces are an SVG
 * document, so - like the player/manager face routes - they stay plain
 * Express routes rather than joining the JSON-first ts-rest contract.
 *
 * Mounted at /api/services (see routers/index.ts).
 */
const router = Router();

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// GET /api/services/worldgen/faces?identity=<stable id>&version=v3 -> image/svg+xml
router.get('/worldgen/faces', async (req, res) => {
  const identity = queryString(req.query.identity);
  if (!identity) {
    return res.status(400).json({ success: false, message: 'identity query parameter is required' });
  }
  const version = queryString(req.query.version) as FaceVersion | '';

  try {
    const { svg, cacheControl } = await getFaceSvg(identity, version || undefined);
    if (cacheControl) {
      res.set('Cache-Control', cacheControl);
    }
    res.set('Content-Type', 'image/svg+xml');
    return res.status(200).send(svg);
  } catch (err) {
    log(`Error generating face via services API => ${err}`);
    return res.status(502).json({ success: false, message: 'Error generating face' });
  }
});

// POST /api/services/worldgen/names {count, culture, returnParts?} -> {names:[...]}
router.post('/worldgen/names', async (req, res) => {
  const { count, culture, returnParts } = (req.body ?? {}) as {
    count?: unknown;
    culture?: unknown;
    returnParts?: unknown;
  };
  if (!Number.isInteger(count) || !culture) {
    return res
      .status(400)
      .json({ success: false, message: 'count (integer) and culture are required' });
  }

  try {
    const names = await generateNames(
      count as number,
      String(culture),
      (returnParts as NameReturnParts | undefined) ?? undefined
    );
    return res.status(200).json({ success: true, names });
  } catch (err) {
    log(`Error generating names via services API => ${err}`);
    return res.status(502).json({ success: false, message: 'Error generating names' });
  }
});

// POST /api/services/worldgen/names/family {count, culture, lastname} -> {names:[...]}
router.post('/worldgen/names/family', async (req, res) => {
  const { count, culture, lastname } = (req.body ?? {}) as {
    count?: unknown;
    culture?: unknown;
    lastname?: unknown;
  };
  if (!Number.isInteger(count) || !culture || !lastname) {
    return res
      .status(400)
      .json({ success: false, message: 'count (integer), culture and lastname are required' });
  }

  try {
    const names = await generateFamilyNames(count as number, String(culture), String(lastname));
    return res.status(200).json({ success: true, names });
  } catch (err) {
    log(`Error generating family names via services API => ${err}`);
    return res.status(502).json({ success: false, message: 'Error generating family names' });
  }
});

// GET /api/services/worldgen/health -> reachability of the worldgen service
router.get('/worldgen/health', async (_req, res) => {
  const healthy = await worldgenHealthy();
  return res.status(healthy ? 200 : 503).json({ success: healthy, services: { worldgen: healthy } });
});

export default router;
