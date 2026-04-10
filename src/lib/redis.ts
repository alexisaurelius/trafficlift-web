import IORedis from "ioredis";

let redisSingleton: IORedis | null = null;

export function getRedisConnection() {
  if (redisSingleton) {
    return redisSingleton;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL is required for queued audit processing.");
  }

  redisSingleton = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  return redisSingleton;
}
