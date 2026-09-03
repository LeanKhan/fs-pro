import { z } from 'zod';

export const ClubSchema = z.object({
  _id: z.string().optional(),
  Name: z.string(),
  ClubCode: z.string().optional(),
  ShortName: z.string().nullable().optional(),
  assets: z
    .object({
      Kit: z.string().optional(),
      Logo: z.string().optional(),
      Stadium: z.string().optional(),
    })
    .optional(),
}).passthrough();

export type Club = z.infer<typeof ClubSchema>;
