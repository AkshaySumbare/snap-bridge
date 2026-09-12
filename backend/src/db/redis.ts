import { createClient, type RedisClientType } from "redis";
import { config } from "../config.js";

let client: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  if (client?.isOpen) {
    return client;
  }

  client = createClient({
    url: config.redisUrl,
    socket: { connectTimeout: 10_000 },
  });

  client.on("error", (err) => console.error("Redis error:", err.message));
  await client.connect();

  const pong = await client.ping();
  console.log(`Redis connected (${pong})`);
  return client;
}

export function getRedis(): RedisClientType {
  if (!client?.isOpen) {
    throw new Error("Redis is not connected");
  }
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
    client = null;
  }
}
