export interface UpdateHooks {
  status(text: string): void;
  /** 0..1, or null while the length is unknown / installing. */
  progress(fraction: number | null): void;
}

export interface ReadyUpdate {
  /** Quits the app and installs; the new version starts by itself. */
  apply(): void;
}

export interface PendingUpdate {
  version: string;
  /** The new version changes something the small update can't (Electron, Python...). */
  requiresInstaller: boolean;
  prepare(hooks: UpdateHooks): Promise<ReadyUpdate>;
}

/** update.json, published with every release (see scripts/make-update.mjs). */
export interface Manifest {
  version: string;
  /** Identifies the parts of the app the small update does NOT replace (see scripts/base-id.mjs). */
  base: string;
  mac?: Record<string, { file: string; sha512: string; size: number }>;
}
