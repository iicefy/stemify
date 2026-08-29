import { useState } from "react";
import { Library } from "./components/Library";
import { Player } from "./components/Player";

export default function App() {
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);

  if (selectedSongId) {
    return <Player songId={selectedSongId} onBack={() => setSelectedSongId(null)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Stemify</h1>
      </header>
      <Library onSelectSong={setSelectedSongId} />
    </div>
  );
}
