# M3 — Source storage, validation and entitlement

This document covers the storage/quota foundation used by the source upload and
ingest work (E2-01, E2-04). It does not add UI, Server Actions, Inngest
functions or database migrations.

## Storage configuration

The app uses any S3-compatible object store (Cloudflare R2 is the recommended
provider). Set these server-only variables in `.env.local`; never commit their
values:

| Variable                | Required | Notes                                                          |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `S3_ENDPOINT`           | yes      | R2: `https://<account-id>.r2.cloudflarestorage.com`            |
| `S3_REGION`             | yes      | R2 uses `auto`; AWS uses the bucket region                     |
| `S3_BUCKET`             | yes      | Private bucket, e.g. `unbookin-sources`                       |
| `S3_ACCESS_KEY_ID`      | yes      | Token with object read/write inside this bucket only           |
| `S3_SECRET_ACCESS_KEY`  | yes      | Never logged, returned to the browser or put in error messages |

`.env.example` contains the same keys with empty values. Importing the storage
module with missing variables is safe; the first storage operation fails with
`storageUnavailable`.

Bucket setup requirements:

- Keep the bucket private. The app never creates download URLs for clients.
- Allow `PUT`, `HEAD`, `GET` and `DELETE` for the token on `sources/*`.
- If uploads come from a browser, allow the app origin in the bucket CORS
  policy for `PUT` with `content-type` and `content-length` headers.
- Do not expose the token through `NEXT_PUBLIC_*` variables.

## Object keys

Keys are generated on the server and never accepted from a client:

```text
sources/{userId}/{sourceId}/source.pdf
sources/{userId}/{sourceId}/source.epub
sources/{userId}/{sourceId}/source.txt
```

Both ids must be UUIDs. `createSourceObjectKey(userId, sourceId, type)` builds a
key; `isOwnedSourceObjectKey(key, userId, sourceId)` performs an exact ownership
check (lookalike, traversal and other-user keys are rejected);
`parseSourceObjectKey(key)` re-validates a key read back from the database.

Callers MUST authorize ownership (session user → source row) before calling any
storage function. Storage checks the key shape but does not read the database.

## Functions

All functions are server-only. They throw `SourceError` with a safe, client-safe
code from `src/lib/sources/errors.ts`.

```ts
createSourceUploadUrl(input: {
  userId: string;
  sourceId: string;
  type: 'pdf' | 'epub';
  mimeType: string;
  sizeBytes: number;
}): Promise<{ fileKey: string; uploadUrl: string; expiresIn: number }>;
```

- Upload-only presigned URL, valid for 5 minutes (`expiresIn` is always `300`).
- `mimeType` must match the type (`application/pdf` or
  `application/epub+zip`).
- `content-type` and `content-length` are signed where the provider supports
  it. The browser must send the same values it submitted, otherwise the upload
  is rejected by the provider.
- The URL is for one exact key. There is no public arbitrary-key signing API.

```ts
headSourceObject(fileKey: string): Promise<{ sizeBytes: number; mimeType: string }>;
readSourceObject(fileKey: string, maxBytes: number): Promise<Uint8Array>;
putSourceText(fileKey: string, text: string): Promise<void>;
deleteSourceObject(fileKey: string): Promise<void>;
```

- `headSourceObject` returns the provider size and MIME type. A missing object
  raises `notFound`.
- `readSourceObject` enforces `maxBytes` twice: from `Content-Length` and while
  consuming the stream. It aborts/destroys the response when the limit is
  exceeded, so a lying header cannot cause an unbounded read.
- `putSourceText` writes a `text/plain; charset=utf-8` object and only accepts a
  `source.txt` key. URL sources should store fetched plain text this way.
- `deleteSourceObject` succeeds when the object is already absent.
- SDK failures are converted to safe codes; raw vendor messages, keys and
  source text never reach the caller.

## Quota and entitlement

`getSourceAllowance(userId, now = new Date())` in
`src/lib/billing/source-quota.ts` returns:

```ts
{
  planCode: 'free' | 'pro_monthly' | 'pro_yearly' | 'byok_monthly' | 'byok_yearly';
  limits: PlanLimits;
  period: string;        // local YYYY-MM, e.g. 2026-11
  unbooksUsed: number;
  unbooksPending: number;
  remaining: number;     // never negative
}
```

Resolution order:

1. Profile timezone (invalid/missing → `Asia/Jakarta`).
2. Active subscription where `period_start <= now < period_end`.
3. Active plan row (including `is_active`). A missing/inactive subscription plan
   falls back to the active `free` plan; no free plan configured raises
   `configurationMissing`.
4. `usage_counters` for the local month and the user's own pending Unbooks
   (`queued`, `outlining`, `generating`).

Limits are always read from the `plans` table and validated with
`PlanLimits`; no prices or limits are hardcoded. `unbooksPerMonth = null` means a
fair-use ceiling of `unbooksFairUse`. No usage row is written here: quota is
charged only when an Unbook finishes.

`getSourceAllowance` accepts an optional internal third argument:

```ts
getSourceAllowance(userId, now, {
  database?: SourceQuotaDatabase; // test injection
  excludeUnbookId?: string;       // retry: do not count this pending Unbook
});
```

Pure helpers are exported for tests and ingest:

- `getLocalMonthPeriod(now, timeZone)` — local calendar month.
- `getUnbookCapacity(limits)` / `getRemainingUnbooks(limits, used, pending)`.
- `estimatePageCountFromWords(wordCount)` — `ceil(words / 300)`.
- `validateSourceFileSize(limits, sizeBytes)` — inclusive max; `fileTooLarge`.
- `validateSourcePageCount(limits, pageCount)` — inclusive max; `pagesExceeded`.

The last two run before an Unbook is queued, using limits fetched from the
database, and throw safe errors for the UI.

## Safe error codes

`SourceErrorCode` is a closed union: `invalidInput`, `rightsRequired`,
`fileType`, `fileTooLarge`, `pagesExceeded`, `quotaExceeded`,
`storageUnavailable`, `jobsUnavailable`, `embeddingUnavailable`, `invalidUrl`,
`fetchFailed`, `noText`, `notFound`, `processingFailed`,
`configurationMissing`.

`toSourceErrorCode(error)` never returns vendor text. Use
`SourceActionResult<T>` (`{ ok: true, data } | { ok: false, error }`) at action
boundaries.

## Input schemas

`src/lib/sources/schema.ts` is client-safe and shared by forms and Server
Actions:

- Titles are trimmed, 1–220 characters.
- Interest slugs are 1–100 characters.
- File names are 1–255 characters, have no path separators, and must agree with
  the MIME type: `.pdf` + `application/pdf`, `.epub` +
  `application/epub+zip`.
- URLs must be `http`/`https`, have a host and no username/password. DNS/network
  checks happen later during ingest.
- Pasted text is non-empty and capped at 300,000 characters / 900,000 UTF-8
  bytes so the 1 MB Server Action body limit is safe.
- `rightsConfirmed` must be the literal `true`.
- Client input is strict: unknown keys (including `userId`) are rejected.

## Limitations / follow-ups

- No ingest, extraction, OCR, chunking or embedding is implemented here. Scanned
  PDFs without text still need the E2-01 AC5 message.
- No multipart upload; a single presigned `PUT` is assumed. Very large files on
  unstable mobile networks may need multipart in a later milestone.
- No malware scanning, retention job or lifecycle rule is configured here.
- Real R2/S3 integration is not exercised by unit tests (the SDK is mocked).
  Configure a development bucket and verify CORS/credentials before the upload
  UI ships.
- `S3_FORCE_PATH_STYLE` is not exposed; if a self-hosted S3 provider requires
  path-style addressing, add it deliberately with a compatibility test.
