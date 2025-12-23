// import { Request } from 'express';
import { Server } from 'socket.io';

declare module 'express-serve-static-core' {
  interface Request {
    io?: Server;
  }

  interface Router {
    [key: string]: any;
  }
}

declare module 'express-session' {
  interface SessionData {
    onlineStart?: Date;
    online?: boolean;
    socketID?: string;
    lastOnline?: Date;
  }
}
