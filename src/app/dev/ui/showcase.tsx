'use client';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BoldIcon, BookOpenIcon, HeartIcon, ItalicIcon, UnderlineIcon } from 'lucide-react';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LibraryCard } from '@/components/library/library-card';
import { LibraryFilterForm } from '@/components/library/library-filter-form';
import { Sheet } from '@/components/layout/sheet';
import { EmptyState } from '@/components/ui-kit/empty-state';
import { ErrorState } from '@/components/ui-kit/error-state';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { LibraryInterestOption, LibraryItem } from '@/lib/library/types';

type DevUiShowcaseProps = {
  title: string;
  description: string;
  topBarSlot: React.ReactNode;
  bottomNavSlot: React.ReactNode;
};

const radiusTokens = [
  { className: 'rounded-[var(--radius-input)]', labelKey: 'radiusInput' },
  { className: 'rounded-[var(--radius-button)]', labelKey: 'radiusButton' },
  { className: 'rounded-[var(--radius-card)]', labelKey: 'radiusCard' },
  { className: 'rounded-[var(--radius-sheet)]', labelKey: 'radiusSheet' },
] as const;

const libraryFixtureInterests: LibraryInterestOption[] = [
  { slug: 'leadership-management', name: 'Kepemimpinan dan Manajemen' },
  { slug: 'personal-development-productivity', name: 'Pengembangan Diri dan Produktivitas' },
  { slug: 'islamic-studies', name: 'Studi Islam' },
];

const libraryFixtureItems: LibraryItem[] = [
  {
    id: 'library-ready',
    title: 'Good to Great',
    author: 'Jim Collins',
    interestName: 'Kepemimpinan dan Manajemen',
    interestSlug: 'leadership-management',
    status: 'ready',
    modulesRead: 3,
    moduleCount: 8,
  },
  {
    id: 'library-generating',
    title: 'Atomic Habits',
    author: 'James Clear',
    interestName: 'Pengembangan Diri dan Produktivitas',
    interestSlug: 'personal-development-productivity',
    status: 'generating',
    modulesRead: 0,
    moduleCount: 6,
  },
  {
    id: 'library-failed',
    title: 'Deep Work',
    author: null,
    interestName: 'Pengembangan Diri dan Produktivitas',
    interestSlug: 'personal-development-productivity',
    status: 'failed',
    modulesRead: 0,
    moduleCount: 5,
  },
  {
    id: 'library-long',
    title:
      'Membangun Kebiasaan Membaca yang Bertahan Saat Pekerjaan Sedang Sangat Padat dan Tidak Ada Waktu Luang',
    author:
      'Nama Penulis yang Sangat Panjang untuk Menguji Pembungkusan Teks di Layar Ponsel yang Sempit',
    interestName: 'Studi Islam',
    interestSlug: 'islamic-studies',
    status: 'outlining',
    modulesRead: 0,
    moduleCount: 12,
  },
];

export function DevUiShowcase({
  title,
  description,
  topBarSlot,
  bottomNavSlot,
}: DevUiShowcaseProps) {
  const t = useTranslations('devUi');
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-start justify-between gap-4 pt-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1">{title}</h1>
          <p className="text-body text-text-muted">{description}</p>
        </div>
        <ThemeToggle />
      </header>

      <Section title={t('sectionColors')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <ColorSwatch className="bg-background" label={t('colorBackground')} bordered />
          <ColorSwatch className="bg-surface" label={t('colorSurface')} bordered />
          <ColorSwatch className="bg-surface-2" label={t('colorSurface2')} bordered />
          <ColorSwatch className="bg-border" label={t('colorBorder')} />
          <ColorSwatch className="bg-text" label={t('colorText')} />
          <ColorSwatch className="bg-text-muted" label={t('colorTextMuted')} />
          <ColorSwatch className="bg-primary" label={t('colorPrimary')} />
          <ColorSwatch className="bg-primary-soft" label={t('colorPrimarySoft')} bordered />
          <ColorSwatch className="bg-xp" label={t('colorXp')} />
          <ColorSwatch className="bg-success" label={t('colorSuccess')} />
          <ColorSwatch className="bg-warning" label={t('colorWarning')} />
          <ColorSwatch className="bg-danger" label={t('colorDanger')} />
        </div>
        <p className="text-caption text-text-muted">
          {t('colorXp')} · {t('colorSuccess')} · {t('colorWarning')} · {t('colorDanger')}
        </p>
      </Section>

      <Section title={t('sectionTypography')}>
        <div className="flex flex-col gap-3">
          <p className="text-display">{t('typeDisplay')}</p>
          <p className="text-h1">{t('typeH1')}</p>
          <p className="text-h2">{t('typeH2')}</p>
          <p className="text-h3">{t('typeH3')}</p>
          <p className="text-body">{t('typeBody')}</p>
          <p className="text-reading">{t('typeReading')}</p>
          <p className="text-small">{t('typeSmall')}</p>
          <p className="text-caption">{t('typeCaption')}</p>
          <p className="text-body tabular-nums">2.340 XP · 340/500 · 🔥 12</p>
        </div>
      </Section>

      <Section title={t('sectionRadius')}>
        <div className="flex flex-wrap gap-4">
          {radiusTokens.map((radius) => (
            <div key={radius.labelKey} className="flex flex-col items-center gap-2">
              <div
                className={`border-primary size-16 border-2 ${radius.className}`}
                aria-hidden="true"
              />
              <span className="text-caption text-text-muted">{t(radius.labelKey)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('sectionButtons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('defaultButton')}</Button>
          <Button variant="secondary">{t('secondaryButton')}</Button>
          <Button variant="outline">{t('outlineButton')}</Button>
          <Button variant="ghost">{t('ghostButton')}</Button>
          <Button variant="destructive">{t('destructiveButton')}</Button>
          <Button variant="link">{t('linkButton')}</Button>
          <Button variant="outline" size="icon" aria-label={t('iconButtonAria')}>
            <HeartIcon aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section title={t('sectionForms')}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-name">{t('nameLabel')}</Label>
            <Input id="dev-name" placeholder={t('namePlaceholder')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-bio">{t('bioLabel')}</Label>
            <Textarea id="dev-bio" placeholder={t('bioPlaceholder')} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="dev-agree" />
            <Label htmlFor="dev-agree">{t('agreementLabel')}</Label>
          </div>
        </div>
      </Section>

      <Section title={t('sectionComponents')}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{t('badgeDefault')}</Badge>
          <Badge variant="secondary">{t('badgeSecondary')}</Badge>
          <Badge className="border-success/30 bg-success/10 text-success">
            {t('badgeSuccess')}
          </Badge>
          <Badge className="border-xp/30 bg-xp/10 text-xp tabular-nums">{t('badgeXp')}</Badge>
          <Separator className="w-6" orientation="vertical" />
          <Progress value={65} aria-label={t('progressLabel')} className="w-40" />
          <Avatar>
            <AvatarFallback>{t('avatarFallback')}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-col gap-4">
          <Tabs defaultValue="one" className="w-full max-w-sm">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="one">{t('tabOne')}</TabsTrigger>
              <TabsTrigger value="two">{t('tabTwo')}</TabsTrigger>
            </TabsList>
            <TabsContent value="one">
              <p className="text-body text-text-muted">{t('tabOneBody')}</p>
            </TabsContent>
            <TabsContent value="two">
              <p className="text-body text-text-muted">{t('tabTwoBody')}</p>
            </TabsContent>
          </Tabs>

          <ToggleGroup type="multiple" variant="outline">
            <ToggleGroupItem value="bold" aria-label={t('toggleBold')}>
              <BoldIcon className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label={t('toggleItalic')}>
              <ItalicIcon className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label={t('toggleUnderline')}>
              <UnderlineIcon className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">{t('dropdownLabel')}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>{t('dropdownItem')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">{t('tooltipLabel')}</Button>
                </TooltipTrigger>
                <TooltipContent>{t('tooltipContent')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="outline"
              onClick={() => toast(t('toastTitle'), { description: t('toastDescription') })}
            >
              {t('showToast')}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={t('sectionStates')}>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-h3 mb-3">{t('emptyStateTitle')}</h3>
            <EmptyState
              icon={BookOpenIcon}
              message={t('typeReading')}
              actionLabel={t('defaultButton')}
              onAction={() => toast(t('toastTitle'))}
            />
          </div>
          <div>
            <h3 className="text-h3 mb-3">{t('errorStateTitle')}</h3>
            <ErrorState
              message={t('errorStateMessage')}
              retryLabel={t('openSheet')}
              onRetry={() => toast(t('toastTitle'))}
            />
          </div>
          <div>
            <h3 className="text-h3 mb-3">{t('skeletonTitle')}</h3>
            <p className="text-body text-text-muted mb-3">{t('skeletonHint')}</p>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        </div>
      </Section>

      <Section title={t('sectionLibrary')}>
        <p className="text-body text-text-muted">{t('libraryPreviewDescription')}</p>

        <div>
          <h3 className="text-h3 mb-3">{t('libraryFilterHint')}</h3>
          <LibraryFilterForm
            filters={{
              q: 'kebiasaan',
              interest: 'personal-development-productivity',
              status: 'ready',
            }}
            interests={libraryFixtureInterests}
          />
        </div>

        <div>
          <h3 className="text-h3 mb-3">{t('libraryCardsTitle')}</h3>
          <ul className="flex flex-col gap-3">
            {libraryFixtureItems.map((item) => (
              <LibraryCard key={item.id} item={item} />
            ))}
          </ul>
        </div>
      </Section>

      <Section title={t('sectionNavigation')}>
        <div className="border-border relative h-44 transform-gpu overflow-hidden rounded-[var(--radius-card)] border">
          {topBarSlot}
          {bottomNavSlot}
        </div>
        <p className="text-caption text-text-muted">{t('sheetDescription')}</p>
      </Section>

      <Section title={t('sectionSheet')}>
        <Button onClick={() => setSheetOpen(true)}>{t('openSheet')}</Button>
        <Sheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title={t('sheetTitle')}
          description={t('sheetDescription')}
        >
          <div className="flex flex-col gap-4">
            <p className="text-body text-text-muted">{t('sheetBody')}</p>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              {t('closeSheet')}
            </Button>
          </div>
        </Sheet>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-h2">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function ColorSwatch({
  className,
  label,
  bordered = false,
}: {
  className: string;
  label: string;
  bordered?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`size-10 shrink-0 ${className} ${bordered ? 'border-border border' : ''} rounded-[var(--radius-button)]`}
        aria-hidden="true"
      />
      <span className="text-small">{label}</span>
    </div>
  );
}
