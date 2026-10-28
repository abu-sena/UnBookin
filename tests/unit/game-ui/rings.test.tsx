import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { LevelRing } from '@/components/game/level-ring';
import { MissionList } from '@/components/game/mission-list';
import { MissionRing } from '@/components/game/mission-ring';
import messages from '@/messages/id.json';

afterEach(cleanup);

function mount(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('LevelRing', () => {
  it('clamps progress into 0..100', () => {
    mount(<LevelRing level={3} progress={4} nextLevelXp={400} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    cleanup();
    mount(<LevelRing level={3} progress={-2} nextLevelXp={400} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    cleanup();
    mount(<LevelRing level={3} progress={Number.NaN} nextLevelXp={400} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('has no next level at the cap', () => {
    mount(<LevelRing level={30} progress={0.2} nextLevelXp={null} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAccessibleName('Level 30, level tertinggi tercapai');
  });
});

describe('MissionRing', () => {
  it('exposes a progressbar with min 0 and max target', () => {
    mount(<MissionRing title="Baca modul" progress={0} target={3} completed={false} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('clamps progress above target', () => {
    mount(<MissionRing title="Baca" progress={9} target={3} completed />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  });
});

describe('MissionList', () => {
  const base = { id: 'x', type: 'learn' as const, xpReward: 40 };

  it('shows progress, reward and completed label', () => {
    mount(
      <MissionList
        missions={[
          { ...base, id: 'a', title: 'Misi nol', target: 3, progress: 0, completed: false },
          { ...base, id: 'b', title: 'Misi selesai', target: 2, progress: 2, completed: true },
        ]}
      />,
    );
    expect(screen.getAllByText(/Hadiah \+40 XP/)).toHaveLength(2);
    expect(screen.getByText(/0\/3/)).toBeInTheDocument();
    expect(screen.getAllByText('Selesai')).toHaveLength(1);
  });

  it('limits and handles the empty list', () => {
    const missions = ['a', 'b', 'c', 'd'].map((id) => ({
      ...base,
      id,
      title: `Misi ${id}`,
      target: 1,
      progress: 0,
      completed: false,
    }));
    mount(<MissionList missions={missions} limit={3} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    cleanup();
    mount(<MissionList missions={[]} />);
    expect(screen.getByText(messages.game.missions.empty)).toBeInTheDocument();
  });
});
