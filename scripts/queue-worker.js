#!/usr/bin/env node
// Simple queue worker that polls the application endpoint to process jobs.
// Run this as a separate process in production (PM2, systemd, Docker, Cloud Run, etc.)

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const API_BASE = process.env.WORKER_API_URL || 'http://localhost:3000';
const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10);

async function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function loop() {
  console.log('[queue-worker] Starting worker, polling', API_BASE + '/api/queue-handler');
  while (true) {
    try {
      const res = await fetch(API_BASE + '/api/queue-handler', { method: 'POST' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        console.log('[queue-worker] Processed:', data && data.jobId ? data.jobId : 'response', res.status);
      } else if (res.status === 204) {
        // no job in queue
        // console.log('[queue-worker] No jobs in queue');
      } else {
        console.warn('[queue-worker] Handler returned status', res.status);
      }
    } catch (err) {
      console.error('[queue-worker] Error calling /api/queue-handler:', err.message || err);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

loop().catch((err) => {
  console.error('[queue-worker] Fatal error:', err);
  process.exit(1);
});
