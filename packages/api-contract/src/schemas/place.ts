import { z } from 'zod';

// Sourced from places.router.ts's own @openapi JSDoc (already accurate,
// written before this contract existed) and verified against real
// GET /places/country data.
export const PlaceSchema = z.object({
  _id: z.string().optional(),
  Fullname: z.string(),
  Name: z.string(),
  Code: z.string(),
  Region: z.string(),
  Type: z.string(),
  Picture: z.string().nullable().optional(),
  entity_id: z.string().nullable().optional(),
  WorldRevision: z.number().nullable().optional(),
  WorldSyncedAt: z.string().nullable().optional(),
  WorldStale: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Place = z.infer<typeof PlaceSchema>;
