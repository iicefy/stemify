import { Library } from "./features/library/Library";
import { Player } from "./features/player/Player";
import { ToastProvider } from "./components/ToastProvider";
import { navigate, useRoute } from "./router";

const openSong = (songId: string) => navigate({ page: "song", songId });
const openLibrary = () => navigate({ page: "library" });

export default function App() {
  const route = useRoute();

  return (
    <ToastProvider>
      {route.page === "song" ? (
        // Keyed so switching songs always starts from a fresh player.
        <Player key={route.songId} songId={route.songId} onBack={openLibrary} />
      ) : (
        <div className="app">
          <header className="app-header">
            <img className="app-logo" src="/icon.png" alt="" width={40} height={40} />
            <h1>Stemify</h1>
          </header>
          <Library onSelectSong={openSong} />
        </div>
      )}
    </ToastProvider>
  );
}
