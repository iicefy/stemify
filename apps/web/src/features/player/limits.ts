// Ranges for the player's controls. The sliders use them, and saved settings
// are clamped to them on load, so they must agree.

export const MASTER_VOLUME = { min: 0, max: 1.5, step: 0.01 } as const;
export const TRACK_VOLUME = { min: 0, max: 1, step: 0.01 } as const;
export const PLAYBACK_RATE = { min: 0.5, max: 1.5, step: 0.05 } as const;
