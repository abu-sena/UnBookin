import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/inngest/client', () => ({ inngest: { send: mocks.send } }));

import {
  sendSourceDeleted,
  sendSourceUploaded,
  SOURCE_DELETED_EVENT,
  SOURCE_UPLOADED_EVENT,
} from '@/inngest/events';

const USER_ID = '8f9e3f1e-5d2a-4c6e-9b4d-1a2b3c4d5e6f';
const SOURCE_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const UNBOOK_ID = 'b2c3d4e5-6a7b-4c8d-9e0f-1a2b3c4d5e6f';

const payload = { sourceId: SOURCE_ID, userId: USER_ID, unbookId: UNBOOK_ID };

function stubEnv(env: Record<string, string | undefined>) {
  vi.stubEnv('NODE_ENV', env.NODE_ENV ?? 'test');
  vi.stubEnv('INNGEST_EVENT_KEY', env.INNGEST_EVENT_KEY);
  vi.stubEnv('INNGEST_DEV', env.INNGEST_DEV);
}

beforeEach(() => {
  mocks.send.mockResolvedValue({ ids: ['evt-1'] });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sendSourceUploaded', () => {
  it('validates the DTO and never sends unknown data', async () => {
    stubEnv({ NODE_ENV: 'production', INNGEST_EVENT_KEY: 'key' });

    await expect(
      sendSourceUploaded({ ...payload, sourceId: 'not-a-uuid' } as typeof payload),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    await expect(
      sendSourceUploaded({ ...payload, text: 'raw source text' } as typeof payload),
    ).rejects.toMatchObject({ code: 'invalidInput' });

    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses to run in production without an event key', async () => {
    stubEnv({ NODE_ENV: 'production', INNGEST_EVENT_KEY: undefined });

    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses local runs without an explicit INNGEST_DEV flag (no silent drops)', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: undefined });

    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends with a stable idempotent id in production', async () => {
    stubEnv({ NODE_ENV: 'production', INNGEST_EVENT_KEY: 'event-key' });

    await sendSourceUploaded(payload);

    expect(mocks.send).toHaveBeenCalledWith({
      name: SOURCE_UPLOADED_EVENT,
      data: payload,
      id: `source-uploaded:${SOURCE_ID}`,
    });
  });

  it('sends locally only with INNGEST_DEV=1', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });

    await sendSourceUploaded(payload);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('honors a distinct explicit event id for retries', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: 'true' });

    await sendSourceUploaded(payload, {
      eventId: `source-uploaded-retry:${UNBOOK_ID}:abc`,
    });

    expect(mocks.send).toHaveBeenCalledWith({
      name: SOURCE_UPLOADED_EVENT,
      data: payload,
      id: `source-uploaded-retry:${UNBOOK_ID}:abc`,
    });
  });

  it('maps send failures to jobsUnavailable without vendor text', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });
    mocks.send.mockRejectedValue(new Error('Inngest API Error: 500 oops'));

    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
  });

  it('treats an empty receipt (ids: []) as jobsUnavailable, never as success', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });
    mocks.send.mockResolvedValue({ ids: [] });

    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('treats a malformed receipt as jobsUnavailable', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });

    mocks.send.mockResolvedValue(undefined);
    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });

    mocks.send.mockResolvedValue({ nope: true });
    await expect(sendSourceDeleted(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });

    mocks.send.mockResolvedValue({ ids: [42, '', null] });
    await expect(sendSourceUploaded(payload)).rejects.toMatchObject({
      code: 'jobsUnavailable',
    });
  });

  it('accepts a real receipt with event ids', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });
    mocks.send.mockResolvedValue({ ids: ['evt-1', 'evt-2'] });

    await expect(sendSourceUploaded(payload)).resolves.toBeUndefined();
  });
});

describe('inngest client dev-mode guard', () => {
  async function importRealClient() {
    vi.resetModules();
    return vi.importActual<typeof import('@/inngest/client')>('@/inngest/client');
  }

  it('stays in production (signature verification) even with INNGEST_DEV=true', async () => {
    stubEnv({ NODE_ENV: 'production', INNGEST_EVENT_KEY: 'key', INNGEST_DEV: 'true' });

    const { inngest } = await importRealClient();
    expect(inngest.mode).toBe('cloud');
  });

  it('never enables dev mode in production without the flag either', async () => {
    stubEnv({ NODE_ENV: 'production', INNGEST_EVENT_KEY: 'key', INNGEST_DEV: undefined });

    const { inngest } = await importRealClient();
    expect(inngest.mode).toBe('cloud');
  });

  it('enables dev mode only for the approved explicit local flag in development', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });

    const { inngest } = await importRealClient();
    expect(inngest.mode).toBe('dev');
  });

  it('keeps dev mode off in development without the flag', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: undefined });

    const { inngest } = await importRealClient();
    expect(inngest.mode).toBe('cloud');
  });
});

describe('sendSourceDeleted', () => {
  it('sends the cancellation event with IDs only', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });

    await sendSourceDeleted(payload);

    expect(mocks.send).toHaveBeenCalledWith({
      name: SOURCE_DELETED_EVENT,
      data: payload,
      id: `source-deleted:${SOURCE_ID}`,
    });
  });

  it('validates the DTO before sending', async () => {
    stubEnv({ NODE_ENV: 'test', INNGEST_DEV: '1' });

    await expect(
      sendSourceDeleted({
        sourceId: SOURCE_ID,
        userId: 'evil',
        unbookId: UNBOOK_ID,
      } as typeof payload),
    ).rejects.toMatchObject({ code: 'invalidInput' });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
