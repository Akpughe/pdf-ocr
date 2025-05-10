// import IORedis from "ioredis";
import { Redis } from "ioredis";

import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Get Redis URL from environment or use default
export const redis_url =
  process.env.REDIS_URL! ||
  "redis://default:IHPqwCWRTmReCJlAHVHBfqJNIutHLTkE@junction.proxy.rlwy.net:22103";

// Create a singleton Redis connection
class RedisHandler {
  private static instance: RedisHandler;
  private _connection: Redis;

  private constructor() {
    console.log("Initializing Redis connection with URL:", redis_url);

    this._connection = new Redis(redis_url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      connectTimeout: 10000,
      lazyConnect: true,
    });

    // Add event listeners for connection status
    this._connection.on("error", (error: Error) => {
      console.error("⚠️ Redis Connection Error:", error);
    });

    this._connection.on("connect", () => {
      console.log("🟢 Redis successfully connected to", redis_url);
    });

    this._connection.on("ready", () => {
      console.log("✅ Redis client is ready and accepting commands");
    });

    this._connection.on("reconnecting", () => {
      console.log("🔄 Redis client is reconnecting...");
    });

    this._connection.on("end", () => {
      console.log("🔴 Redis connection ended");
    });
  }

  public static getInstance(): RedisHandler {
    if (!RedisHandler.instance) {
      RedisHandler.instance = new RedisHandler();
    }
    return RedisHandler.instance;
  }

  public get connection(): Redis {
    return this._connection;
  }

  public async disconnect(): Promise<void> {
    await this._connection.quit();
  }
}

// Export a singleton instance
export const redisHandler = RedisHandler.getInstance();
export const redisConnection = redisHandler.connection;
