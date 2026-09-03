import { z } from 'zod';

/** A boolean query param sent over the wire as the string "true"/"false".
 * NOT `z.coerce.boolean()` - that uses JS's `Boolean(value)` coercion,
 * under which the string "false" is truthy (any non-empty string is), so
 * `?flag=false` would silently mean `true`. Found live while verifying
 * players' `isSigned=false` filter returned unfiltered results. */
export const booleanQuery = () =>
  z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));
