'use client';

import { SendIcon, SquareIcon, XIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useMediaQuery } from '@/hooks/use-media-query';
import { track } from '@/lib/analytics/events';
import {
  loadOlderMentorMessages,
  openMentorThread,
  type MentorMessageDto,
} from '@/lib/mentor/actions';
import { renderSegments, type AnswerSegment } from '@/lib/mentor/answer';
import type { MentorErrorCode } from '@/lib/mentor/errors';
import {
  createMentorEventReader,
  MAX_MENTOR_QUESTION_CHARS,
  mentorErrorBodySchema,
  type MentorAllowanceView,
} from '@/lib/mentor/protocol';
import type { MentorSuggestion } from '@/lib/mentor/suggestions';
import { appendAnswerSegment } from './answer-body';
import { MentorAnswer } from './answer-view';
import { shouldAutoScroll } from './chat-scroll';
import { isQuotaBlocked, QuotaEmptyNotice, QuotaSummary } from './mentor-quota';

export type MentorChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  segments: AnswerSegment[];
  createdAt: string;
  streaming?: boolean;
  note?: string;
};

type Notice = { text: string; retryText?: string };

export type MentorChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unbookId: string;
  moduleId?: string;
};

export function toChatMessage(message: MentorMessageDto): MentorChatMessage {
  return {
    id: message.id,
    role: message.role,
    segments:
      message.role === 'assistant'
        ? renderSegments(message.content, message.citations)
        : [{ type: 'text', text: message.content }],
    createdAt: message.createdAt,
  };
}

function plainText(segments: readonly AnswerSegment[]): string {
  return segments
    .filter(
      (segment): segment is Extract<AnswerSegment, { type: 'text' }> => segment.type === 'text',
    )
    .map((segment) => segment.text)
    .join('');
}

export function MentorChatSheet({ open, onOpenChange, unbookId, moduleId }: MentorChatSheetProps) {
  const t = useTranslations('mentor');
  const tSuggestions = useTranslations('mentor.suggestions');
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [mentorName, setMentorName] = useState('');
  const [messages, setMessages] = useState<MentorChatMessage[]>([]);
  const [allowance, setAllowance] = useState<MentorAllowanceView | null>(null);
  const [suggestions, setSuggestions] = useState<MentorSuggestion[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const openedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const restoreRef = useRef<{ height: number; top: number } | null>(null);

  const startLoad = useCallback(async () => {
    setStatus('loading');
    setNotice(null);
    setOlderError(false);
    const result = await openMentorThread(moduleId ? { unbookId, moduleId } : { unbookId });
    if (!result.ok) {
      setStatus('error');
      return;
    }
    setThreadId(result.threadId);
    setMentorName(result.mentorName);
    setMessages(result.messages.map(toChatMessage));
    setAllowance(result.allowance);
    setSuggestions(result.suggestions);
    setHasOlder(result.hasOlder);
    setQuotaExceeded(false);
    setStatus('ready');
  }, [unbookId, moduleId]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    void startLoad();
  }, [open, startLoad]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const restore = restoreRef.current;
    if (restore) {
      element.scrollTop = element.scrollHeight - restore.height + restore.top;
      restoreRef.current = null;
      return;
    }
    if (nearBottomRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    nearBottomRef.current = shouldAutoScroll({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    });
  }

  function errorText(code: MentorErrorCode): string {
    switch (code) {
      case 'rateLimited':
        return t('errors.rateLimited');
      case 'sourceUnavailable':
        return t('errors.sourceUnavailable');
      case 'notFound':
        return t('errors.notFound');
      case 'quotaExceeded':
        return t('quotaEmpty');
      case 'invalidInput':
      case 'failed':
        return t('errors.failed');
    }
  }

  async function send(rawText: string) {
    const text = rawText.trim();
    if (!threadId || status !== 'ready' || streaming || !text) return;
    if (isQuotaBlocked(allowance, quotaExceeded)) return;

    const tempId = `temp-${Date.now()}`;
    const assistantId = `live-${Date.now()}`;
    const createdAt = new Date().toISOString();
    setInput('');
    setNotice(null);
    setAnnouncement('');
    setStreaming(true);
    nearBottomRef.current = true;
    setMessages((previous) => [
      ...previous,
      { id: tempId, role: 'user', segments: [{ type: 'text', text }], createdAt },
      { id: assistantId, role: 'assistant', segments: [], createdAt, streaming: true },
    ]);
    track('mentor_message_sent');

    const controller = new AbortController();
    abortRef.current = controller;
    let settled = false;
    let startedUserId = tempId;
    let sawText = false;

    try {
      const response = await fetch(`/api/mentor/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const parsed = mentorErrorBodySchema.safeParse(body);
        if (parsed.success && parsed.data.allowance) setAllowance(parsed.data.allowance);
        const code = parsed.success ? parsed.data.code : 'failed';
        settled = true;
        setMessages((previous) =>
          previous.filter((message) => message.id !== tempId && message.id !== assistantId),
        );
        setInput(text);
        if (code === 'quotaExceeded') {
          setQuotaExceeded(true);
        } else {
          setNotice({ text: errorText(code) });
        }
        return;
      }

      if (!response.body) throw new Error('missing-mentor-stream');
      const reader = createMentorEventReader();
      const streamReader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let answerText = '';

      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;
        for (const event of reader.push(value)) {
          if (event.type === 'started') {
            startedUserId = event.userMessageId;
            setAllowance(event.allowance);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === tempId ? { ...message, id: event.userMessageId } : message,
              ),
            );
            continue;
          }
          if (event.type === 'segment') {
            if (event.segment.type === 'text') answerText += event.segment.text;
            if (event.segment.type === 'text' && event.segment.text.trim()) sawText = true;
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      segments: appendAnswerSegment(message.segments, event.segment),
                    }
                  : message,
              ),
            );
            continue;
          }
          if (event.type === 'done') {
            settled = true;
            setAllowance(event.allowance);
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      id: event.messageId,
                      streaming: false,
                      note: event.finish === 'aborted' ? t('notices.stopped') : undefined,
                    }
                  : message,
              ),
            );
            if (event.finish === 'aborted') setNotice({ text: t('notices.stopped') });
            else setAnnouncement(answerText.trim());
            continue;
          }

          settled = true;
          if (event.allowance) setAllowance(event.allowance);
          if (event.refunded) {
            setMessages((previous) =>
              previous.filter(
                (message) => message.id !== startedUserId && message.id !== assistantId,
              ),
            );
            setInput(text);
            setNotice({ text: t('notices.refunded') });
          } else {
            setMessages((previous) =>
              previous.map((message) =>
                message.id === assistantId
                  ? { ...message, streaming: false, note: t('notices.partial') }
                  : message,
              ),
            );
            setNotice({ text: t('notices.partial') });
          }
        }
      }

      if (!settled) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, note: t('notices.network') }
              : message,
          ),
        );
        setNotice({ text: t('notices.network'), retryText: text });
      }
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === 'AbortError';
      if (isAbort && !sawText) {
        // Stopped before any text: the server removes the turn and refunds it, so mirror that here.
        const wasCharged = startedUserId !== tempId;
        setMessages((previous) =>
          previous.filter((message) => message.id !== startedUserId && message.id !== assistantId),
        );
        setInput(text);
        if (wasCharged) {
          setAllowance((previous) =>
            previous && previous.remaining !== null
              ? {
                  ...previous,
                  remaining: previous.remaining + 1,
                  used: Math.max(0, previous.used - 1),
                }
              : previous,
          );
        }
        setNotice({ text: t('notices.refunded') });
      } else if (isAbort) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, note: t('notices.stopped') }
              : message,
          ),
        );
        setNotice({ text: t('notices.stopped') });
      } else {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? { ...message, streaming: false, note: t('notices.network') }
              : message,
          ),
        );
        setNotice({ text: t('notices.network'), retryText: text });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function loadOlder() {
    const first = messages[0];
    if (!threadId || loadingOlder || !first) return;
    const element = scrollRef.current;
    restoreRef.current = element ? { height: element.scrollHeight, top: element.scrollTop } : null;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const result = await loadOlderMentorMessages({
        threadId,
        before: { createdAt: first.createdAt, id: first.id },
      });
      if (!result.ok) {
        restoreRef.current = null;
        setOlderError(true);
        return;
      }
      setMessages((previous) => [...result.messages.map(toChatMessage), ...previous]);
      setHasOlder(result.hasOlder);
    } catch {
      restoreRef.current = null;
      setOlderError(true);
    } finally {
      setLoadingOlder(false);
    }
  }

  function suggestionText(suggestion: MentorSuggestion): string {
    return tSuggestions(suggestion.key, suggestion.params);
  }

  const title = mentorName || t('sheetTitle');
  const quotaBlocked = isQuotaBlocked(allowance, quotaExceeded);
  const canSend = status === 'ready' && !quotaBlocked && input.trim().length > 0;
  const showCounter = input.length >= Math.floor(MAX_MENTOR_QUESTION_CHARS * 0.8);
  const showSuggestions =
    status === 'ready' && messages.length === 0 && !quotaBlocked && suggestions.length > 0;

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-border flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <p className="text-h3 truncate">{title}</p>
          <QuotaSummary allowance={allowance} />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('close')}
          onClick={() => onOpenChange(false)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
      >
        {status === 'loading' ? <MentorThreadSkeleton /> : null}

        {status === 'error' ? (
          <div className="flex flex-col items-start gap-3 py-6" role="alert">
            <p className="text-body text-text-muted">{t('errors.open')}</p>
            <Button type="button" variant="outline" onClick={() => void startLoad()}>
              {t('retry')}
            </Button>
          </div>
        ) : null}

        {status === 'ready' ? (
          <div className="flex min-w-0 flex-col gap-3">
            {hasOlder ? (
              <div className="flex justify-center">
                {loadingOlder ? (
                  <Skeleton className="h-9 w-40" />
                ) : (
                  <Button type="button" variant="ghost" onClick={() => void loadOlder()}>
                    {t('loadOlder')}
                  </Button>
                )}
              </div>
            ) : null}
            {olderError ? (
              <p className="text-small text-danger" role="alert">
                {t('errors.history')}
              </p>
            ) : null}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} threadId={threadId ?? ''} />
            ))}
            {showSuggestions ? (
              <SuggestionChips
                suggestions={suggestions}
                onSelect={(text) => void send(text)}
                suggestionText={suggestionText}
              />
            ) : null}
            {notice ? (
              <NoticeRow
                text={notice.text}
                onRetry={notice.retryText ? () => void send(notice.retryText ?? '') : undefined}
              />
            ) : null}
            {quotaBlocked && allowance ? <QuotaEmptyNotice resetsAt={allowance.resetsAt} /> : null}
          </div>
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
        className="border-border flex flex-col gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && isDesktop) {
                event.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            maxLength={MAX_MENTOR_QUESTION_CHARS}
            disabled={quotaBlocked || status !== 'ready'}
            aria-label={t('placeholder')}
            placeholder={t('placeholder')}
            className="max-h-32 min-h-11 resize-none"
          />
          {streaming ? (
            <Button
              type="button"
              variant="outline"
              onClick={stop}
              aria-label={t('stop')}
              className="shrink-0"
            >
              <SquareIcon aria-hidden="true" />
              {t('stop')}
            </Button>
          ) : (
            <Button type="submit" disabled={!canSend} className="shrink-0">
              <SendIcon aria-hidden="true" />
              {t('send')}
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-text-muted">
            {quotaBlocked ? t('inputDisabled') : t('hint')}
          </p>
          {showCounter ? (
            <p className="text-caption text-text-muted tabular-nums">
              {t('charCount', { used: input.length, max: MAX_MENTOR_QUESTION_CHARS })}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );

  if (isDesktop === undefined) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[min(85dvh,720px)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{t('sheetDescription')}</DialogDescription>
          {panel}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex flex-col gap-0 p-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-[100dvh] data-[vaul-drawer-direction=bottom]:max-h-[100dvh] data-[vaul-drawer-direction=bottom]:rounded-none data-[vaul-drawer-direction=bottom]:border-t-0 [&>div:first-child]:hidden">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">{t('sheetDescription')}</DrawerDescription>
        {panel}
      </DrawerContent>
    </Drawer>
  );
}

function MentorThreadSkeleton() {
  const t = useTranslations('mentor');
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={t('loadingAria')}
      className="flex flex-col gap-3 py-2"
    >
      <p className="text-small text-text-muted">{t('loading')}</p>
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="ml-auto h-12 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function TypingIndicator() {
  const t = useTranslations('mentor');
  return (
    <p className="text-small text-text-muted animate-pulse" aria-hidden="true">
      {t('typing')}
    </p>
  );
}

function MessageBubble({ message, threadId }: { message: MentorChatMessage; threadId: string }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="bg-primary text-primary-fg text-reading max-w-[85%] min-w-0 rounded-[var(--radius-card)] px-3 py-2 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
          {plainText(message.segments)}
        </p>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface-2 max-w-[95%] min-w-0 rounded-[var(--radius-card)] border px-3 py-2">
      {message.segments.length > 0 ? (
        <MentorAnswer segments={message.segments} threadId={threadId} />
      ) : null}
      {message.streaming && message.segments.length === 0 ? <TypingIndicator /> : null}
      {message.note ? <p className="text-caption text-text-muted mt-1">{message.note}</p> : null}
    </div>
  );
}

function SuggestionChips({
  suggestions,
  onSelect,
  suggestionText,
}: {
  suggestions: MentorSuggestion[];
  onSelect: (text: string) => void;
  suggestionText: (suggestion: MentorSuggestion) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion) => {
        const text = suggestionText(suggestion);
        return (
          <Button
            key={`${suggestion.key}-${JSON.stringify(suggestion.params)}`}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-11 max-w-full text-left whitespace-normal"
            onClick={() => onSelect(text)}
          >
            {text}
          </Button>
        );
      })}
    </div>
  );
}

function NoticeRow({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTranslations('mentor');
  return (
    <div className="border-danger/30 bg-danger/5 flex flex-col items-start gap-2 rounded-[var(--radius-card)] border p-3">
      <p className="text-small text-text-muted">{text}</p>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      ) : null}
    </div>
  );
}
