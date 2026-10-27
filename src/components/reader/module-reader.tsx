'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeftIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { XPToast } from '@/components/game/xp-toast';
import type { LayerValue } from '@/components/module/layer-toggle';
import { Button } from '@/components/ui/button';
import { MODULE_READ } from '@/lib/game/xp-rules';
import { recordDeepestLayer } from '@/lib/learning/actions';
import { ApplyPanel } from './apply-panel';
import { ProvePanel } from './prove-panel';
import {
  READER_TABS,
  readReaderPosition,
  saveReaderPosition,
  type ReaderTab,
} from './reader-storage';
import { ReaderTabs } from './reader-tabs';
import { ReaderToolbar } from './reader-toolbar';
import type { ReaderModuleProps } from './reader-types';
import { UnderstandPanel } from './understand-panel';
import { useModuleReading } from './use-module-reading';

/** E4-02: the three-tab module reader with layers, practice and proof. */
export function ModuleReader(props: ReaderModuleProps) {
  const t = useTranslations('reader.module');
  const [activeTab, setActiveTab] = useState<ReaderTab>('understand');
  const [layer, setLayer] = useState<LayerValue>(props.deepestLayer);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [applyOpened, setApplyOpened] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<ReaderTab>('understand');
  const restoredRef = useRef(false);

  const { read, xpAwarded } = useModuleReading({
    moduleId: props.moduleId,
    initiallyRead: props.status === 'read',
    reachedEnd,
    applyOpened,
  });

  useEffect(() => {
    const saved = readReaderPosition(props.moduleId);
    if (!saved) {
      restoredRef.current = true;
      return;
    }

    activeTabRef.current = saved.tab;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setActiveTab(saved.tab);
      const scroller = scrollerRef.current;
      if (scroller) {
        const left = READER_TABS.indexOf(saved.tab) * scroller.clientWidth;
        if (typeof scroller.scrollTo === 'function') {
          scroller.scrollTo({ left, behavior: 'auto' });
        } else {
          scroller.scrollLeft = left;
        }
      }
      window.scrollTo({ top: saved.scrollY });
      restoredRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, [props.moduleId]);

  useEffect(() => {
    const onScroll = () => {
      if (!restoredRef.current) return;
      saveReaderPosition(props.moduleId, {
        tab: activeTabRef.current,
        scrollY: window.scrollY,
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [props.moduleId]);

  useEffect(() => {
    const node = endRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setReachedEnd(true));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReachedEnd(true);
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function changeTab(tab: ReaderTab) {
    setActiveTab(tab);
    activeTabRef.current = tab;
    if (tab === 'apply') setApplyOpened(true);
    saveReaderPosition(props.moduleId, { tab, scrollY: window.scrollY });
  }

  function changeLayer(next: LayerValue) {
    setLayer(next);
    void recordDeepestLayer({ moduleId: props.moduleId, layer: next }).catch(() => undefined);
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          href={`/unbook/${props.unbookId}`}
          className="text-small text-text-muted hover:text-text inline-flex min-h-11 w-fit items-center gap-1"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-h1 min-w-0 break-words">{props.title}</h1>
          <span className="text-caption text-text-muted shrink-0 tabular-nums">
            {t('minutes', { minutes: props.content.estimatedMinutes })}
          </span>
        </div>
        {xpAwarded ? <XPToast amount={MODULE_READ} className="w-fit" /> : null}
      </div>

      <ReaderToolbar />

      <ReaderTabs
        active={activeTab}
        onActiveChange={changeTab}
        scrollerRef={scrollerRef}
        panels={{
          understand: (
            <UnderstandPanel
              moduleId={props.moduleId}
              content={props.content}
              layer={layer}
              onLayerChange={changeLayer}
              endRef={endRef}
            />
          ),
          apply: (
            <ApplyPanel
              moduleId={props.moduleId}
              content={props.content}
              checklist={props.checklist}
              plannedActionId={props.plannedActionId}
            />
          ),
          prove: (
            <ProvePanel
              unbookId={props.unbookId}
              moduleId={props.moduleId}
              quizId={props.quizId}
              quizQuestionCount={props.quizQuestionCount}
              reviewCardCount={props.reviewCardCount}
            />
          ),
        }}
      />

      {read ? (
        <div className="border-border flex flex-col gap-3 border-t pt-4">
          <p role="status" className="text-small text-success">
            {t('readDone')}
          </p>
          {props.nextModuleId ? (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/unbook/${props.unbookId}/module/${props.nextModuleId}`}>
                {t('nextModule')}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
