/** A human-readable message for anything caught in a `catch`. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
