// localStorage can be unavailable (private mode, blocked site data) or throw
// on write (quota). Everything stored this way is a convenience, so failures
// just fall back to the default.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not critical.
  }
}
