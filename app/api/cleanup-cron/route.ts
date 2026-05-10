import { NextRequest, NextResponse } from 'next/server';
import { processPendingCleanups, getPendingCleanups, getFailedCleanups } from '@/lib/cleanup-scheduler';

// This endpoint processes pending cleanup tasks
// Triggered by Cloudflare Cron, cron-job.org, or other external cron services
// Check CLEANUP_SETUP.md for configuration details
export async function GET(request: NextRequest) {
  try {
    // Optional: Check for authorization header to prevent unauthorized triggers
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CLEANUP_CRON_TOKEN || 'change-this-token';

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { processed, failed } = await processPendingCleanups();

    return NextResponse.json(
      {
        success: true,
        message: `Processed ${processed} cleanup tasks, ${failed} failed`,
        processed,
        failed,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Cleanup Cron] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual trigger (testing/admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CLEANUP_CRON_TOKEN || 'change-this-token';

    if (authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = (body as any).action || 'process';

    if (action === 'process') {
      const { processed, failed } = await processPendingCleanups();
      return NextResponse.json(
        { success: true, processed, failed },
        { status: 200 }
      );
    }

    if (action === 'pending') {
      const tasks = await getPendingCleanups();
      return NextResponse.json(
        { success: true, count: tasks.length, tasks },
        { status: 200 }
      );
    }

    if (action === 'failed') {
      const tasks = await getFailedCleanups();
      return NextResponse.json(
        { success: true, count: tasks.length, tasks },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Cleanup Cron POST] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
