import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/id.json';
import { ModuleReader } from '@/components/reader/module-reader';
import type { ReaderModuleProps } from '@/components/reader/reader-types';
import { CHUNK_ONE, MODULE_ID, NEXT_MODULE_ID, UNBOOK_ID, sampleContent } from './fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
  return {
    router,
    actions: {
      markModuleReading: vi.fn(),
      markModuleRead: vi.fn(),
      recordDeepestLayer: vi.fn(),
      saveChecklist: vi.fn(),
      createActionFromModule: vi.fn(),
      getSourceExcerpt: vi.fn(),
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }));
vi.mock('@/lib/learning/actions', () => mocks.actions);
vi.mock('@/components/module/concept-map-lazy', () => ({
  ConceptMapLazy: () => <div data-testid="concept-map" />,
}));
vi.mock('@/components/theme-toggle', () => ({
  ThemeToggle: () => <span data-testid="theme-toggle" />,
}));
vi.mock('@/components/layout/sheet', () => ({
  Sheet: ({
    open,
    onOpenChange,
    title,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={() => onOpenChange(false)}>
          Tutup
        </button>
        {children}
      </div>
    ) : null,
}));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
}

export { mocks };

export const baseReaderProps: ReaderModuleProps = {
  unbookId: UNBOOK_ID,
  moduleId: MODULE_ID,
  title: 'Pemimpin membangun sistem',
  content: sampleContent,
  status: 'not_started',
  deepestLayer: 'eli5',
  checklist: {},
  quizId: 'f6a7b8c9-0d1e-4f2a-9b3c-4d5e6f708192',
  quizQuestionCount: 6,
  reviewCardCount: 5,
  plannedActionId: null,
  nextModuleId: NEXT_MODULE_ID,
};

export function renderReader(overrides: Partial<ReaderModuleProps> = {}) {
  return render(
    <NextIntlClientProvider locale="id" messages={messages}>
      <ModuleReader {...baseReaderProps} {...overrides} />
    </NextIntlClientProvider>,
  );
}

export async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

export function triggerReaderEnd() {
  const instance = MockIntersectionObserver.instances.at(-1);
  instance?.callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    instance as unknown as IntersectionObserver,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  MockIntersectionObserver.instances.length = 0;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  window.localStorage.clear();
  delete document.documentElement.dataset.readingSize;
  mocks.actions.markModuleReading.mockResolvedValue({ ok: true, status: 'reading' });
  mocks.actions.markModuleRead.mockResolvedValue({
    ok: true,
    status: 'read',
    xpAwarded: true,
    cardsQueued: 2,
  });
  mocks.actions.recordDeepestLayer.mockResolvedValue({ ok: true, deepestLayer: 'practitioner' });
  mocks.actions.saveChecklist.mockResolvedValue({ ok: true, checklist: {} });
  mocks.actions.createActionFromModule.mockResolvedValue({
    ok: true,
    actionId: 'a7b8c9d0-1e2f-4a3b-8c4d-5e6f708192a3',
    created: true,
    dueAt: '2026-11-04T12:00:00.000Z',
  });
  mocks.actions.getSourceExcerpt.mockResolvedValue({
    ok: true,
    chunkId: CHUNK_ONE,
    pageFrom: 42,
    pageTo: 43,
    text: 'Kutipan sumber.',
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.readingSize;
  vi.unstubAllGlobals();
});

export { MockIntersectionObserver };
