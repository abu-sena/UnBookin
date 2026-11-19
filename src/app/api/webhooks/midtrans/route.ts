import { processMidtransNotification } from '@/lib/billing/notifications';

/**
 * POST /api/webhooks/midtrans — Midtrans payment notification (E11-02 AC2).
 * Public by necessity (Midtrans calls it, not a browser session), so the
 * signature check inside `processMidtransNotification` is the only gate. The
 * body is capped at 16 KB, accepts JSON or form-encoded, and every response is
 * `Cache-Control: no-store`.
 */
const MAX_BODY_BYTES = 16 * 1024;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) return null;
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(text: string, contentType: string): unknown {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<Response> {
  const text = await readBoundedBody(request);
  if (text === null) return jsonResponse({ error: 'payloadTooLarge' }, 413);

  const contentType = request.headers.get('content-type') ?? '';
  const body = parseBody(text, contentType);
  const result = await processMidtransNotification(body);
  return jsonResponse({ status: result.status }, result.status);
}