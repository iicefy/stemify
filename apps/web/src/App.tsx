import { useState } from "react";
import { Library } from "./components/Library";
import { Player } from "./components/Player";
import { ToastProvider } from "./components/ToastProvider";

export default function App() {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  return (
    <ToastProvider>
      {selectedSongId ? (
        <Player songId={selectedSongId} onBack={() => setSelectedSongId(null)} />
      ) : (
        <div className="app">
          <header className="app-header">
            <img className="app-logo" src="/icon.png" alt="" width={40} height={40} />
            <h1>Stemify</h1>
          </header>
          <Library onSelectSong={setSelectedSongId} />
        </div>
      )}
    </ToastProvider>
  );
}
