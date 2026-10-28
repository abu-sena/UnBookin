#!/usr/bin/env node
/**
 * Local fake `action_feedback` provider for the M6 e2e run. Speaks just enough
 * of the OpenRouter chat-completions JSON for `runStructuredTask`. It never
 * reads, stores or logs request bodies and never makes an outbound call.
 *
 *   GET  /health                    -> 200 {"ok":true}
 *   GET  /mode                      -> {"mode":"high"}          (loopback only)
 *   POST /mode  {"mode":"low|high|fail"}                        (loopback only)
 *   POST /api/v1/chat/completions   -> completion for the current mode
 *
 * Modes: low = score 2, high = score 4, fail = provider error (HTTP 500).
 * The mode endpoint changes this process only; it never touches the database.
 */
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

export const PROVIDER_MODES = ['low', 'high', 'fail'];
const MAX_CHAT_BYTES = 1_048_576;
const MAX_MODE_BYTES = 1_024;

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
  const state = { mode: initialMode, requests: 0 };

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

    if (request.method === 'POST' && path === '/api/v1/chat/completions') {
      const body = await readBounded(request, MAX_CHAT_BYTES);
      if (body === null) return send(response, 413, { error: 'too large' });
      state.requests += 1;
      if (state.mode === 'fail')
        return send(response, 500, { error: { message: 'fixture failure' } });
      return send(response, 200, buildCompletion(state.mode));
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
