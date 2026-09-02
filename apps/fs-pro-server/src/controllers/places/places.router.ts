import { Router } from 'express';
import {
  getAllPlaces,
  getPlace,
  getPlaceByNameOrCode,
  updatePlace,
} from './places.service';
import respond from '../../helpers/responseHandler';
import log from '../../helpers/logger';

const router = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     Place:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Postgres UUID
 *         Fullname:
 *           type: string
 *           example: Republic of Simeone
 *         Name:
 *           type: string
 *           example: Simeone
 *         Code:
 *           type: string
 *           example: SIM
 *         Region:
 *           type: string
 *           example: world-east
 *         Type:
 *           type: string
 *           example: country
 *         Picture:
 *           type: string
 *           nullable: true
 */

/**
 * @openapi
 * /places:
 *   get:
 *     tags: [Places]
 *     summary: Fetch places, optionally filtered
 *     parameters:
 *       - in: query
 *         name: options
 *         schema:
 *           type: string
 *         description: JSON-encoded filter, e.g. {"Type":"country"}
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Place'
 */
router.get('/', (req, res) => {
  let options: any = req.query.options || {};
  // This prevents the app from crashing if there's
  // an error parsing object :)
  try {
    if (req.query.options && typeof req.query.options === 'string') {
      options = JSON.parse(req.query.options);
    }
  } catch (err) {
    log(`Error parsing JSON => ${err}`);
  }

  /** e.g to fetch all countries: options => {Type: 'country'} */
  getAllPlaces(options)
    .then((places: any[]) => {
      respond.success(res, 200, 'Places fetched successfully', places);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching players', err);
    });
});

/**
 * @openapi
 * /places/country:
 *   get:
 *     tags: [Places]
 *     summary: Fetch every Place with Type=country
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Place'
 */
router.get('/country', (req, res) => {
  // Get Place by name slug
  getAllPlaces({ Type: 'country' })
    .then((p: any) => {
      respond.success(res, 200, 'Countries fetched successfully', p);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Countries', err);
    });
});

/**
 * @openapi
 * /places/{id}:
 *   get:
 *     tags: [Places]
 *     summary: Fetch a Place by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   $ref: '#/components/schemas/Place'
 */
router.get('/:id', (req, res) => {
  // Get Place by name slug
  const { id } = req.params;

  getPlace(id)
    .then((p: any) => {
      respond.success(res, 200, 'Place fetched successfully', p);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Place', err);
    });
});

/**
 * @openapi
 * /places/name/{name}:
 *   get:
 *     tags: [Places]
 *     summary: Fetch a Place whose Name or Code matches
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Matched against both Name and Code
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   $ref: '#/components/schemas/Place'
 */
router.get('/name/:name', (req, res) => {
  // Get Place by name slug
  const { name } = req.params;

  getPlaceByNameOrCode(name)
    .then((p: any) => {
      respond.success(res, 200, 'Place fetched successfully', p);
    })
    .catch((err: any) => {
      respond.fail(res, 400, 'Error fetching Place', err);
    });
});

/** DELETE PLACE BY ID */
// router.delete('/:id', (req, res) => {
// TODO: COMPLETE!
// });

/**
 * @openapi
 * /places/{id}:
 *   put:
 *     tags: [Places]
 *     summary: Update a Place by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 description: Partial Place fields to update
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 payload:
 *                   $ref: '#/components/schemas/Place'
 */
router.put('/:id', (req, res) => {
  // Update place by id

  const { id } = req.params;
  const { data } = req.body;

  updatePlace(id, data)
    .then((place) => {
      respond.success(res, 200, 'Place updated successfully', place);
    })
    .catch((err) => {
      respond.fail(res, 400, 'Error updating Place', err);
    });
});

/** Update all Models NOT NEEDED FOR NOW! */
// router.put('/work/update-all-models', updateAllModels);

export default router;
