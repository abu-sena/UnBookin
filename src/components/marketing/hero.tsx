import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';

export type HeroContentProps = {
  tagline: string;
  description: string;
  ctaLabel: string;
};

/**
 * Presentational hero — split from the async wrapper so unit tests can render
 * it without a server translations context (E0-01 AC1: fully visible at
 * 375×667 without scrolling).
 */
export function HeroContent({ tagline, description, ctaLabel }: HeroContentProps) {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4 pt-10 pb-12 text-center sm:px-6 sm:pt-16 lg:px-8">
      <h1 className="text-display mx-auto max-w-xl">{tagline}</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-balance">{description}</p>
      <div className="mt-6 flex justify-center">
        <Button asChild size="lg" className="w-full max-w-xs">
          <a href="#daftar">{ctaLabel}</a>
        </Button>
      </div>
    </section>
  );
}

export async function Hero() {
  const t = await getTranslations('landing');
  return (
    <HeroContent
      tagline={t('hero.tagline')}
      description={t('hero.description')}
      ctaLabel={t('hero.cta')}
    />
  );
}
