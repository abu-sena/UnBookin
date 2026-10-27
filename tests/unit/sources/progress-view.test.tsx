import type { SourceProgress } from '@/lib/sources/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  // A stable router object: the poller effect depends on `router`, so a new
  // object per render would remount the poll loop on every state update.
  const router = {
    replace,
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
  return {
    router,
    replace,
    fetch: vi.fn(),
    actions: {
      retrySourceProcessing: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/lib/sources/actions', () => mocks.actions);

import { SourceProcessingView } from '@/components/sources/source-processing-view';

// Direct `act` calls from 'react' flush synchronously only with this flag;
// the repo's vitest setup does not set it for us.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy = messages.sources.progress;
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const POLL_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 10_000;

function progressPayload(overrides: Partial<SourceProgress> = {}): SourceProgress {
  return {
    unbookId: UNBOOK_ID,
    title: 'Buku Produk',
    sourceId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    sourceStatus: 'ready',
    unbookStatus: 'queued',
    stage: 'embedding',
    progressPct: 40,
    embeddedChunks: 3,
    totalChunks: 5,
    errorCode: null,
    ...overrides,
  };
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

function flush() {
  return act(async () => {
    await Promise.resolve();
  });
}

function renderView(initial: SourceProgress) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <SourceProcessingView initialProgress={initial} />
    </NextIntlClientProvider>,
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SourceProcessingView poller', () => {
  it('does not poll for an already-ingested handoff', async () => {
    renderView(progressPayload({ stage: 'ingested', progressPct: 100 }));

    await flush();
    await advance(POLL_INTERVAL_MS * 3);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(copy.ingested)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.ingestedAction })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('polls a real GET to ingested, shows the counts and stops', async () => {
    mocks.fetch
      .mockImplementationOnce(async () =>
        jsonResponse(progressPayload({ embeddedChunks: 3, totalChunks: 5, progressPct: 40 })),
      )
      .mockImplementationOnce(async () =>
        jsonResponse(
          progressPayload({
            stage: 'ingested',
            embeddedChunks: 5,
            totalChunks: 5,
            progressPct: 100,
          }),
        ),
      );
    renderView(progressPayload());

    await flush();
    expect(
      screen.getByText(copy.chunks.replace('{embedded}', '3').replace('{total}', '5')),
    ).toBeInTheDocument();

    await advance(POLL_INTERVAL_MS);
    expect(screen.getByText(copy.ingested)).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(new URL(mocks.fetch.mock.calls[0]?.[0] as string, 'http://localhost').pathname).toBe(
      `/api/sources/${UNBOOK_ID}`,
    );

    // A terminal confirmed status stops the loop entirely.
    await advance(POLL_INTERVAL_MS * 3);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('times out a hanging request without overlap, then recovers with a fresh request', async () => {
    const hanging = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );
    const recovered = vi.fn(async (_url: string, init: { signal: AbortSignal }) => {
      expect(init.signal.aborted).toBe(false);
      return jsonResponse(progressPayload({ embeddedChunks: 4, totalChunks: 5, progressPct: 80 }));
    });
    mocks.fetch.mockImplementationOnce(hanging).mockImplementationOnce(recovered);
    renderView(progressPayload());

    await flush();
    expect(hanging).toHaveBeenCalledTimes(1);

    // While the first request hangs, no second one may start.
    await advance(REQUEST_TIMEOUT_MS - 100);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    // The 10s deadline aborts the hanging request; the failed flag shows.
    await advance(100);
    await flush();
    expect(screen.getByText(copy.connection.error)).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    // The next tick uses a brand-new, non-aborted controller and recovers.
    await advance(POLL_INTERVAL_MS);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);

    await flush();
    expect(screen.queryByText(copy.connection.error)).not.toBeInTheDocument();
    expect(
      screen.getByText(copy.chunks.replace('{embedded}', '4').replace('{total}', '5')),
    ).toBeInTheDocument();
  });

  it('ignores a body that resolves after unmount: no second request, no timer', async () => {
    let resolveJson!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          resolveJson = resolve;
        }),
    }));
    const view = renderView(progressPayload());
    await flush();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    view.unmount();
    await flush();
    resolveJson(progressPayload({ stage: 'ready', unbookStatus: 'ready', progressPct: 100 }));
    await flush();
    await advance(POLL_INTERVAL_MS * 3);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('shows a safe copy when the retry action rejects, never the raw error', async () => {
    const rawError = new Error('RAW_SENTINEL vendor stack must not leak');
    mocks.actions.retrySourceProcessing.mockRejectedValueOnce(rawError);
    renderView(progressPayload({ unbookStatus: 'failed', stage: 'failed' }));

    expect(screen.getByText(copy.failedFallback)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: copy.retry.action }));
    await flush();
    await flush();

    expect(screen.getByText(copy.errors.processingFailed)).toBeInTheDocument();
    expect(screen.queryByText(/RAW_SENTINEL/)).not.toBeInTheDocument();
    // The failed state is retained and the poll loop stays stopped.
    expect(screen.getByText(copy.failedFallback)).toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    // After the failure the retry stays available for another attempt.
    expect(screen.getByRole('button', { name: copy.retry.action })).toBeEnabled();
  });

  it('queues an accepted retry behind an actual GET and suppresses duplicates', async () => {
    mocks.actions.retrySourceProcessing.mockResolvedValueOnce({
      ok: true,
      data: { unbookId: UNBOOK_ID },
    });
    mocks.fetch.mockImplementationOnce(async () =>
      jsonResponse(progressPayload({ unbookStatus: 'ready', stage: 'ready', progressPct: 100 })),
    );
    renderView(progressPayload({ unbookStatus: 'failed', stage: 'failed' }));

    fireEvent.click(screen.getByRole('button', { name: copy.retry.action }));
    await flush();
    await flush();

    expect(mocks.actions.retrySourceProcessing).toHaveBeenCalledTimes(1);
    expect(mocks.actions.retrySourceProcessing).toHaveBeenCalledWith({ unbookId: UNBOOK_ID });
    // Acceptance restarts polling so a real GET confirms the fresh status.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText(copy.ready)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.retry.action })).not.toBeInTheDocument();

    await advance(POLL_INTERVAL_MS * 3);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
});
