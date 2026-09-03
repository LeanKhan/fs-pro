import { z } from 'zod';
import { ClubSchema } from './club';

// Deliberately excludes Password and Session - both are real IUser fields,
// but neither should ever cross the wire to the client (defense in depth;
// the client has never read either from a response even though the server
// used to send Password back verbatim - see user.router.ts's `fail()`-free
// server-side stripping now applied on every response).
//
// `Clubs` genuinely has two different shapes depending on route:
// GET /:id?populate=true returns full Club objects (via a live
// Clubs.User reverse lookup), while login/join return bare club ids
// (`clubs.map(c => c._id)`) - modeled as a union rather than picking one.
export const UserSchema = z.object({
  _id: z.string().optional(),
  FullName: z.string(),
  Age: z.number().nullable().optional(),
  Username: z.string(),
  Avatar: z.string().nullable().optional(),
  Alerts: z.unknown().nullable().optional(),
  Clubs: z.array(z.union([z.string(), ClubSchema])).optional(),
  isAdmin: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type User = z.infer<typeof UserSchema>;
