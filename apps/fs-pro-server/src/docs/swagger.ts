import swaggerJsdoc from 'swagger-jsdoc';

/**
 * Built from `@openapi` JSDoc blocks on route files (see `apis` below), not
 * hand-written - so it grows incrementally as each route gets one. A route
 * with no `@openapi` block simply doesn't appear here yet.
 *
 * `apis` is resolved relative to `apps/fs-pro-server` (wherever the process
 * is started from) and reads the `.ts` source directly via `swagger-jsdoc`'s
 * own glob+parse step - this only works when the source `.ts` files are
 * present alongside the running process (true in dev via ts-node-dev). If
 * this is ever run from a compiled `dist/` build with no source files
 * shipped, point `apis` at the compiled `.js` output instead.
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FS Pro API',
      version: '1.0.0',
      description:
        'REST API docs for the FS Pro server, generated from JSDoc annotations on route files. ' +
        'Postgres (via Drizzle) is the only backend - see `GET /meta/db` for a trivial health check.',
    },
    servers: [
      {
        url: '/api',
        description: 'Relative to wherever the server is running',
      },
    ],
    tags: [
      { name: 'Meta', description: 'Server/DB health check' },
      {
        name: 'Places',
        description:
          'Countries/regions/cities reference data - see repositories/drizzle/PlaceRepository.ts',
      },
    ],
  },
  apis: ['./src/controllers/**/*.router.ts', './src/controllers/meta/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
