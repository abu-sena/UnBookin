'use client';

import { createContext, useContext } from 'react';

export type SourceUploadContextValue = { openUpload: () => void };

export const SourceUploadContext = createContext<SourceUploadContextValue | null>(null);

export function useSourceUpload(): SourceUploadContextValue | null {
  return useContext(SourceUploadContext);
}

type SourceUploadTriggerProps = React.ComponentProps<'button'>;

export function SourceUploadTrigger({ onClick, ...props }: SourceUploadTriggerProps) {
  const context = useSourceUpload();
  return (
    <button
      type="button"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        context?.openUpload();
      }}
    />
  );
}
