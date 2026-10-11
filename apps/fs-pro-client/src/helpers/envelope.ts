/**
 * The server's response envelope (`{ success, message, payload }`) readers.
 *
 * ts-rest surfaces the envelope as `{ status, body }`; every new Track A surface
 * needs to either unwrap the payload or treat a failure as a soft null (so the
 * panel shows a friendly message instead of throwing). Pure; no Vue, no network.
 */

interface EnvelopeBody {
  success?: boolean;
  message?: string;
  payload?: unknown;
}

function bodyOf(res: { status: number; body: unknown }): EnvelopeBody | null {
  const body = res.body;
  return typeof body === 'object' && body !== null
    ? (body as EnvelopeBody)
    : null;
}

/** Whether the response is a success envelope. */
export function isOk(res: { status: number; body: unknown }): boolean {
  const body = bodyOf(res);
  return res.status >= 200 && res.status < 300 && body?.success !== false;
}

/**
 * Unwrap the payload, throwing the server's message on failure. Use for writes
 * where the caller needs the error text (toasts, refusal reasons).
 */
export function unwrapPayload<T>(res: { status: number; body: unknown }): T {
  const body = bodyOf(res);
  if (isOk(res)) return body?.payload as T;
  throw new Error(body?.message || `Request failed (${res.status})`);
}

/**
 * Unwrap the payload, or `null` on any failure. Use for reads where a missing
 * payload is a normal state (a club not yet signed up, no association, …).
 */
export function payloadOrNull<T>(res: {
  status: number;
  body: unknown;
}): T | null {
  const body = bodyOf(res);
  if (!isOk(res)) return null;
  return (body?.payload as T) ?? null;
}
