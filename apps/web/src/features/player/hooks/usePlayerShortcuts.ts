import { useEffect, useRef } from "react";
import type { Stem } from "../../../api";
import type { PlaybackEngineApi } from "./usePlaybackEngine";

const SEEK_STEP_SECONDS = 5;
const SEEK_STEP_LARGE_SECONDS = 15;

/** Range sliders are <input> too - excluded along with real text fields, since arrow keys already mean something there. */
function isTypingTarget(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable
  );
}

/**
 * Player keyboard shortcuts:
 *   Space play/pause · S stop · R restart · L loop on/off
 *   ←/→ seek 5s (Shift: 15s) · ↑/+ zoom in · ↓/- zoom out
 *   1-9 mute that track (Shift: solo)
 */
export function usePlayerShortcuts(engine: PlaybackEngineApi, stems: Stem[], stepZoom: (delta: number) => void): void {
  // The listener is attached once and reads the latest values through this ref.
  const latest = useRef({ engine, stems, stepZoom });
  latest.current = { engine, stems, stepZoom };

  useEffect(() => {
    function handle(e: KeyboardEvent): boolean {
      const { engine, stems, stepZoom } = latest.current;

      if (e.code === "Space") {
        engine.togglePlay();
        return true;
      }

      // Digit keys pick a track by row (top to bottom). e.code, not e.key:
      // Shift changes the character (Shift+1 is "!") but not the code.
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        const stem = stems[Number(digit[1]) - 1];
        if (!stem) return false;
        if (e.shiftKey) engine.toggleSolo(stem.id);
        else engine.toggleMute(stem.id);
        return true;
      }

      switch (e.key) {
        case "s":
        case "S":
          engine.stop();
          return true;
        // Restart: back to 0 and keep going, unlike Stop (0 and pause) - for
        // immediately replaying a section you just heard.
        case "r":
        case "R":
          engine.seek(0);
          if (!engine.isPlaying) engine.togglePlay();
          return true;
        case "l":
        case "L":
          engine.toggleLoopEnabled();
          return true;
        case "ArrowLeft":
        case "ArrowRight": {
          const step = e.shiftKey ? SEEK_STEP_LARGE_SECONDS : SEEK_STEP_SECONDS;
          engine.seek(engine.getCurrentTime() + (e.key === "ArrowLeft" ? -step : step));
          return true;
        }
        case "ArrowUp":
        case "+":
        case "=":
          stepZoom(1);
          return true;
        case "ArrowDown":
        case "-":
        case "_":
          stepZoom(-1);
          return true;
        default:
          return false;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // The focused element, not e.target === body: a clicked button keeps
      // focus, and that isn't "typing" - shortcuts should keep working.
      if (isTypingTarget(document.activeElement)) return;
      if (handle(e)) e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
