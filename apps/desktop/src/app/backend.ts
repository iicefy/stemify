import type { Server } from "node:http";

export interface Backend {
  /** Where the web UI and API are served, e.g. http://127.0.0.1:53124 */
  origin: string;
  /** True while a song is being separated or queued - updates wait for it. */
  isSeparating(): boolean;
  /** Stops separation work and the HTTP server (on quit). */
  stop(): void;
}

/**
 * Runs the API server inside this process. Call only after
 * configureEnvironment(): the API reads its paths from the environment when
 * it loads, which is why it's imported here rather than at the top.
 */
export async function startBackend(): Promise<Backend> {
  const api = await import("@musicapp/api");
  // Loopback only, on a free port: the app is a private, single-user tool.
  const { server, port }: { server: Server; port: number } = await api.startServer({ port: 0, host: "127.0.0.1" });
  return {
    origin: `http://127.0.0.1:${port}`,
    isSeparating: api.isSeparating,
    stop() {
      api.stopSeparation();
      server.close();
      // Live-update streams stay open indefinitely; don't let them hold the server.
      server.closeAllConnections();
    },
  };
}
