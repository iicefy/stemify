import { TrackIcon } from "./TrackIcon";

/**
 * Placeholder shapes for the topbar tools and track rows while a song is
 * loading. Real info (title, stem names/colors) swaps in the moment it's
 * known instead of waiting for the whole page to be ready - the waveform and
 * playback controls are usually the only things still loading by then.
 */

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

export function SpeedControlSkeleton() {
  return <span className="skeleton topbar-tool-skeleton speed-control-skeleton" aria-hidden="true" />;
}

export function ZoomControlSkeleton() {
  return <span className="skeleton topbar-tool-skeleton zoom-control-skeleton" aria-hidden="true" />;
}

export function LoopToggleSkeleton() {
  return <span className="skeleton topbar-tool-skeleton loop-toggle-skeleton" aria-hidden="true" />;
}

export function MasterVolumeSkeleton() {
  return <span className="skeleton topbar-tool-skeleton master-volume-skeleton" aria-hidden="true" />;
}

export function RulerSkeleton() {
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
export function TrackRowSkeleton({ name, color, striped }: { name?: string; color?: string; striped: boolean }) {
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
