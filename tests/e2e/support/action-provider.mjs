#!/usr/bin/env node
/**
 * Local fake OpenRouter provider for the M6 and M7 e2e runs. It speaks enough
 * of the chat-completions API for `runStructuredTask` (JSON) and for mentors
 * (`stream: true`, SSE). It never reads, stores or logs request bodies and
 * never makes an outbound call.
 *
 *   GET  /health                    -> 200 {"ok":true}
 *   GET  /mode                      -> {"mode":"high","requests":n} (loopback only)
 *   POST /mode  {"mode":"..."}                                  (loopback only)
 *   POST /api/v1/chat/completions   -> completion for the current mode
 *
 * M6 modes: low = score 2, high = score 4, fail = provider error (HTTP 500).
 * M7 modes: mentor-cite (streamed answer with citations), mentor-slow (a first
 * delta then a long pause), mentor-silent (a long pause before any token) and
 * mentor-fail (HTTP 500 before any token). The mode endpoint changes this
 * process only; it never touches the database.
 *
 * M8 adds a loopback fake Midtrans Snap/status API and the OpenRouter OAuth
 * exchange. Request bodies are held in memory only as long as an order needs
 * them; chat Authorization tokens are counted, never stored or logged.
 *
 *   POST /midtrans/snap/v1/transactions        -> {token, redirect_url}
 *   GET  /midtrans/pay/<order>                 -> tiny HTML page that redirects
 *   GET  /midtrans/api/v2/<order>/status       -> Midtrans-shaped signed status
 *   GET  /openrouter-auth?callback_url=...     -> redirect back with a fixture code
 *   POST /api/v1/auth/keys                     -> PKCE-checked {key}
 *   GET  /api/v1/key                           -> 200 fixture key, 401 invalid
 *   GET  /debug/auth  (loopback only)          -> auth counters
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

export const PROVIDER_MODES = [
  'low',
  'high',
  'fail',
  'mentor-cite',
  'mentor-slow',
  'mentor-silent',
  'mentor-fail',
  'midtrans-pending',
  'midtrans-settle',
  'midtrans-bad-signature',
];
const MAX_CHAT_BYTES = 1_048_576;
const MAX_MODE_BYTES = 1_024;
const MENTOR_HOLD_MS = 15_000;
const MIDTRANS_SERVER_KEY = process.env.E2E_MIDTRANS_SERVER_KEY ?? 'm8-e2e-midtrans-server-key';
const BYOK_FIXTURE_KEY =
  process.env.E2E_BYOK_FIXTURE_KEY ?? 'sk-or-v1-e2e000000000000000000000000abcd';
const OAUTH_CODE = 'm8-e2e-oauth-code';

const SCORE_BY_MODE = { low: 2, high: 4 };
const FEEDBACK_BY_MODE = {
  low: 'Langkahmu sudah mulai, tetapi belum cukup konkret. Tambahkan contoh nyata dan hasil yang bisa kamu amati.',
  high: 'Kerja yang bagus. Langkahmu konkret, hasilnya jelas, dan kamu menunjukkan bukti penerapan.',
};

export function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function buildCompletion(mode) {
  const qualityScore = SCORE_BY_MODE[mode];
  const content = JSON.stringify({ qualityScore, feedback: FEEDBACK_BY_MODE[mode] });
  return {
    id: `m6-e2e-${mode}`,
    model: 'fixture/m6-e2e-action-feedback',
    choices: [{ message: { role: 'assistant', content } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
  };
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

/** Escape a value placed inside an HTML attribute. */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** Midtrans sends IDR as a decimal string; Snap creation receives a number. */
function grossString(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount}.00` : String(value);
}

/** sha512(order_id + status_code + gross_amount + serverKey). */
function midtransSignature(orderId, statusCode, grossAmount, serverKey) {
  return createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
}

/**
 * Answer split into small deltas. Markers are cut across frames on purpose so
 * the server-side parser must hold partial `[[1` and `<<luar-` sequences.
 */
const MENTOR_CITE_DELTAS = [
  'Pemimpin ',
  'terbaik membangun ',
  'sistem',
  '[[1',
  ']]',
  ', bukan ',
  'panggung',
  '[[2]]',
  '. ',
  '\n\n',
  '<<luar-',
  'sumber>>',
  'Secara umum, ',
  'riset kepemimpinan ',
  'mendukung hal ini.',
  '<</luar',
  '-sumber>>',
];
const MENTOR_SLOW_FIRST = 'Pemimpin terbaik membangun sistem.';

function sseFrame(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sseFinish(response) {
  sseFrame(response, {
    choices: [{ delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 24, completion_tokens: 32, cost: 0 },
  });
  response.write('data: [DONE]\n\n');
  response.end();
}

/** Stream an answer over SSE; every timer is cleared if the client stops. */
function streamMentor(response, mode) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  let timer = null;
  let closed = false;
  const cleanup = () => {
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
  response.on('close', cleanup);
  const write = (payload) => {
    if (closed) return false;
    try {
      sseFrame(response, payload);
      return true;
    } catch {
      cleanup();
      return false;
    }
  };

  if (mode === 'mentor-slow') {
    if (!write({ choices: [{ delta: { content: MENTOR_SLOW_FIRST } }] })) return;
    timer = setTimeout(() => {
      if (closed) return;
      write({ choices: [{ delta: { content: ' Terus berlatih.' } }] });
      sseFinish(response);
      cleanup();
    }, MENTOR_HOLD_MS);
    return;
  }

  if (mode === 'mentor-silent') {
    timer = setTimeout(() => {
      if (closed) return;
      sseFinish(response);
      cleanup();
    }, MENTOR_HOLD_MS);
    return;
  }

  let index = 0;
  const tick = () => {
    if (closed) return;
    if (index >= MENTOR_CITE_DELTAS.length) {
      sseFinish(response);
      cleanup();
      return;
    }
    write({ choices: [{ delta: { content: MENTOR_CITE_DELTAS[index++] } }] });
    timer = setTimeout(tick, 15);
  };
  timer = setTimeout(tick, 10);
}

/** Read at most `limit` bytes; resolves null when the body is too large. */
function readBounded(request, limit) {
  return new Promise((resolveBody) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolveBody(null);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', () => resolveBody(null));
  });
}

export function createProviderServer(initialMode = 'high') {
  const state = {
    mode: initialMode,
    requests: 0,
    /** order_id -> { grossAmount, finish }; in memory only. */
    orders: new Map(),
    /** fixture OAuth code -> S256 challenge; cleared after one exchange. */
    oauthChallenges: new Map(),
    /** Counters only; no Authorization token is ever stored. */
    auth: { byokChats: 0, platformChats: 0, keyChecks: 0 },
  };

  const server = createServer(async (request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    const loopback = isLoopback(request.socket.remoteAddress);

    if (request.method === 'GET' && path === '/health') {
      return send(response, 200, { ok: true });
    }

    if (path === '/mode') {
      if (!loopback) return send(response, 403, { error: 'loopback only' });
      if (request.method === 'GET')
        return send(response, 200, { mode: state.mode, requests: state.requests });
      if (request.method === 'POST') {
        const body = await readBounded(request, MAX_MODE_BYTES);
        if (body === null) return send(response, 413, { error: 'too large' });
        let mode;
        try {
          mode = JSON.parse(body).mode;
        } catch {
          return send(response, 400, { error: 'invalid json' });
        }
        if (!PROVIDER_MODES.includes(mode)) return send(response, 400, { error: 'invalid mode' });
        state.mode = mode;
        return send(response, 200, { mode });
      }
      return send(response, 405, { error: 'method not allowed' });
    }

    const origin = `http://${request.headers.host ?? '127.0.0.1'}`;

    if (request.method === 'POST' && path === '/midtrans/snap/v1/transactions') {
      const expected = `Basic ${Buffer.from(`${MIDTRANS_SERVER_KEY}:`).toString('base64')}`;
      if (request.headers.authorization !== expected) {
        return send(response, 401, { error: 'unauthorized' });
      }
      const body = await readBounded(request, MAX_CHAT_BYTES);
      if (body === null) return send(response, 413, { error: 'too large' });
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        return send(response, 400, { error: 'invalid json' });
      }
      const orderId = payload?.transaction_details?.order_id;
      const grossAmount = payload?.transaction_details?.gross_amount;
      const finish = payload?.callbacks?.finish;
      if (
        typeof orderId !== 'string' ||
        orderId.length === 0 ||
        grossAmount === undefined ||
        typeof finish !== 'string'
      ) {
        return send(response, 400, { error: 'invalid transaction' });
      }
      state.orders.set(orderId, { grossAmount: String(grossAmount), finish });
      return send(response, 200, {
        token: `m8-e2e-${orderId}`,
        redirect_url: `${origin}/midtrans/pay/${encodeURIComponent(orderId)}`,
      });
    }

    const payMatch = /^\/midtrans\/pay\/([^/]+)$/.exec(path);
    if (request.method === 'GET' && payMatch) {
      const orderId = decodeURIComponent(payMatch[1]);
      const order = state.orders.get(orderId);
      if (!order) return send(response, 404, { error: 'unknown order' });
      const target = escapeHtml(order.finish);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(
        `<!doctype html><html><head><meta charset="utf-8">` +
          `<meta http-equiv="refresh" content="0; url=${target}">` +
          `<title>Fake Snap</title></head><body>` +
          `<p>Pembayaran sandbox tiruan. Mengembalikan ke aplikasi…</p>` +
          `<p><a href="${target}">Lanjut</a></p></body></html>`,
      );
      return;
    }

    const statusMatch = /^\/midtrans\/api\/v2\/([^/]+)\/status$/.exec(path);
    if (request.method === 'GET' && statusMatch) {
      const orderId = decodeURIComponent(statusMatch[1]);
      const order = state.orders.get(orderId);
      if (!order) return send(response, 404, { status_code: '404', order_id: orderId });
      const settled =
        state.mode === 'midtrans-settle' || state.mode === 'midtrans-bad-signature';
      const statusCode = settled ? '200' : '201';
      const grossAmount = grossString(order.grossAmount);
      const secret =
        state.mode === 'midtrans-bad-signature' ? `${MIDTRANS_SERVER_KEY}-wrong` : MIDTRANS_SERVER_KEY;
      return send(response, 200, {
        status_code: statusCode,
        status_message: settled ? 'midtrans settlement' : 'midtrans pending',
        transaction_id: `m8-e2e-txn-${orderId}`,
        order_id: orderId,
        gross_amount: grossAmount,
        payment_type: 'bank_transfer',
        transaction_status: settled ? 'settlement' : 'pending',
        fraud_status: settled ? 'accept' : null,
        signature_key: midtransSignature(orderId, statusCode, grossAmount, secret),
      });
    }

    if (request.method === 'GET' && path === '/openrouter-auth') {
      const url = new URL(request.url ?? '/', origin);
      const callbackUrl = url.searchParams.get('callback_url');
      const challenge = url.searchParams.get('code_challenge');
      if (!callbackUrl || !challenge) return send(response, 400, { error: 'invalid_request' });
      state.oauthChallenges.set(OAUTH_CODE, challenge);
      const callback = new URL(callbackUrl);
      callback.searchParams.set('code', OAUTH_CODE);
      response.writeHead(302, { Location: callback.toString(), 'Cache-Control': 'no-store' });
      response.end();
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/auth/keys') {
      const body = await readBounded(request, MAX_MODE_BYTES);
      if (body === null) return send(response, 413, { error: 'too large' });
      let exchange;
      try {
        exchange = JSON.parse(body);
      } catch {
        return send(response, 400, { error: 'invalid json' });
      }
      const challenge = state.oauthChallenges.get(exchange?.code);
      const verifier = exchange?.code_verifier;
      if (!challenge || typeof verifier !== 'string') {
        return send(response, 401, { error: 'invalid_grant' });
      }
      const computed = createHash('sha256').update(verifier, 'ascii').digest('base64url');
      if (computed !== challenge) return send(response, 401, { error: 'invalid_grant' });
      state.oauthChallenges.delete(exchange.code);
      return send(response, 200, { key: BYOK_FIXTURE_KEY });
    }

    if (request.method === 'GET' && path === '/api/v1/key') {
      state.auth.keyChecks += 1;
      const header = request.headers.authorization ?? '';
      const key = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
      if (!key || key.includes('invalid')) return send(response, 401, { error: 'invalid key' });
      return send(response, 200, { data: { label: 'm8-e2e' } });
    }

    if (request.method === 'GET' && path === '/debug/auth') {
      if (!loopback) return send(response, 403, { error: 'loopback only' });
      return send(response, 200, {
        byokChats: state.auth.byokChats,
        platformChats: state.auth.platformChats,
        keyChecks: state.auth.keyChecks,
      });
    }

    if (request.method === 'POST' && path === '/api/v1/chat/completions') {
      const body = await readBounded(request, MAX_CHAT_BYTES);
      if (body === null) return send(response, 413, { error: 'too large' });
      state.requests += 1;
      const header = request.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
      if (token === BYOK_FIXTURE_KEY) state.auth.byokChats += 1;
      else state.auth.platformChats += 1;
      if (state.mode === 'fail' || state.mode === 'mentor-fail')
        return send(response, 500, { error: { message: 'fixture failure' } });

      let streamRequested = false;
      try {
        streamRequested = JSON.parse(body)?.stream === true;
      } catch {
        streamRequested = false;
      }
      if (streamRequested) {
        streamMentor(response, state.mode);
        return;
      }
      // A JSON caller only exists for the M6 tasks; mentor modes never take this path.
      return send(response, 200, buildCompletion(SCORE_BY_MODE[state.mode] ? state.mode : 'high'));
    }

    return send(response, 404, { error: 'not found' });
  });

  return { server, state };
}

function isEntrypoint() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isEntrypoint()) {
  const port = Number(process.env.E2E_PROVIDER_PORT ?? 19346);
  const { server } = createProviderServer('high');
  server.listen(port, '127.0.0.1', () => {
    console.log(`m6 e2e action provider listening on 127.0.0.1:${port}`);
  });
  const stop = () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
