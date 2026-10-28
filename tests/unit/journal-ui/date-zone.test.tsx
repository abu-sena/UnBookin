import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/id.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/journal/actions', () => ({
  updateActionStatus: vi.fn(),
  reportAction: vi.fn(),
}));

vi.mock('@/components/layout/sheet', () => ({ Sheet: () => null }));

import { formatJournalDate } from '@/components/journal/date-format';
import { JournalDetail } from '@/components/journal/journal-detail';
import { JournalView } from '@/components/journal/journal-view';
import { makeAction, makeReport, nowIso } from './fixtures';

const copy = messages.journal;
// 18:00 UTC on 28 Oct is already 29 Oct in Jakarta (UTC+7) but still 28 Oct in New York.
const NEAR_MIDNIGHT = '2026-10-28T18:00:00.000Z';

function wrap(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="id" messages={messages}>
      {node}
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe('formatJournalDate', () => {
  it('formats the same instant in the explicit zone, not the system zone', () => {
    expect(formatJournalDate(NEAR_MIDNIGHT, 'Asia/Jakarta')).toBe('29 Oktober 2026');
    expect(formatJournalDate(NEAR_MIDNIGHT, 'America/New_York')).toBe('28 Oktober 2026');
    expect(formatJournalDate(NEAR_MIDNIGHT, 'UTC')).toBe('28 Oktober 2026');
  });

  it('defaults to Asia/Jakarta', () => {
    expect(formatJournalDate(NEAR_MIDNIGHT)).toBe('29 Oktober 2026');
  });
});

describe('journal dates honour the profile timezone', () => {
  const due = (date: string) => copy.due.replace('{date}', date);
  const created = (date: string) => copy.detail.createdAt.replace('{date}', date);

  it.each([
    ['Asia/Jakarta', '29 Oktober 2026'],
    ['America/New_York', '28 Oktober 2026'],
  ])('list cards use %s', (timeZone, expected) => {
    render(
      wrap(
        <JournalView
          actions={[makeAction({ dueAt: NEAR_MIDNIGHT })]}
          nowIso={nowIso}
          timeZone={timeZone}
        />,
      ),
    );
    expect(screen.getByText(due(expected))).toBeInTheDocument();
  });

  it.each([
    ['Asia/Jakarta', '29 Oktober 2026'],
    ['America/New_York', '28 Oktober 2026'],
  ])('detail header and report history use %s', (timeZone, expected) => {
    render(
      wrap(
        <JournalDetail
          action={makeAction({
            dueAt: NEAR_MIDNIGHT,
            status: 'done',
            canReport: false,
            reports: [makeReport({ createdAt: NEAR_MIDNIGHT })],
          })}
          nowIso={nowIso}
          timeZone={timeZone}
        />,
      ),
    );
    expect(screen.getByText(due(expected))).toBeInTheDocument();
    expect(screen.getByText(created(expected))).toBeInTheDocument();
  });

  it('defaults to Asia/Jakarta when no timeZone prop is passed', () => {
    render(wrap(<JournalView actions={[makeAction({ dueAt: NEAR_MIDNIGHT })]} nowIso={nowIso} />));
    expect(screen.getByText(due('29 Oktober 2026'))).toBeInTheDocument();
  });
});
