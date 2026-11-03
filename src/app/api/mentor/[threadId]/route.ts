import { runMentorTurn } from '@/lib/mentor/chat';

/**
 * E10-01 AC5: one streaming mentor turn per owned thread. The handler stays
 * thin; `runMentorTurn` owns the Origin, session, body, ownership, rate-limit,
 * quota and SSE flow so it can be tested with mocks.
 */
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<Response> {
  const { threadId } = await params;
  return runMentorTurn(request, threadId);
}
