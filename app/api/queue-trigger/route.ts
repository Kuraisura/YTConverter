import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/queue';
import { processNextJobOnce, processJobById } from '@/lib/processor';

const shouldInlineQueueTrigger =
  process.env.NODE_ENV !== 'production' ||
  process.env.ENABLE_INLINE_QUEUE_TRIGGER === 'true';

// Lightweight endpoint: returns 202 Accepted immediately.
// In production this should only acknowledge the job and let a separate worker
// or cron-driven process handle conversion. In development, inline queue
// processing helps avoid requiring an external worker process.

export async function POST(request: NextRequest) {
  try {
    let jobId: string | undefined;

    // Optional: accept job hint in body (not required)
    try {
      const body = await request.json().catch(() => ({}));
      if (body && typeof body.jobId === 'string') {
        jobId = body.jobId;
        console.log('[queue-trigger] Trigger received for job:', jobId);
      }
    } catch {}

    if (jobId) {
      const job = await getJob(jobId);
      if (job) {
        console.log('[queue-trigger] Job acknowledged and left in queue for worker processing:', jobId);
      } else {
        console.warn('[queue-trigger] Trigger received for missing job:', jobId);
      }
    }

    if (shouldInlineQueueTrigger) {
      const processorPromise = jobId
        ? processJobById(jobId)
        : processNextJobOnce();

      void processorPromise
        .then((result) => {
          console.log('[queue-trigger] Inline queue processing result:', result);
        })
        .catch((error) => {
          console.error('[queue-trigger] Inline queue processing failed:', error);
        });
    }

    return NextResponse.json({ message: 'Queue processing triggered' }, { status: 202 });
  } catch (err) {
    console.error('[queue-trigger] Error:', err);
    return NextResponse.json({ error: 'Failed to trigger' }, { status: 500 });
  }
}
