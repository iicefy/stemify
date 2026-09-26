import type { ApiError } from "@musicapp/shared";

export const SONGS_BASE = "/api/songs";

/**
 * fetch() against the songs API that throws on a non-2xx response, using the
 * API's own `{ error }` message when it sent one (else `fallbackMessage`).
 */
export async function request(path: string, fallbackMessage: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${SONGS_BASE}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new Error(body?.error ?? fallbackMessage);
  }
  return res;
}

export const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
