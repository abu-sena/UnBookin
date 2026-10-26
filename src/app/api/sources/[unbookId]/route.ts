import { getCurrentUser } from '@/lib/auth/session';
import { loadSourceProgressForUser } from '@/lib/sources/queries';
import { unbookIdSchema } from '@/lib/sources/schema';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

/**
 * GET /api/sources/[unbookId] — safe processing progress for one owned Unbook
 * (E2-02 AC1 polling). Authentication runs FIRST so an unauthenticated request
 * is a plain 401; an invalid or not-owned id is an indistinguishable 404 (404
 * is reserved for invalid/not-owned/missing rows so the polling UI never
 * misreads a transient outage as deletion). Internal query failures return a
 * safe 503 `processingFailed` that callers keep retrying. The session
 * `requireUser` redirect is never invoked inside a catch and never leaks into
 * this route. Every response is `private, no-store`.
 *
 * No route segment config is exported: with Cache Components, `dynamic` is
 * removed in Next 16 and the auth session access already marks this handler
 * request-time.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ unbookId: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

  const { unbookId } = await params;
  if (!unbookIdSchema.safeParse(unbookId).success) {
    return jsonResponse({ error: 'notFound' }, 404);
  }

  try {
    const progress = await loadSourceProgressForUser(user.id, unbookId);
    if (!progress) return jsonResponse({ error: 'notFound' }, 404);
    return jsonResponse(progress, 200);
  } catch {
    // Never expose driver/vendor detail; a transient internal failure is a
    // retryable 503 with a safe code, never a misleading 404.
    return jsonResponse({ error: 'processingFailed' }, 503);
  }
}
