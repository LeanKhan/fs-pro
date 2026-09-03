import { z } from 'zod';

export const DbStatusSchema = z.object({
  backend: z.string(),
});

export type DbStatus = z.infer<typeof DbStatusSchema>;
