import { NextResponse } from 'next/server';
import { processNextJobOnce } from '@/lib/processor';

export async function POST() {
  try {
    const result = await processNextJobOnce();
    if (result.httpStatus === 204) {
      return NextResponse.json({ message: result.message }, { status: 204 });
    }
    return NextResponse.json(
      { message: result.message, jobId: result.jobId, status: result.status },
      { status: result.httpStatus }
    );
  } catch (error) {
    console.error('Error in /api/queue-handler:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
