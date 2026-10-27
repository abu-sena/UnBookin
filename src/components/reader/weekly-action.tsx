'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ActionCard, type ActionCardStatus } from '@/components/module/action-card';
import type { ModuleContent } from '@/lib/engine/module-content';
import { createActionFromModule } from '@/lib/learning/actions';

export type WeeklyActionProps = {
  moduleId: string;
  action: ModuleContent['application']['actionThisWeek'];
  plannedActionId: string | null;
};

function formatDueDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** E4-02 AC5: create the weekly action once and keep the created state on reload. */
export function WeeklyAction({ moduleId, action, plannedActionId }: WeeklyActionProps) {
  const t = useTranslations('reader.module.apply');
  const [status, setStatus] = useState<ActionCardStatus>(plannedActionId ? 'created' : 'idle');
  const [dueDateText, setDueDateText] = useState<string | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);

  async function create() {
    if (status !== 'idle') return;
    setStatus('pending');
    setSaveFailed(false);
    try {
      const result = await createActionFromModule({ moduleId });
      if (!result.ok) {
        setStatus('idle');
        setSaveFailed(true);
        return;
      }
      setDueDateText(formatDueDate(result.dueAt));
      setStatus('created');
    } catch {
      setStatus('idle');
      setSaveFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ActionCard
        title={action.title}
        steps={action.steps}
        doneWhen={action.doneWhen}
        status={status}
        dueDateText={dueDateText}
        onCreate={() => void create()}
      />
      {saveFailed ? (
        <p role="alert" className="text-danger text-small">
          {t('actionSaveError')}
        </p>
      ) : null}
    </div>
  );
}
