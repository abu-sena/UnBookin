'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LevelRing } from '@/components/game/level-ring';
import { LevelSummary } from '@/components/game/level-overview';
import { LevelUpCelebration } from '@/components/game/level-up-celebration';
import { MissionList } from '@/components/game/mission-list';
import { MissionRing } from '@/components/game/mission-ring';
import { SkillTree } from '@/components/game/skill-tree';
import { StreakFlame } from '@/components/game/streak-flame';
import { XPToast } from '@/components/game/xp-toast';
import { JournalActionCard } from '@/components/journal/journal-action-card';
import { JournalDetail } from '@/components/journal/journal-detail';
import { JournalReportHistory } from '@/components/journal/journal-report-history';
import { JournalSkeleton } from '@/components/journal/journal-skeleton';
import type { JournalActionView, JournalReportView } from '@/components/journal/view-types';
import { BadgeCard } from '@/components/profile/badge-card';
import { ProgressSkeleton } from '@/components/game/progress-skeleton';
import { Button } from '@/components/ui/button';
import { sampleLevelCapped, sampleSkillTree, sampleSummary } from './game-fixtures';

const NOW_ISO = '2026-10-28T05:00:00.000Z';

const sampleReport: JournalReportView = {
  id: 'sample-r1',
  whatIDid: 'Contoh laporan: menulis tiga rutinitas tim dan menetapkan pemilik tiap langkah.',
  result: 'Contoh hasil: rutinitas berjalan lima hari tanpa pengingat.',
  reflection: '',
  evidenceUrl: null,
  aiFeedback: 'Contoh umpan balik: laporanmu spesifik.',
  qualityScore: 3,
  verified: true,
  createdAt: '2026-10-20T05:00:00.000Z',
};

/**
 * A finished action renders no mutating buttons, and a verified one hides the
 * report form, so the preview never sends a real Server Action.
 */
const doneAction: JournalActionView = {
  id: 'sample-a1',
  moduleId: 'sample-mod-1',
  moduleTitle: 'Sistem, bukan panggung',
  unbookId: 'sample-ub-1',
  title: 'Tulis satu rutinitas tim',
  description: null,
  dueAt: '2026-11-03T05:00:00.000Z',
  status: 'done',
  reports: [sampleReport],
  canReport: false,
};

export function GameShowcase() {
  const t = useTranslations('game.devUi');
  const [celebrate, setCelebrate] = useState(false);
  const [toastKey, setToastKey] = useState(0);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-small text-text-muted">{t('previewNote')}</p>

      <Group title={t('level')}>
        <LevelSummary {...sampleSummary} />
        <LevelRing {...sampleLevelCapped} level={sampleLevelCapped.level} size={96} />
      </Group>

      <Group title={t('streak')}>
        <div className="flex flex-wrap gap-3">
          <StreakFlame count={sampleSummary.currentStreak} activeToday />
          <StreakFlame count={sampleSummary.currentStreak} activeToday={false} />
        </div>
      </Group>

      <Group title={t('missions')}>
        <MissionList missions={sampleSummary.missions} />
        <div className="flex gap-3">
          <MissionRing title={t('ringSample')} progress={0} target={3} completed={false} />
          <MissionRing title={t('ringSample')} progress={3} target={3} completed />
        </div>
      </Group>

      <Group title={t('badges')}>
        <ul className="grid grid-cols-2 gap-3">
          {sampleSummary.badges.map((badge) => (
            <BadgeCard key={badge.id} {...badge} lockedLabel={t('locked')} />
          ))}
        </ul>
      </Group>

      <Group title={t('skillTree')}>
        <SkillTree interests={sampleSkillTree} />
      </Group>

      <Group title={t('feedback')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setToastKey((value) => value + 1)}>
            {t('showToast')}
          </Button>
          <div className="min-h-11">
            {toastKey > 0 ? <XPToast key={toastKey} amount={30} /> : null}
          </div>
        </div>
        <Button type="button" onClick={() => setCelebrate(true)}>
          {t('showCelebration')}
        </Button>
        <LevelUpCelebration
          data={
            celebrate
              ? {
                  levelUp: { level: 6, totalXp: 460 },
                  domainLevelUps: [
                    { id: 'sample-d1', name: 'Membangun sistem tim', level: 'competent' },
                  ],
                  badges: [],
                }
              : null
          }
          onClose={() => setCelebrate(false)}
        />
      </Group>

      <Group title={t('skeleton')}>
        <ProgressSkeleton />
      </Group>

      <Group title={t('journal')}>
        <JournalActionCard action={doneAction} nowIso={NOW_ISO} onUpdated={() => undefined} />
        <JournalReportHistory reports={[sampleReport]} />
        <JournalDetail action={doneAction} nowIso={NOW_ISO} />
        <JournalSkeleton />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-h3">{title}</h3>
      {children}
    </section>
  );
}
