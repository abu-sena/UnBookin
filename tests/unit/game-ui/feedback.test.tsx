import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffGameSummary } from '@/components/game/game-feedback-diff';
import { StreakFlame } from '@/components/game/streak-flame';
import { GameFeedbackProvider } from '@/components/game/game-feedback-provider';
import messages from '@/messages/id.json';
import { makeSummary } from './fixtures';

vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

function tree(userId: string, summary: ReturnType<typeof makeSummary> | undefined) {
  return (
    <NextIntlClientProvider locale="id" messages={messages}>
      <GameFeedbackProvider userId={userId} summary={summary}>
        <p>isi</p>
      </GameFeedbackProvider>
    </NextIntlClientProvider>
  );
}

describe('diffGameSummary', () => {
  it('reports real increases only', () => {
    const before = makeSummary();
    expect(diffGameSummary(before, makeSummary()).levelUp).toBeNull();
    expect(diffGameSummary(before, makeSummary({ level: 3 })).levelUp).toBeNull();
    const up = diffGameSummary(
      before,
      makeSummary({
        level: 5,
        domainLevels: [{ id: 'd1', name: 'Delegasi', level: 'competent', xp: 600 }],
      }),
    );
    expect(up.levelUp?.level).toBe(5);
    expect(up.domainLevelUps).toEqual([{ id: 'd1', name: 'Delegasi', level: 'competent' }]);
  });
});

describe('GameFeedbackProvider', () => {
  it('does not celebrate the initial snapshot', () => {
    render(tree('u1', makeSummary()));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('celebrates once on a level increase and not on rerender', () => {
    const { rerender } = render(tree('u1', makeSummary()));
    const next = makeSummary({ level: 5, totalXp: 330 });
    rerender(tree('u1', next));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Kamu mencapai level 5.')).toBeInTheDocument();
    rerender(tree('u1', next));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('combines player and domain level ups in one dialog', () => {
    const { rerender } = render(tree('u1', makeSummary()));
    rerender(
      tree(
        'u1',
        makeSummary({
          level: 5,
          domainLevels: [{ id: 'd1', name: 'Delegasi', level: 'advanced_beginner', xp: 200 }],
        }),
      ),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByText('Delegasi naik ke Pemula lanjut.')).toBeInTheDocument();
    expect(screen.getByText('Kamu mencapai level 5.')).toBeInTheDocument();
  });

  it('never carries a snapshot across users', () => {
    const { rerender } = render(tree('u1', makeSummary({ level: 2 })));
    rerender(tree('u2', makeSummary({ level: 9 })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('survives a missing summary', () => {
    const { rerender } = render(tree('u1', undefined));
    rerender(tree('u1', makeSummary()));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('isi')).toBeInTheDocument();
  });

  it('shows a mission reward toast that disappears', () => {
    vi.useFakeTimers();
    try {
      const mission = {
        id: 'm',
        title: 'Misi',
        type: 'learn' as const,
        target: 1,
        progress: 0,
        xpReward: 40,
        completed: false,
      };
      const { rerender } = render(tree('u1', makeSummary({ missions: [mission] })));
      rerender(
        tree(
          'u1',
          makeSummary({ totalXp: 340, missions: [{ ...mission, progress: 1, completed: true }] }),
        ),
      );
      expect(screen.getAllByText('+40 XP').length).toBeGreaterThan(0);
      act(() => {
        vi.advanceTimersByTime(1_400);
      });
      expect(screen.queryByText('+40 XP')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pulses the streak once per user and local date', async () => {
    const withFlame = (userId: string, today: string) => (
      <NextIntlClientProvider locale="id" messages={messages}>
        <GameFeedbackProvider userId={userId} summary={makeSummary({ today })}>
          <StreakFlame count={3} activeToday />
        </GameFeedbackProvider>
      </NextIntlClientProvider>
    );
    const flame = () => document.querySelector('.streak-flame-motion');
    const settle = () =>
      act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

    const first = render(withFlame('u1', '2026-10-28'));
    await settle();
    expect(flame()).not.toBeNull();
    first.unmount();

    const again = render(withFlame('u1', '2026-10-28'));
    await settle();
    expect(flame()).toBeNull();
    again.unmount();

    render(withFlame('u1', '2026-10-29'));
    await settle();
    expect(flame()).not.toBeNull();
  });
});
