import * as dotenv from 'dotenv';
dotenv.config();

import express, { Application } from 'express';
import cors from 'cors';
import bodyparser from 'body-parser';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import DB from './db';
import { swaggerSpec } from './docs/swagger';

/** ---- sockets stuff -- */
import assert from 'assert';
import session, { SessionData } from 'express-session';
import cookie from 'cookie';
import path from 'path';

import log from './helpers/logger';
import { store } from './sessionStore';

const app: Application = express();

import { Server } from 'http';

const http = new Server(app);

const port = process.env.PORT || 3000;

import { Server as SocketIOServer, Socket } from 'socket.io';

import App from './controllers/app/App';
import { registerIO } from './realtime/io';
import { createExpressEndpoints } from '@ts-rest/express';
import { apiContract } from '@repo/api-contract';
import { apiRouter } from './routers';

const cors_whitelist = [
  'http://localhost:8080',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5173',
  'http://' + (process.env.REMOTE_HOST!.trim() || 'localhost') + ':8080',
  'http://' + (process.env.REMOTE_HOST!.trim() || 'localhost') + ':5173',
];

const io = new SocketIOServer(http, {
  cors: {
    origin: process.env.NODE_ENV?.trim() === 'dev' ? true : cors_whitelist,
    credentials: true,
  },
});
registerIO(io);

app.use(
  cors({
    // Same dev-only relaxation already applied to the Socket.IO CORS config
    // above - lets a standalone debug page (PitchPreview.html, opened from
    // an arbitrary origin) call the REST API directly in dev.
    origin: process.env.NODE_ENV?.trim() === 'dev' ? true : cors_whitelist,
    credentials: true,
  })
);

// Add morgan request logging in development mode
if (process.env.NODE_ENV?.trim() === 'dev') {
  app.use(morgan('dev'));
}

const Session = session({
  name: 'fspro.sid',
  secret: 'thisisasecret:)',
  cookie: {
    maxAge: 60000 * 60 * 24 * 30,
    httpOnly: true,
  },
  store,
  saveUninitialized: false,
  resave: false,
});

// Catch errors
store.on('error', (error) => {
  assert.ifError(error);
  assert.ok(false);
});

// Use Sessions o
app.use(Session);

// Share Express session with Socket.IO v4 engine requests.
io.engine.use(Session);

DB.start();

app.use(bodyparser.json());
app.use(bodyparser.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../assets')));

// MongoDB Database Connection

app.get('/', (req, res) => {
  res.status(200).send('<p>Welcome to FS-PRO <i>Server</i></p> enjoy!');
});

// REST API docs + tester - see src/docs/swagger.ts. Includes a runtime
// database-backend switch (POST /api/meta/db/backend) for comparing Mongo
// vs Postgres/Drizzle behavior without restarting the process.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// Import routers after DB is started to avoid circular dependency issues
const routerModule = require('./routers');
const router = routerModule.default || routerModule;
app.use('/api', router);

createExpressEndpoints(apiContract, routerModule.apiRouter, router);

// Attach socket
app.use((req, res, next) => {
  req.io = io;
  next();
});

//  ==== THE GAME CLASS GAN GAN! EVERYTHING ABOUT THE GAME STARTS HERE! == //
App.create();
//  ==== THE GAME CLASS GAN GAN! EVERYTHING ABOUT THE GAME STARTS HERE! == //

/**
 * `ts-node-dev --respawn` kills the old process (`child.kill('SIGTERM')`)
 * and only forks the new one once that child's `exit` event fires - so this
 * isn't a same-process-tree race. On Windows specifically, `SIGTERM` sent to
 * a forked Node child doesn't reliably deliver a catchable signal (it just
 * force-terminates), so a graceful in-app shutdown handler never gets the
 * chance to run - and even where it does run, the OS can take a beat longer
 * than the child's `exit` event to actually release the listening socket.
 * Either way, the very next restart's `listen()` can land in that gap and
 * throw EADDRINUSE. Retrying briefly on that specific error - instead of
 * crashing - rides out the gap without masking a real "something else is
 * using this port" failure (which still fails loudly once the retries run
 * out).
 */
let listenRetriesLeft = 10;

http.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE' || listenRetriesLeft <= 0) {
    throw err;
  }

  listenRetriesLeft -= 1;
  console.log(
    `Port ${port} still in use (previous dev-server instance likely still shutting down) - retrying in 300ms...`
  );
  setTimeout(() => http.listen(port), 300);
});

http.listen(port, () => {
  console.log('Game Server running successfully! on port ' + port);
});

/**
 * Graceful shutdown for environments where SIGTERM/SIGINT actually reach
 * this handler (every real deploy target - Docker, PM2, Linux/Mac dev) -
 * closes the HTTP server and DB pool deterministically instead of relying
 * on a hard kill. Doesn't help the Windows ts-node-dev-restart race above
 * (that's the retry loop's job), but is the correct behavior everywhere
 * signals do work.
 */
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully...`);
  http.close(() => {
    void DB.disconnect().finally(() => process.exit(0));
  });
  // Belt-and-suspenders: if something (an open socket, a stuck query) keeps
  // the server from closing cleanly, don't hang the restart forever.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

io.use((socket: Socket, next: (err?: Error) => void) => {
  const socketRequest = socket.request as typeof socket.request & {
    sessionID?: string;
    session?: SessionData & { save: (callback: (err?: Error) => void) => void };
  };
  const sessionID = socketRequest.sessionID;

  if (socket.request.headers.cookie) {
    const cookies = cookie.parse(socket.request.headers.cookie);
    if (cookies['fspro.sid'] && sessionID) {
      store.get(sessionID, (err: any, sess: SessionData | null | undefined) => {
        if (!err) {
          if (sess) {
            if (process.env.NODE_ENV!.trim() === 'dev') {
              console.log('Client authenticated successfully!');
            }
            log('Cookie found');
            next();
          } else {
            if (process.env.NODE_ENV!.trim() === 'dev') {
              console.log('Invalid Cookie!');
            }
            log('Invalid cookie');
            next(new Error('Cookie is expired!'));
          }
        } else {
          next(err);
        }
      });
    } else {
      // delete session :)
      if (sessionID) {
        store.destroy(sessionID);
      }
      console.log('No cookie sent man, destroying session :)');
      next(new Error('Not authorized man!'));
    }
  } else {
    log('hi there :p');
    next(new Error('Not authorized man!'));
  }
});

// app.use('', (req, res) =>{
//   req.io = io;
// })

// Anytime there is a (re)connection save the socketID to the session
// You could actually also save the User id... then map the id to the current socket id.

io.on('connection', (socket: Socket) => {
  // let sessionID = socket.handshake.session.id;
  const socketRequest = socket.request as typeof socket.request & {
    sessionID?: string;
    session: SessionData & { save: (callback: (err?: Error) => void) => void };
  };
  const socketSession = socketRequest.session;

  console.log(`Client connected successfully! => ${socket.id}`);

  socketSession.onlineStart = new Date();
  socketSession.online = true;
  socketSession.socketID = socket.id;

  socketSession.save((err?: Error) => {
    if (err) {
      console.log(`Errror in saving session! => ${err}`);
      console.error(`Error in saving session! => ${err}`);
    } else {
      console.log('Session updated :)');
    }
  });

  socket.on('disconnect', () => {
    socketSession.lastOnline = new Date();
    socketSession.online = false;

    socketSession.save((err?: Error) => {
      if (err) {
        console.log(`Error in saving session! => ${err}`);
        console.error(`Error in saving session! => ${err}`);
      }
    });
    console.info(
      `Disconnected client session => ${socketRequest.sessionID || 'unknown'}`
    );
  });

  socket.on('authenticate', () => {
    console.log('yeet');
  });
});

export { store, io };
