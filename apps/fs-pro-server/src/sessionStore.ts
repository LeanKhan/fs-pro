import session from 'express-session';
import mStore from 'connect-mongodb-session';

/**
 * Extracted out of server.ts so controllers/user/* and middleware/user.ts
 * can use the session store without importing server.ts itself.
 *
 * That import used to be `import { store } from '../../server'`, which is a
 * circular dependency: db/mongodb.ts imports controllers/user/user.model.ts,
 * which imported server.ts, which imports the db layer. Harmless when
 * server.ts is the process entry point (Node just hands back its
 * still-in-progress exports when the cycle loops back to it), but a real bug
 * anywhere else it gets required first - e.g. a worker_thread whose entry
 * point is NOT server.ts ends up loading server.ts fresh from scratch
 * mid-cycle, which then re-enters the db layer while IT is still loading too.
 *
 * The Mongo URL lookup below intentionally does not import from ./db - doing
 * so would just recreate the same cycle one hop later.
 */
const mongoUrl = process.env.DEV_TEST?.trim()
  ? (process.env.DEV_MONGO_URL?.trim() as string)
  : (process.env.PROD_MONGO_URL?.trim() as string);

const MongoStore = mStore(session);

export const store = new MongoStore(
  {
    uri: mongoUrl,
    collection: 'Sessions',
  },
  (err: any) => {
    if (err) {
      console.error(`Error connecting Store to MongoDB => ${err}`);
    }
  }
);
