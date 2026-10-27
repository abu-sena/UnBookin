'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2Icon } from 'lucide-react';
import { ModulePath } from '@/components/module/path-node';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { UnbookPath } from '@/lib/learning/queries';

/** E4-01: title, big idea, overall progress, the vertical path and Lanjutkan. */
export function UnbookPathView({ path }: { path: UnbookPath }) {
  const t = useTranslations('reader.unbook');
  const router = useRouter();
  const percent =
    path.modulesTotal === 0 ? 0 : Math.round((path.modulesDone / path.modulesTotal) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 break-words">{path.title}</h1>
        {path.bigIdea ? (
          <p className="text-reading text-text-muted break-words">{path.bigIdea}</p>
        ) : null}
      </header>

      <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-4">
        <p className="text-h3 tabular-nums">
          {t('progress', { done: path.modulesDone, total: path.modulesTotal })}
        </p>
        <Progress
          value={percent}
          aria-label={t('progressAria', {
            done: path.modulesDone,
            total: path.modulesTotal,
          })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">{t('pathTitle')}</h2>
        <ModulePath
          nodes={path.modules.map((module) => ({
            id: module.moduleId,
            title: module.title,
            minutes: module.estimatedMinutes ?? 0,
            state: module.state,
          }))}
          onSelect={(index) => {
            const node = path.modules[index];
            if (node) router.push(`/unbook/${path.unbookId}/module/${node.moduleId}`);
          }}
        />
      </section>

      <div className="bg-background/95 border-border sticky bottom-24 z-20 -mx-4 mt-2 border-t px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        {path.continueModuleId ? (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/unbook/${path.unbookId}/module/${path.continueModuleId}`}>
              {t('continue')}
            </Link>
          </Button>
        ) : (
          <div className="border-success/30 bg-success/5 flex items-start gap-3 rounded-[var(--radius-card)] border p-4">
            <CheckCircle2Icon className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-small font-semibold">{t('allDoneTitle')}</p>
              <p className="text-small text-text-muted">{t('allDoneBody')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
