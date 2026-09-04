import { Router } from 'express';
import { getPlayerById } from './player.service';
import { getFaceSvg } from '../../services/worldgen/client';
import log from '../../helpers/logger';

// A generated face SVG is a poor fit for ts-rest's JSON-first model (same
// reasoning as /files/upload staying a plain Express route - see
// packages/api-contract/src/index.ts's note on that) - this stays outside
// the api-contract package permanently too. Player._id is the identity
// seed (stable, always present, unlike the human-readable PlayerID which
// isn't guaranteed set) - see services/worldgen/client.ts for the
// determinism guarantee this relies on (no need to store anything, this
// is called fresh every time).
const router = Router();

router.get('/:id/face', async (req, res) => {
  try {
    const player = await getPlayerById(req.params.id);
    if (!player) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    const { svg, cacheControl } = await getFaceSvg(req.params.id, 'v3');

    if (cacheControl) {
      res.set('Cache-Control', cacheControl);
    }
    res.set('Content-Type', 'image/svg+xml');
    return res.status(200).send(svg);
  } catch (err) {
    log(`Error fetching player face => ${err}`);
    return res.status(502).json({
      success: false,
      message: 'Error generating player face',
    });
  }
});

export default router;
