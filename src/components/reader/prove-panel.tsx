'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export type ProvePanelProps = {
  unbookId: string;
  moduleId: string;
  quizId: string | null;
  quizQuestionCount: number;
  reviewCardCount: number;
};

/** E4-02 AC6: quiz entry point and the module's review card count. */
export function ProvePanel({
  unbookId,
  moduleId,
  quizId,
  quizQuestionCount,
  reviewCardCount,
}: ProvePanelProps) {
  const t = useTranslations('reader.module.prove');
  const hasQuiz = Boolean(quizId) && quizQuestionCount > 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-5">
        <h2 className="text-h2">{t('quizTitle')}</h2>
        {hasQuiz ? (
          <>
            <p className="text-body text-text-muted">
              {t('questionCount', { count: quizQuestionCount })}
            </p>
            <Button asChild className="w-full">
              <Link href={`/unbook/${unbookId}/module/${moduleId}/quiz`}>{t('startQuiz')}</Link>
            </Button>
          </>
        ) : (
          <p className="text-body text-text-muted">{t('noQuiz')}</p>
        )}
      </section>

      <section className="border-border bg-surface-2 flex flex-col gap-2 rounded-[var(--radius-card)] border p-5">
        <h2 className="text-h3">{t('reviewTitle')}</h2>
        <p className="text-body text-text-muted">
          {reviewCardCount > 0 ? t('reviewCount', { count: reviewCardCount }) : t('noReview')}
        </p>
      </section>
    </div>
  );
}
