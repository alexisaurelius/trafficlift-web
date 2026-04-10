import { Worker } from "bullmq";
import { runAuditJob } from "@/lib/audit-engine";
import { AUDIT_QUEUE_NAME } from "@/lib/audit-queue";
import { getRedisConnection } from "@/lib/redis";

const concurrency = Number(process.env.AUDIT_WORKER_CONCURRENCY ?? 25);
const rateLimitPerMinute = Number(process.env.AUDIT_WORKER_RATE_LIMIT_PER_MIN ?? 120);

const worker = new Worker(
  AUDIT_QUEUE_NAME,
  async (job) => {
    const { auditId } = job.data as { auditId: string };
    await runAuditJob(auditId);
  },
  {
    connection: getRedisConnection(),
    concurrency,
    limiter: {
      max: rateLimitPerMinute,
      duration: 60_000,
    },
  },
);

worker.on("completed", (job) => {
  console.log(`[audit-worker] completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[audit-worker] failed job ${job?.id}: ${err.message}`);
});

console.log(
  `[audit-worker] started with concurrency=${concurrency}, rateLimitPerMinute=${rateLimitPerMinute}`,
);
