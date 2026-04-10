import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";

export const AUDIT_QUEUE_NAME = "audit-jobs";

type AuditJobData = {
  auditId: string;
};

let auditQueueSingleton: Queue<AuditJobData> | null = null;

export function isAuditQueueConfigured() {
  return Boolean(process.env.REDIS_URL);
}

function getAuditQueue() {
  if (auditQueueSingleton) {
    return auditQueueSingleton;
  }

  auditQueueSingleton = new Queue<AuditJobData>(AUDIT_QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: Number(process.env.AUDIT_WORKER_ATTEMPTS ?? 3),
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 60 * 60,
        count: 1000,
      },
      removeOnFail: {
        age: 24 * 60 * 60,
        count: 5000,
      },
    },
  });

  return auditQueueSingleton;
}

export async function enqueueAuditJob(auditId: string) {
  const queue = getAuditQueue();
  await queue.add("run-audit", { auditId }, { jobId: `audit:${auditId}` });
}
