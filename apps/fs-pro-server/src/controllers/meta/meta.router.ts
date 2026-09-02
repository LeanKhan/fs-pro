import { Router } from 'express';
import respond from '../../helpers/responseHandler';

const router = Router();

/**
 * @openapi
 * /meta/db:
 *   get:
 *     tags: [Meta]
 *     summary: Database health check
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/db', (req, res) => {
  respond.success(res, 200, 'Database status fetched successfully', {
    backend: 'postgresql',
  });
});

export default router;
