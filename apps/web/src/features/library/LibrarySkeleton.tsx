/** Placeholder rows while the song list loads for the first time. */
export function LibrarySkeleton() {
  return (
    <ul className="song-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="song-row song-row-skeleton">
          <span className="song-avatar skeleton" />
          <div className="song-info">
            <span className="skeleton skeleton-line" style={{ width: `${70 - i * 12}%` }} />
            <span className="skeleton skeleton-line skeleton-line-short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
