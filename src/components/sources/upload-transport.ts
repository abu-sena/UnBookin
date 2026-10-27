export type SourceFileTransferOptions = {
  url: string;
  file: File;
  mimeType: string;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
  createRequest?: () => XMLHttpRequest;
};

function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Upload cancelled', 'AbortError');
  }
  const error = new Error('Upload cancelled');
  error.name = 'AbortError';
  return error;
}

export function putSourceFile({
  url,
  file,
  mimeType,
  onProgress,
  signal,
  createRequest = () => new XMLHttpRequest(),
}: SourceFileTransferOptions): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<void>((resolve, reject) => {
    const request = createRequest();
    let settled = false;

    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      action();
    };

    function onAbort() {
      request.abort();
      finish(() => reject(abortError()));
    }

    request.open('PUT', url, true);
    request.setRequestHeader('Content-Type', mimeType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        finish(() => {
          onProgress(100);
          resolve();
        });
        return;
      }
      finish(() => reject(new Error('uploadFailed')));
    };
    request.onerror = () => finish(() => reject(new Error('uploadFailed')));
    request.onabort = () => finish(() => reject(abortError()));

    signal.addEventListener('abort', onAbort, { once: true });
    request.send(file);
  });
}
