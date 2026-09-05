import { Router } from 'express';
import { getManagerById } from './manager.service';
import { getFaceSvg } from '../../services/worldgen/client';
import log from '../../helpers/logger';

// Same reasoning as players/player-face.router.ts (which this mirrors) -
// worldgen-service's face generator is a pure function of any stable
// identity string, not player-specific, so a Manager's own `_id` works as
// the seed just as well.
const router = Router();

router.get('/:id/face', async (req, res) => {
  try {
    const manager = await getManagerById(req.params.id);
    if (!manager) {
      return res.status(404).json({ success: false, message: 'Manager not found' });
    }

    const { svg, cacheControl } = await getFaceSvg(req.params.id, 'v3');

    if (cacheControl) {
      res.set('Cache-Control', cacheControl);
    }
    res.set('Content-Type', 'image/svg+xml');
    return res.status(200).send(svg);
  } catch (err) {
    log(`Error fetching manager face => ${err}`);
    return res.status(502).json({
      success: false,
      message: 'Error generating manager face',
    });
  }
});

export default router;
