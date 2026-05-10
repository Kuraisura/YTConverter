import { NextRequest, NextResponse } from 'next/server';
import { getJob, cleanupJobFile } from '@/lib/queue';
import { deleteObjectFromR2 } from '@/lib/r2-storage';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
    }

    const job = await getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return NextResponse.json({ error: 'Job is not completed' }, { status: 400 });
    }

    const key = `conversions/${jobId}/result.${job.isPlaylist ? 'zip' : job.format}`;

    try {
      await deleteObjectFromR2(key);
      await cleanupJobFile(jobId);

      return NextResponse.json({ message: 'Storage cleaned up successfully' }, { status: 200 });
    } catch (error) {
      console.error('Cleanup error:', error);
      return NextResponse.json({ error: 'Failed to delete storage file' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error in /api/cleanup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
