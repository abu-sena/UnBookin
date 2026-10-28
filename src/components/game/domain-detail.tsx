import Link from 'next/link';
import { CheckCircle2Icon, CircleIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { SkillTreeDomain } from '@/lib/game/queries';
import { LEVEL_STYLE } from './level-meta';

const numberFormat = new Intl.NumberFormat('id-ID');

function Requirement({ met, label }: { met: boolean; label: string }) {
  const t = useTranslations('progress.domain');
  const Icon = met ? CheckCircle2Icon : CircleIcon;
  return (
    <li className="text-small flex min-h-6 items-start gap-2">
      <Icon
        className={
          met
            ? 'text-level-competent-text mt-0.5 size-4 shrink-0'
            : 'text-text-muted mt-0.5 size-4 shrink-0'
        }
        aria-hidden="true"
      />
      <span className="min-w-0 break-words">
        {label} <span className="text-text-muted">({met ? t('met') : t('unmet')})</span>
      </span>
    </li>
  );
}

/** Body of the domain sheet: XP, exact next-level gates, modules and actions. */
export function DomainDetail({ domain }: { domain: SkillTreeDomain }) {
  const t = useTranslations('progress.domain');
  const tLevels = useTranslations('game.levels');
  const next = domain.nextRequirements;

  return (
    <div className="flex max-h-[60dvh] flex-col gap-5 overflow-y-auto pb-2">
      <p className={`text-small font-semibold ${LEVEL_STYLE[domain.level].text}`}>
        {tLevels(domain.level)}
      </p>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label={t('xp')} value={numberFormat.format(domain.xp)} />
        <Stat label={t('passedQuizzes')} value={numberFormat.format(domain.passedQuizzes)} />
        <Stat label={t('verifiedActions')} value={numberFormat.format(domain.verifiedActions)} />
      </dl>

      <section className="flex flex-col gap-2" aria-labelledby={`domain-next-${domain.id}`}>
        <h3 id={`domain-next-${domain.id}`} className="text-h3">
          {next ? t('nextTitle', { level: tLevels(next.nextLevel) }) : t('nextMax')}
        </h3>
        {next ? (
          <ul className="flex flex-col gap-1">
            <Requirement
              met={domain.xp >= next.xp}
              label={t('requirementXp', {
                current: numberFormat.format(domain.xp),
                required: numberFormat.format(next.xp),
              })}
            />
            <Requirement
              met={domain.passedQuizzes >= next.passedQuizzes}
              label={t('requirementQuizzes', {
                current: domain.passedQuizzes,
                required: next.passedQuizzes,
              })}
            />
            <Requirement
              met={domain.verifiedActions >= next.verifiedActions}
              label={t('requirementActions', {
                current: domain.verifiedActions,
                required: next.verifiedActions,
              })}
            />
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-1" aria-labelledby={`domain-modules-${domain.id}`}>
        <h3 id={`domain-modules-${domain.id}`} className="text-h3">
          {t('modulesTitle')}
        </h3>
        {domain.modules.length === 0 ? (
          <p className="text-small text-text-muted">{t('modulesEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {domain.modules.map((module) => (
              <li key={module.id}>
                <Link
                  href={`/unbook/${module.unbookId}/module/${module.id}`}
                  className="text-primary text-small inline-flex min-h-11 items-center break-words hover:underline"
                >
                  {module.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-1" aria-labelledby={`domain-actions-${domain.id}`}>
        <h3 id={`domain-actions-${domain.id}`} className="text-h3">
          {t('actionsTitle')}
        </h3>
        {domain.actions.length === 0 ? (
          <p className="text-small text-text-muted">{t('actionsEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {domain.actions.map((action) => (
              <li key={action.id}>
                <Link
                  href={`/journal/${action.id}`}
                  className="text-primary text-small inline-flex min-h-11 items-center break-words hover:underline"
                >
                  {action.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-surface-2 flex min-w-0 flex-col gap-1 rounded-[var(--radius-input)] border p-2">
      <dt className="text-caption text-text-muted break-words">{label}</dt>
      <dd className="text-h3 tabular-nums">{value}</dd>
    </div>
  );
}
