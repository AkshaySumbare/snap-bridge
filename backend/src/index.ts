import http from "node:http";
import { config, validateConfig } from "./config.js";
import { connectMongo, disconnectMongo } from "./db/mongodb.js";
import { connectRedis, disconnectRedis } from "./db/redis.js";
import { initRateLimiters } from "./middleware/rateLimit.js";
import { createApp } from "./app.js";
import { initCloudinary } from "./config/cloudinary.js";

async function startServer() {
  validateConfig();
  initCloudinary();
  await connectMongo();
  await connectRedis();
  await initRateLimiters();

  const app = createApp();
  const httpServer = http.createServer(app);

  httpServer.listen(config.port, () => {
    console.log(`SnapBridge API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    console.log("Shutting down...");
    httpServer.close();
    await disconnectRedis();
    await disconnectMongo();
    console.log("Server shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
