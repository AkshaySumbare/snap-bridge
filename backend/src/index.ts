import http from "node:http";
import { config } from "./config.js";
import { setupWebSocket } from "./websocket.js";
import { createApp } from "./app.js";

const httpServer = http.createServer();
const io = setupWebSocket(httpServer);
const app = createApp(io);

httpServer.on("request", app);

httpServer.listen(config.port, () => {
  console.log(`SnapBridge API listening on http://localhost:${config.port}`);
});
