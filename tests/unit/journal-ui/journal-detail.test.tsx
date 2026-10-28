import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';

const mocks = vi.hoisted(() => ({
  reportAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('@/lib/journal/actions', () => ({ reportAction: mocks.reportAction }));

import { JournalDetail } from '@/components/journal/journal-detail';
import type { JournalActionView } from '@/components/journal/view-types';
import { makeAction, makeReport, nowIso } from './fixtures';

const copy = messages.journal;
const form = copy.form;
const validWhat =
  'Saya menulis tiga rutinitas tim, menetapkan pemilik, dan menentukan cara mengukur hasil setiap minggu.';
const validResult = 'Tim menjalankan rutinitas selama lima hari tanpa saya ingatkan.';

function mount(action: JournalActionView) {
  const { container } = render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <JournalDetail action={action} nowIso={nowIso} />
    </NextIntlClientProvider>,
  );
  return container;
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(form.whatLabel), { target: { value: validWhat } });
  fireEvent.change(screen.getByLabelText(form.resultLabel), { target: { value: validResult } });
  fireEvent.change(screen.getByLabelText(form.reflectionLabel), {
    target: { value: 'Saya akan menetapkan pemeriksaan mingguan yang lebih jelas.' },
  });
  fireEvent.change(screen.getByLabelText(form.evidenceLabel), {
    target: { value: 'https://example.com/bukti' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(cleanup);

describe('JournalDetail history', () => {
  it('renders persisted reports safely with an external noopener evidence link', () => {
    const injection = '<script>alert("x")</script>';
    const report = makeReport({
      whatIDid: `${injection} Saya mencoba menerapkan langkahnya.`,
      result: 'Hasilnya <b>lebih jelas</b>.',
      aiFeedback: '<img src=x onerror=alert(1)> Umpan balik.',
      qualityScore: 4,
      verified: true,
      evidenceUrl: 'https://example.com/bukti-panjang',
    });
    const action = makeAction({
      status: 'done',
      canReport: false,
      reports: [report],
    });

    const container = mount(action);

    expect(screen.getByText(copy.detail.reportsTitle)).toBeInTheDocument();
    expect(
      screen.getByText(`${injection} Saya mencoba menerapkan langkahnya.`),
    ).toBeInTheDocument();
    expect(screen.getByText('Hasilnya <b>lebih jelas</b>.')).toBeInTheDocument();
    expect(screen.getByText(copy.detail.score.replace('{score}', '4'))).toBeInTheDocument();
    expect(screen.getByText(copy.detail.verified)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();

    const evidence = screen.getByRole('link', { name: report.evidenceUrl! });
    expect(evidence).toHaveAttribute('href', report.evidenceUrl!);
    expect(evidence).toHaveAttribute('target', '_blank');
    expect(evidence).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('button', { name: form.submit })).toBeNull();
  });
});

describe('JournalReportForm validation', () => {
  it('blocks an empty or unsafe submission with associated field errors', () => {
    mount(makeAction());

    fireEvent.click(screen.getByRole('button', { name: form.submit }));

    expect(screen.getByText(form.whatMin)).toBeInTheDocument();
    expect(screen.getByText(form.required)).toBeInTheDocument();
    expect(mocks.reportAction).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(form.whatLabel), { target: { value: 'A'.repeat(80) } });
    fireEvent.change(screen.getByLabelText(form.resultLabel), { target: { value: validResult } });
    fireEvent.change(screen.getByLabelText(form.evidenceLabel), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: form.submit }));

    expect(screen.getByText(form.evidenceInvalid)).toBeInTheDocument();
    expect(mocks.reportAction).not.toHaveBeenCalled();
  });

  it('submits trimmed values and shows only the server-returned score, feedback and XP', async () => {
    mocks.reportAction.mockResolvedValue({
      ok: true,
      reportId: 'report-high',
      qualityScore: 4,
      feedback: 'Laporanmu sangat spesifik dan terhubung dengan modul.',
      verified: true,
      xpAwarded: 90,
      canRevise: false,
    });
    mount(makeAction());

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: form.submit }));

    await waitFor(() => expect(screen.getByText(form.verifiedTitle)).toBeInTheDocument());
    expect(mocks.reportAction).toHaveBeenCalledWith({
      actionId: makeAction().id,
      whatIDid: validWhat,
      result: validResult,
      reflection: 'Saya akan menetapkan pemeriksaan mingguan yang lebih jelas.',
      evidenceUrl: 'https://example.com/bukti',
    });
    expect(screen.getByText(form.scoreLabel.replace('{score}', '4'))).toBeInTheDocument();
    expect(screen.getByText(form.verified)).toBeInTheDocument();
    expect(
      screen.getByText(messages.game.xpToast.amount.replace('{amount}', '90')),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Laporanmu sangat spesifik dan terhubung dengan modul.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: form.submit })).toBeNull();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('JournalReportForm revisions', () => {
  it('prefills the previous low-score report and keeps one editable revision', async () => {
    const previous = makeReport({
      qualityScore: 2,
      verified: false,
      whatIDid:
        'Saya mencoba menerapkan rutinitas itu satu kali tetapi belum menjelaskan langkahnya secara rinci.',
      result: 'Belum ada hasil yang jelas.',
      reflection: '',
      aiFeedback: 'Perjelas langkah dan hasil yang kamu lihat.',
      createdAt: '2026-10-20T05:00:00.000Z',
    });
    mocks.reportAction.mockResolvedValue({
      ok: true,
      reportId: 'report-low-2',
      qualityScore: 2,
      feedback: 'Masih perlu hasil yang lebih konkret.',
      verified: false,
      xpAwarded: 0,
      canRevise: true,
    });
    mount(makeAction({ reports: [previous] }));

    expect(screen.getByText(form.revisionGuidance)).toBeInTheDocument();
    expect(screen.getByLabelText(form.whatLabel)).toHaveValue(previous.whatIDid);
    expect(screen.getByLabelText(form.resultLabel)).toHaveValue(previous.result);
    expect(screen.queryByText(form.revisionRemaining)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: form.submitRevision }));

    await waitFor(() => expect(screen.getByText(form.reviseTitle)).toBeInTheDocument());
    expect(screen.getByText('Masih perlu hasil yang lebih konkret.')).toBeInTheDocument();
    expect(screen.getByText(form.revisionRemaining)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: form.submitRevision })).toBeEnabled();
    expect(screen.getByLabelText(form.whatLabel)).toHaveValue(previous.whatIDid);
  });

  it('shows the exhausted state and no submit button after the second low report', async () => {
    const previous = makeReport({ qualityScore: 2, verified: false });
    mocks.reportAction.mockResolvedValue({
      ok: true,
      reportId: 'report-low-3',
      qualityScore: 1,
      feedback: 'Laporan ini masih terlalu umum.',
      verified: false,
      xpAwarded: 0,
      canRevise: false,
    });
    mount(makeAction({ reports: [previous] }));

    fireEvent.click(screen.getByRole('button', { name: form.submitRevision }));

    await waitFor(() => expect(screen.getByText(form.exhaustedTitle)).toBeInTheDocument());
    expect(screen.getByText(form.exhaustedBody)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: form.submitRevision })).toBeNull();
    expect(screen.queryByRole('button', { name: form.submit })).toBeNull();
  });
});

describe('JournalReportForm safe errors and double submit', () => {
  it('keeps every input when grading is unavailable and allows a retry', async () => {
    mocks.reportAction.mockResolvedValueOnce({ ok: false, code: 'gradingUnavailable' });
    mount(makeAction());

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: form.submit }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(form.gradingUnavailable),
    );
    expect(screen.getByLabelText(form.whatLabel)).toHaveValue(validWhat);
    expect(screen.getByLabelText(form.resultLabel)).toHaveValue(validResult);
    expect(screen.getByRole('button', { name: form.submit })).toBeEnabled();
    expect(screen.getByText(form.title)).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('disables the submit button and never submits twice while grading', async () => {
    let resolveReport!: (value: unknown) => void;
    mocks.reportAction.mockReturnValue(
      new Promise((resolve) => {
        resolveReport = resolve;
      }),
    );
    mount(makeAction());

    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: form.submit }));
    await waitFor(() => expect(mocks.reportAction).toHaveBeenCalledTimes(1));

    const pendingButton = screen.getByRole('button', { name: form.pending });
    expect(pendingButton).toBeDisabled();
    fireEvent.click(pendingButton);
    expect(mocks.reportAction).toHaveBeenCalledTimes(1);

    resolveReport({
      ok: true,
      reportId: 'report-after-pending',
      qualityScore: 3,
      feedback: 'Cukup jelas dan terverifikasi.',
      verified: true,
      xpAwarded: 50,
      canRevise: false,
    });
    await waitFor(() => expect(screen.getByText(form.verifiedTitle)).toBeInTheDocument());
    expect(mocks.reportAction).toHaveBeenCalledTimes(1);
  });
});
