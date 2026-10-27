import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import logo from '../../public/branding/unbookin-logo.png';

/** Approved artwork; a white silhouette keeps the wordmark legible in dark mode. */
export function BrandLogo({
  className,
  sizes = '144px',
  loading = 'eager',
}: {
  className?: string;
  sizes?: string;
  loading?: 'eager' | 'lazy';
}) {
  const t = useTranslations('common');

  return (
    <Image
      src={logo}
      alt={t('appName')}
      loading={loading}
      sizes={sizes}
      className={cn('block h-auto w-36 max-w-full dark:brightness-0 dark:invert', className)}
    />
  );
}
