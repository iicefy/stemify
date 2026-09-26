import type { Stem } from "../../../api";
import { TrackIcon } from "./timeline/TrackIcon";
import { trackColor } from "../lib/trackColors";

// A song is always separated into exactly these 6 stems (the fixed
// htdemucs_6s model), so this is what the skeleton shows before the song's
// own stem list has loaded - not a guess, an invariant of the app.
const SKELETON_STEM_COUNT = 6;

/**
 * Placeholder shapes for the topbar tools and track rows while a song is
 * loading. Real info (title, stem names/colors) swaps in the moment it's
 * known instead of waiting for the whole page to be ready - the waveform and
 * playback controls are usually the only things still loading by then.
 */

/** The whole top-right tool cluster (speed, zoom, loop, master volume). */
export function ToolbarSkeleton() {
  return (
    <>
      <span className="skeleton topbar-tool-skeleton speed-control-skeleton" aria-hidden="true" />
      <span className="skeleton topbar-tool-skeleton zoom-control-skeleton" aria-hidden="true" />
      <span className="skeleton topbar-tool-skeleton loop-toggle-skeleton" aria-hidden="true" />
      <span className="topbar-divider" />
      <span className="skeleton topbar-tool-skeleton master-volume-skeleton" aria-hidden="true" />
    </>
  );
}

/**
 * Ruler plus one row per stem. Real stem names/colors show as soon as
 * they're known (usually well before the audio is ready) - only the
 * waveforms and mix controls keep shimmering.
 */
export function TimelineSkeleton({ stems }: { stems: Stem[] | null }) {
  return (
    <div className="daw-main">
      <RulerSkeleton />
      <div className="daw-tracks">
        {stems
          ? stems.map((stem, i) => (
              <TrackRowSkeleton key={stem.id} name={stem.name} color={trackColor(stem.name)} striped={i % 2 === 1} />
            ))
          : Array.from({ length: SKELETON_STEM_COUNT }, (_, i) => <TrackRowSkeleton key={i} striped={i % 2 === 1} />)}
      </div>
    </div>
  );
}

export function TitleSkeleton() {
  return <span className="skeleton skeleton-line daw-title-skeleton" aria-hidden="true" />;
}

export function TransportSkeleton() {
  return (
    <div className="transport" aria-hidden="true">
      <span className="skeleton transport-btn-skeleton" />
      <span className="skeleton transport-btn-skeleton" />
      <span className="skeleton skeleton-line transport-time-skeleton" />
    </div>
  );
}

function RulerSkeleton() {
  return (
    <div className="track-row timeline-ruler" aria-hidden="true">
      <div className="track-header" />
      <div className="track-waveform">
        <span className="skeleton ruler-skeleton" />
      </div>
    </div>
  );
}

/** One stem row while its waveform/mix controls aren't ready yet. Once the
 * song's own stem list is known, pass its real `name`/`color` so only the
 * waveform itself keeps shimmering. */
function TrackRowSkeleton({ name, color, striped }: { name?: string; color?: string; striped: boolean }) {
  return (
    <div className={`track-row ${striped ? "track-row-alt" : ""}`} aria-hidden="true">
      <div className="track-header">
        <div className="track-name-row">
          {name && color ? (
            <>
              <span className="track-icon" style={{ color }}>
                <TrackIcon name={name} />
              </span>
              <span className="track-name">{name}</span>
            </>
          ) : (
            <>
              <span className="skeleton track-icon-skeleton" />
              <span className="skeleton skeleton-line track-name-skeleton" />
            </>
          )}
        </div>
        <div className="track-controls-row">
          <div className="track-buttons">
            <span className="skeleton track-btn-skeleton" />
            <span className="skeleton track-btn-skeleton" />
          </div>
          <span className="skeleton track-volume-skeleton" />
        </div>
      </div>
      <div className="track-waveform">
        <span className="skeleton track-waveform-skeleton" />
      </div>
    </div>
  );
}
