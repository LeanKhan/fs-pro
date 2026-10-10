// Associations, Derbies and the shared Association Grounds (docs/coc-mapping/02
// §G): the social parallel economy. Go cores are internal/association.
import { z } from 'zod';

export const AssociationRoleSchema = z.enum(['member', 'elder', 'leader']);

export const AssociationSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string(),
  description: z.string().nullable(),
  level: z.number().int().min(1),
  xp: z.number().int().min(0),
  memberCount: z.number().int().min(0),
  maxMembers: z.number().int().min(1),
});

export const AssociationLoanSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  fromClubId: z.string(),
  toClubId: z.string(),
  dueAt: z.string(),
  returnedAt: z.string().nullable(),
});

export const DerbyPhaseSchema = z.enum(['prep', 'battle', 'complete']);

export const DerbySchema = z.object({
  id: z.string(),
  homeAssocId: z.string(),
  awayAssocId: z.string(),
  phase: DerbyPhaseSchema,
  homeStars: z.number().int().min(0),
  awayStars: z.number().int().min(0),
  homeDestruction: z.number(),
  awayDestruction: z.number(),
  prepStartsAt: z.string(),
  battleStartsAt: z.string(),
  endsAt: z.string(),
  completedAt: z.string().nullable(),
});

export const AssociationGroundsSchema = z.object({
  associationId: z.string(),
  level: z.number().int().min(1),
  capitalGold: z.number(),
  festivalActive: z.boolean(),
  festivalClosesAt: z.string().nullable(),
});

export type Association = z.infer<typeof AssociationSchema>;
export type AssociationLoan = z.infer<typeof AssociationLoanSchema>;
export type Derby = z.infer<typeof DerbySchema>;
export type AssociationGrounds = z.infer<typeof AssociationGroundsSchema>;
