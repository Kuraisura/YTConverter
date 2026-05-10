#!/usr/bin/env node
// Simple queue worker that polls the application endpoint to process jobs.
// Run this as a separate process in production (PM2, systemd, Docker, Cloud Run, etc.)

const fetch = globalThis.fetch;

const API_BASE = process.env.WORKER_API_URL || `http://127.0.0.1:${process.env.PORT || '10000'}`;
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10);
const WORKER_CONCURRENCY = Math.max(1, Math.min(8, parseInt(process.env.WORKER_CONCURRENCY || '2', 10) || 2));
const WORKER_DISABLED = process.env.DISABLE_QUEUE_WORKER === 'true';
let consecutiveFailures = 0;
let failureNoticeShown = false;

async function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= 3 && !failureNoticeShown) {
    console.error('[queue-worker] Please try again later.');
    failureNoticeShown = true;
  }
}

function recordSuccess() {
  consecutiveFailures = 0;
  failureNoticeShown = false;
}

async function loop(workerNumber) {
  if (WORKER_DISABLED) {
    console.log('[queue-worker] Disabled by DISABLE_QUEUE_WORKER=true; jobs will remain queued for an external worker.');
    // Stay alive so process supervisors do not continuously restart this process.
    await new Promise(() => setInterval(() => {}, 60 * 60 * 1000));
  }

  console.log(`[queue-worker] Worker ${workerNumber} ready`);
  while (true) {
    try {
      const res = await fetch(API_BASE + '/api/queue-handler', { method: 'POST' });
      if (res.status === 204) {
        // No job is currently queued.
        recordSuccess();
      } else if (res.ok) {
        recordSuccess();
        const data = await res.json().catch(() => null);
        console.log('[queue-worker] Processed:', data && data.jobId ? data.jobId : 'response', res.status);
      } else {
        recordFailure();
      }
    } catch {
      recordFailure();
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

Promise.all(Array.from({ length: WORKER_CONCURRENCY }, (_, index) => loop(index + 1))).catch(() => {
  console.error('[queue-worker] Please try again later.');
  process.exit(1);
});
