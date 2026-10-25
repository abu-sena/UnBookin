import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  AwardIcon,
  BookOpenIcon,
  CheckCheckIcon,
  FlameIcon,
  HammerIcon,
  UserIcon,
} from 'lucide-react';
import { BadgeCard } from '@/components/profile/badge-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { PageHeader } from '@/components/ui-kit/page-header';
import { getMyProfileSummary } from '@/lib/profile/summary';

const numberFormatter = new Intl.NumberFormat('id-ID');

export default async function ProfilePage() {
  const t = await getTranslations('profile');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

async function ProfileContent() {
  const [summary, t] = await Promise.all([getMyProfileSummary(), getTranslations('profile')]);
  const displayName = summary.displayName?.trim() || summary.user.name?.trim() || t('unnamed');
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <section className="border-border bg-surface flex flex-col items-center gap-3 rounded-[var(--radius-card)] border p-6 text-center">
        <Avatar size="lg" className="size-20">
          {summary.user.image ? <AvatarImage src={summary.user.image} alt={displayName} /> : null}
          <AvatarFallback className="bg-primary-soft text-primary text-h3">
            {initials || <UserIcon className="size-6" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h2 className="text-h2">{displayName}</h2>
          <p className="text-small text-text-muted tabular-nums">
            {t('levelValue', { level: numberFormatter.format(summary.level) })}
          </p>
        </div>
      </section>

      <section aria-label={t('gamificationTitle')} className="grid grid-cols-3 gap-3">
        <StatTile label={t('level')} value={numberFormatter.format(summary.level)} />
        <StatTile label={t('totalXp')} value={numberFormatter.format(summary.totalXp)} />
        <StatTile
          label={t('longestStreak')}
          value={numberFormatter.format(summary.longestStreak)}
          icon={<FlameIcon className="size-4" aria-hidden="true" />}
          hint={t('days')}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="profile-badges-title">
        <h2 id="profile-badges-title" className="text-h2">
          {t('badgesTitle')}
        </h2>
        {summary.badges.length === 0 ? (
          <EmptyState
            icon={AwardIcon}
            message={t('badgesEmpty')}
            actionLabel={t('badgesEmptyAction')}
            actionHref="/library"
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {summary.badges.map((badge) => (
              <BadgeCard
                key={badge.id}
                name={badge.name}
                description={badge.description}
                icon={badge.icon}
                tier={badge.tier}
                earned={badge.earnedAt !== null}
                lockedLabel={t('locked')}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="profile-stats-title">
        <h2 id="profile-stats-title" className="text-h2">
          {t('statsTitle')}
        </h2>
        <ul className="border-border bg-surface divide-border flex flex-col divide-y rounded-[var(--radius-card)] border">
          <StatRow
            icon={<BookOpenIcon className="size-5" aria-hidden="true" />}
            label={t('modulesRead')}
            value={numberFormatter.format(summary.stats.modulesRead)}
          />
          <StatRow
            icon={<CheckCheckIcon className="size-5" aria-hidden="true" />}
            label={t('quizzesPassed')}
            value={numberFormatter.format(summary.stats.quizzesPassed)}
          />
          <StatRow
            icon={<HammerIcon className="size-5" aria-hidden="true" />}
            label={t('verifiedActions')}
            value={numberFormatter.format(summary.stats.verifiedActions)}
          />
        </ul>
      </section>

      <Button asChild size="lg" className="w-full">
        <Link href="/settings/profil-belajar">{t('editProfile')}</Link>
      </Button>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-border bg-surface flex flex-col items-center gap-1 rounded-[var(--radius-card)] border p-3 text-center">
      <span className="text-caption text-text-muted flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="text-h2 tabular-nums">{value}</span>
      {hint ? <span className="text-caption text-text-muted">{hint}</span> : null}
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-3">
      <span className="text-text-muted" aria-hidden="true">
        {icon}
      </span>
      <span className="text-small flex-1">{label}</span>
      <span className="text-body font-semibold tabular-nums">{value}</span>
    </li>
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="border-border bg-surface flex flex-col items-center gap-3 rounded-[var(--radius-card)] border p-6">
        <Skeleton className="size-20 rounded-[var(--radius-full)]" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-24 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-32 w-full rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
