'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClockIcon, CheckCircle2Icon, MinusCircleIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JournalActionCard, type JournalActionPatch } from './journal-action-card';
import type { JournalActionView } from './view-types';

type JournalViewProps = {
  actions: JournalActionView[];
  nowIso: string;
  timeZone?: string;
};

type JournalTab = 'active' | 'done' | 'skipped';

const EMPTY_ICONS = {
  active: CalendarClockIcon,
  done: CheckCircle2Icon,
  skipped: MinusCircleIcon,
} as const;

/**
 * E7-01: the journal list with three accessible tabs. Status changes are
 * applied optimistically so an action moves to the right tab immediately,
 * then `router.refresh()` reconciles the server data.
 */
export function JournalView({ actions, nowIso, timeZone }: JournalViewProps) {
  const t = useTranslations('journal');
  const [overrides, setOverrides] = useState<Record<string, JournalActionPatch>>({});

  const merged = actions.map((action) => {
    const patch = overrides[action.id];
    return patch ? { ...action, ...patch } : action;
  });

  const groups: Record<JournalTab, JournalActionView[]> = {
    active: merged.filter((action) => action.status === 'planned'),
    done: merged.filter((action) => action.status === 'done'),
    skipped: merged.filter((action) => action.status === 'skipped'),
  };

  function update(actionId: string, patch: JournalActionPatch) {
    setOverrides((previous) => ({
      ...previous,
      [actionId]: { ...previous[actionId], ...patch },
    }));
  }

  return (
    <Tabs defaultValue="active" className="gap-4">
      <TabsList aria-label={t('tabs.label')} className="h-12 w-full">
        {(['active', 'done', 'skipped'] as const).map((tab) => (
          <TabsTrigger key={tab} value={tab} className="min-h-11 flex-1">
            {t('tabs.withCount', { label: t(`tabs.${tab}`), count: groups[tab].length })}
          </TabsTrigger>
        ))}
      </TabsList>

      {(['active', 'done', 'skipped'] as const).map((tab) => {
        const Icon = EMPTY_ICONS[tab];
        return (
          <TabsContent key={tab} value={tab} className="mt-0">
            {groups[tab].length === 0 ? (
              <EmptyState
                icon={Icon}
                message={t(`empty.${tab}.message`)}
                actionLabel={t(`empty.${tab}.action`)}
                actionHref="/library"
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {groups[tab].map((action) => (
                  <li key={action.id}>
                    <JournalActionCard
                      action={action}
                      nowIso={nowIso}
                      timeZone={timeZone}
                      onUpdated={update}
                    />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
