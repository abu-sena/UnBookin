'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sourceActionAdapter,
  type SourceUploadAdapter,
  type SourceUploadContextState,
} from './source-action-adapter';
import { SourceUploadContext } from './upload-trigger';
import { UploadSheet } from './upload-sheet';

type SourceUploadProviderProps = {
  children: React.ReactNode;
  adapter?: SourceUploadAdapter;
  onNavigate?: (unbookId: string) => void;
};

export function SourceUploadProvider({
  children,
  adapter = sourceActionAdapter,
  onNavigate,
}: SourceUploadProviderProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contextState, setContextState] = useState<SourceUploadContextState>({ status: 'idle' });
  const [, startTransition] = useTransition();
  const loadingRef = useRef(false);

  function loadContext() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setContextState({ status: 'loading' });
    startTransition(async () => {
      try {
        const result = await adapter.getContext();
        setContextState(
          result.ok
            ? { status: 'ready', data: result.data }
            : { status: 'error', error: result.error },
        );
      } catch {
        setContextState({ status: 'error', error: 'processingFailed' });
      } finally {
        loadingRef.current = false;
      }
    });
  }

  function openUpload() {
    setOpen(true);
    if (contextState.status === 'idle') loadContext();
  }

  function handleUploaded(unbookId: string) {
    setOpen(false);
    setContextState({ status: 'idle' });
    if (onNavigate) {
      onNavigate(unbookId);
      return;
    }
    router.push(`/unbook/${unbookId}`);
  }

  return (
    <SourceUploadContext.Provider value={{ openUpload }}>
      {children}
      <UploadSheet
        open={open}
        adapter={adapter}
        contextState={contextState}
        onRetryContext={loadContext}
        onClose={() => setOpen(false)}
        onUploaded={handleUploaded}
      />
    </SourceUploadContext.Provider>
  );
}
