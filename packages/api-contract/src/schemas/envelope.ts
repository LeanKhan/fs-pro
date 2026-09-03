import { z } from 'zod';

export const successEnvelope = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    payload,
  });

export const failEnvelope = <T extends z.ZodTypeAny = z.ZodOptional<z.ZodUnknown>>(
  payload?: T
) =>
  z.object({
    success: z.literal(false),
    message: z.string(),
    payload: (payload ?? z.unknown().optional()) as T extends undefined
      ? z.ZodOptional<z.ZodUnknown>
      : T,
  });
