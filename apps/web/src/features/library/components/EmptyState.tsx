/** First-run welcome, shown while the library is empty. */
export function EmptyState({ onChooseFile }: { onChooseFile: () => void }) {
  return (
    <div className="empty-state">
      <h2 className="empty-title">Add your first song</h2>
      <p className="empty-lead">Split any song into instruments, then practice along with just the parts you want.</p>
      <ol className="empty-steps">
        <li>
          <span className="empty-step-number">1</span>
          <span>Drop an audio file anywhere in this window, or paste a YouTube link.</span>
        </li>
        <li>
          <span className="empty-step-number">2</span>
          <span>Stemify separates it into drums, bass, vocals, guitar, piano and other. It takes a minute or two.</span>
        </li>
        <li>
          <span className="empty-step-number">3</span>
          <span>Open it to mute or solo tracks, loop a section, and slow it down without changing the pitch.</span>
        </li>
      </ol>
      <button className="btn btn-primary" onClick={onChooseFile}>
        Choose a file
      </button>
    </div>
  );
}
