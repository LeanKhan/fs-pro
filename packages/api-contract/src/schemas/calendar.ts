import { z } from 'zod';

// The one perpetual timeline shared by the whole game world - a true
// singleton row, not one per real-world year.
export const CalendarSchema = z.object({
  _id: z.string().optional(),
  CurrentDay: z.number(),
  CurrentDate: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Sparse - a row only exists for a day that actually needs one (a real,
// non-match calendar event). Matches live on Fixture.ScheduledDay instead.
export const DaySchema = z
  .object({
    _id: z.string().optional(),
    Index: z.number(),
    Date: z.string(),
    Events: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough();

export type Calendar = z.infer<typeof CalendarSchema>;
export type Day = z.infer<typeof DaySchema>;
