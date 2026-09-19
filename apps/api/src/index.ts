import { startServer } from "./server.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

const { port } = await startServer({ port: PORT });
console.log(`API listening on http://localhost:${port}`);
