// The Pitch Grid layout document (docs/coc-mapping/03 §1.7, 05 §8): a club's
// stored grids per slot (home defends offline, match is the attacking default,
// derby is used in Association Derbies). The grid shape itself is the shared
// PitchGrid in grid.ts; this module only names the slots and the document.
import { z } from 'zod';

export const LAYOUT_SLOTS = ['home', 'match', 'derby'] as const;

export const LayoutSlotSchema = z.enum(LAYOUT_SLOTS);

export const PitchGridSlotSchema = z.object({
  col: z.number().int(),
  row: z.number().int(),
  playerId: z.string(),
  position: z.enum(['GK', 'DEF', 'MID', 'ATT']),
});

/** A club's layout: exactly 11 slots, at most one per cell (grid.ts validates). */
export const PitchGridDocumentSchema = z.object({
  slots: z.array(PitchGridSlotSchema),
});

/** The full Clubs.Layouts document: one optional grid per slot. Unknown slot
 * keys are refused (matching Go's Layouts JSON codec), so a hand-edited
 * document fails loudly instead of being silently dropped. */
export const LayoutsSchema = z
  .object({
    home: PitchGridDocumentSchema.optional(),
    match: PitchGridDocumentSchema.optional(),
    derby: PitchGridDocumentSchema.optional(),
  })
  .strict();

export type LayoutSlot = z.infer<typeof LayoutSlotSchema>;
export type PitchGridDocument = z.infer<typeof PitchGridDocumentSchema>;
export type Layouts = z.infer<typeof LayoutsSchema>;
