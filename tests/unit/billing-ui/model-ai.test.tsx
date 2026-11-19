import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectManualKey,
  disconnectByok,
  retestByok,
} from '@/lib/byok/actions';
import { ByokSettings } from '@/components/byok/byok-settings';
import type { ByokStatusView } from '@/components/byok/byok-status-card';
import { wrap } from './fixtures';

vi.mock('@/lib/byok/actions', () => ({
  connectManualKey: vi.fn(),
  disconnectByok: vi.fn(),
  retestByok: vi.fn(),
}));

vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description?: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
    ) : null,
}));

const DISCONNECTED: ByokStatusView = {
  connected: false,
  last4: null,
  via: null,
  verifiedAt: null,
};
const OAUTH_CONNECTED: ByokStatusView = {
  connected: true,
  last4: 'abcd',
  via: 'oauth',
  verifiedAt: '2026-11-19T08:00:00.000Z',
};
const MANUAL_CONNECTED: ByokStatusView = {
  connected: true,
  last4: 'wxyz',
  via: 'manual',
  verifiedAt: null,
};

const KEY = 'sk-or-v1-0123456789abcdef';

beforeEach(() => {
  vi.mocked(connectManualKey).mockReset();
  vi.mocked(disconnectByok).mockReset();
  vi.mocked(retestByok).mockReset();
});

afterEach(cleanup);

function renderByok(status: ByokStatusView, result: 'connected' | 'failed' | null = null) {
  return render(wrap(<ByokSettings status={status} result={result} />));
}

describe('Model AI settings', () => {
  it('shows the not-connected state with the OAuth link and manual form', () => {
    renderByok(DISCONNECTED);

    expect(screen.getByText('Belum terhubung')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hubungkan OpenRouter' })).toHaveAttribute(
      'href',
      '/api/byok/start',
    );
    expect(screen.getByLabelText('Kunci API OpenRouter')).toHaveAttribute('type', 'password');
  });

  it('shows a connected key via OAuth with only the last four characters', () => {
    renderByok(OAUTH_CONNECTED);

    expect(screen.getByText('Terhubung · ••••abcd')).toBeInTheDocument();
    expect(screen.getByText('Lewat OpenRouter OAuth')).toBeInTheDocument();
    expect(screen.getByText(/Terakhir diverifikasi/)).toBeInTheDocument();
    expect(screen.queryByText('abcd')).not.toBeInTheDocument();
  });

  it('shows a connected manual key', () => {
    renderByok(MANUAL_CONNECTED);

    expect(screen.getByText('Terhubung · ••••wxyz')).toBeInTheDocument();
    expect(screen.getByText('Kunci manual')).toBeInTheDocument();
    expect(screen.getByText('Belum diverifikasi')).toBeInTheDocument();
  });

  it('shows the OAuth result from the query parameter', () => {
    renderByok(DISCONNECTED, 'failed');

    expect(
      screen.getByText('OpenRouter belum berhasil terhubung. Coba lagi, ya.'),
    ).toBeInTheDocument();
  });

  it('clears the manual key after submit and never renders it', async () => {
    vi.mocked(connectManualKey).mockResolvedValue({
      ok: true,
      data: { last4: 'wxyz', status: 'ok' },
    });
    renderByok(DISCONNECTED);

    const input = screen.getByLabelText('Kunci API OpenRouter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan kunci' }));

    await act(async () => {});

    expect(connectManualKey).toHaveBeenCalledWith({ key: KEY });
    expect(screen.queryByLabelText('Kunci API OpenRouter')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(KEY);
    expect(screen.getByText('Terhubung · ••••wxyz')).toBeInTheDocument();
  });

  it('clears the manual key after a rejected submit', async () => {
    vi.mocked(connectManualKey).mockResolvedValue({ ok: false, error: 'byokKeyRejected' });
    renderByok(DISCONNECTED);

    const input = screen.getByLabelText('Kunci API OpenRouter') as HTMLInputElement;
    fireEvent.change(input, { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan kunci' }));

    await act(async () => {});

    expect(input.value).toBe('');
    expect(screen.getByText('Kunci OpenRouter ditolak. Periksa lagi kuncinya, ya.')).toBeInTheDocument();
  });

  it('asks for confirmation before disconnecting', async () => {
    vi.mocked(disconnectByok).mockResolvedValue({ ok: true });
    renderByok(OAUTH_CONNECTED);

    fireEvent.click(screen.getByRole('button', { name: 'Putuskan' }));
    expect(screen.getByRole('dialog', { name: 'Putuskan koneksi?' })).toBeInTheDocument();
    expect(disconnectByok).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Ya, putuskan' }));
    await act(async () => {});

    expect(disconnectByok).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Belum terhubung')).toBeInTheDocument();
  });

  it('retests the stored key', async () => {
    vi.mocked(retestByok).mockResolvedValue({ ok: true, data: { status: 'ok' } });
    renderByok(OAUTH_CONNECTED);

    fireEvent.click(screen.getByRole('button', { name: 'Uji ulang' }));
    await act(async () => {});

    expect(retestByok).toHaveBeenCalledTimes(1);
  });
});