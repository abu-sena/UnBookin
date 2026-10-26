# M3 — Backend core: authenticated sources and embedding gateway

This module implements the authenticated source backend (E2-01) and the
embedding task gateway, independent of the PDF/EPUB parser work. It adds no UI,
no ingest function and no database migration; the follow-up integration task
registers the `ingest-source` function and the Inngest serve route.

## Export contract (for the next UI/ingest task)

### Server Actions — `src/lib/sources/actions.ts`

Every action authenticates via `requireUser('/library')` BEFORE any
`try/catch` (Next redirects are never swallowed), re-validates the unknown
client input with the strict shared Zod schemas (a forged `userId` key is
rejected), returns `SourceActionResult<T>` (`{ ok: true, data } | { ok: false,
error }`) with a safe error code only, and calls `revalidatePath('/library')`
after a relevant mutation.

| Action | Input | Result data |
| --- | --- | --- |
| `prepareSourceUpload` | `SourceFileUploadInput` | `{ sourceId, unbookId, uploadUrl, mimeType }` |
| `completeSourceUpload` | `{ sourceId }` | `{ unbookId }` |
| `createTextSource` | `SourceTextInput` | `{ unbookId }` |
| `createUrlSource` | `SourceUrlInput` | `{ unbookId }` |
| `cancelSourceUpload` | `{ sourceId }` | `{ cancelled: true }` |
| `retrySourceProcessing` | `{ unbookId }` | `{ unbookId }` |
| `deleteMyUnbook` | `{ unbookId }` | `{ deleted: true }` |
| `getSourceUploadContext` | — | `SourceUploadContext` |

A rights checkbox failure is returned as `rightsRequired` (E2-01 AC2); other
validation failures are `invalidInput`.

### Server queries — `src/lib/sources/queries.ts`

- `getMyUploadContext(): Promise<SourceUploadContext>` — authenticates first;
  active interests (`slug`, `name`) plus `getSourceAllowance`.
- `getMySourceProgress(unbookId): Promise<SourceProgress | null>` —
  authenticates first; `null` for unknown or not-owned ids.
- `loadSourceProgressForUser(userId, unbookId, database?)` — internal helper
  taking the AUTHENTICATED id; used by `GET /api/sources/[unbookId]`. The base
  `unbooks` row is authorized with BOTH `unbooks.id` and `unbooks.user_id` in
  the WHERE (the left-join source predicate alone is not authorization).
  Client code can never pass a user id through these functions.

`SourceProgress` (never contains raw text, file keys, URLs or vendor errors):
`{ unbookId, title, sourceId, sourceStatus, unbookStatus, stage, progressPct,
embeddedChunks, totalChunks, errorCode }`.

- `stage` is the controlled union `uploading | reading | chunking | embedding |
  ingested | failed | outlining | generating | ready`. TERMINAL statuses are
  decided first (`unbooks.status = ready` → `ready`; unbook or source `failed`
  → `failed`) so a stale `current_stage` can never make a finished flow appear
  perpetually processing; a parseable nonterminal `unbooks.current_stage` value
  then wins, unknown DB strings are re-derived from the persisted statuses
  (`deriveProgressStage`).
- `embeddedChunks`/`totalChunks` come from real `source_chunks` rows
  (non-null embedding count / total count).
- `errorCode` is shown only for failed flows; an unknown stored string maps to
  `processingFailed`, known safe codes pass through.

### API route — `src/app/api/sources/[unbookId]`

`GET` authenticates with `getCurrentUser()` first (plain 401, no redirect),
treats an invalid or not-owned id as an indistinguishable 404, and every
response (200/401/404/503) is `Cache-Control: private, no-store`. 404 is
reserved for invalid/not-owned/missing rows; a transient internal query
failure is a safe, retryable 503 `processingFailed` so the polling UI never
misreads an outage as deletion. No raw detail is ever returned. The route
exports NO route segment config: with Cache Components (`dynamic` is removed
in Next 16) the auth session access already marks the handler request-time.

## State machine and locking rules (integration MUST follow these)

States live on two rows. `sources.status` uses the existing enum (`uploaded`,
`extracting`, `ready`, `failed`); `unbooks.status` the existing enum (`queued`,
`outlining`, `generating`, `ready`, `failed`) with `current_stage` text.

| Flow | From | To |
| --- | --- | --- |
| `prepareSourceUpload` | (new) | source `uploaded`, unbook `queued` + stage `uploading` |
| `completeSourceUpload` | stage `uploading` + `queued` | stage `reading` (claimed UPDATE, idempotent when 0 rows; `cancelling` is never a submitted success and sends no job) |
| `createTextSource` / `createUrlSource` | (new) | source `uploaded`, unbook `queued` + stage `reading`, event after commit |
| queue send failure (any flow) | only the still-pre-send pair (source `uploaded`, unbook `queued` + stage `reading`, source owned by the unbook) | source `failed` + safe `error_code`, unbook `failed` + stage `failed` (recoverable via retry); ready/failed sources, progressed stages, retried work and deleted rows are never overwritten or resurrected (`markQueueFailed` guards) |
| `cancelSourceUpload` | only `queued` + stage `uploading` | claim stage `cancelling` atomically under the source lock BEFORE the storage delete (storage failure restores `uploading` and keeps all references), then rows deleted (unbook explicitly, then chunks, then source) |
| `retrySourceProcessing` | only unbook `failed` | unbook `queued` + stage `reading` + `progress_pct = 0`; failed source back to `uploaded` with cleared code |
| `deleteMyUnbook` | any state | storage first, then unbook + chunks + source (source only when no OTHER unbook references it) |

**Locking order** (never deviate):

1. Capacity flows (prepare, retry) lock the user's `users` row `FOR UPDATE`
   first, then run `getSourceAllowance(..., { database: tx })` inside that
   transaction. Pending work reserves capacity; usage counters are NEVER
   incremented or decremented at upload/ingest/delete (quota is charged only
   when an Unbook finishes, PRD 7.5).
2. All other flows lock the owned `sources` row `FOR UPDATE` first.
3. `unbooks` and `source_chunks` rows are read/written only after the
   `sources` lock is held.

The ingest function must likewise lock the `sources` row before any pipeline
write and re-check row existence first (no source resurrection after delete).

Other invariants:

- No network request runs inside a DB transaction. The upload URL is signed
  BEFORE the reservation transaction; a signing failure leaves no rows.
- `completeSourceUpload` verifies `HEAD` MIME, the EXACT presigned
  `sources.size_bytes` (a different file is rejected even below the plan
  limit) and the CURRENT plan limits, then claims `uploading -> reading` with
  a guarded UPDATE, so repeated or concurrent completions cannot double-send.
- Text sources store plain text in `sources/{userId}/{sourceId}/source.txt`
  before the reservation. Compensation is scoped to the reservation only: a
  failed reservation deletes the unreferenced object, while a committed
  source keeps its raw text file after a queue failure so the retryable row
  stays usable. URL sources only store the validated http(s) URL (schema
  rejects credentials); the public fetch belongs to the background ingest.
- Deleting an already-missing object is idempotent success; when storage is
  unavailable the DB references are kept so the flow can be retried.
- The `source/deleted` cancellation event is best-effort: after the rows are
  gone, a failed send is never reported to the user; the ingest side must
  guard every write with existence checks.

## Events — `src/inngest/{client,events}.ts`

- Client: `new Inngest({ id: 'unbookin', isDev: approvedLocalDev })` — dev
  mode is decided EXPLICITLY, never by SDK `INNGEST_DEV` env fallback:
  production is always `isDev: false` (the future serve route therefore keeps
  signature verification even when `INNGEST_DEV=true` leaks in), development
  is `isDev: true` only with the explicit `INNGEST_DEV=1|true` local flag.
  Import/build-safe; the serve integration reuses this same client. No
  consumers are registered here and no serve route exists yet (next
  integration task).
- `sendSourceUploaded({ sourceId, userId, unbookId }, { eventId? })` →
  `source/uploaded`. Default id `source-uploaded:{sourceId}` (stable, so a
  repeated finalize cannot enqueue twice). Explicit retries MUST pass a
  distinct `eventId` (retrySourceProcessing sends
  `source-uploaded-retry:{unbookId}:{uuid}`).
- `sendSourceDeleted({ sourceId, userId, unbookId }, { eventId? })` →
  `source/deleted`, best-effort cancellation signal.
- Every send validates the SDK receipt: a RESOLVED send with an empty or
  malformed receipt (`ids: []` happens in unconfigured/offline dev fallback)
  is `jobsUnavailable`, never a silent success.
- Payloads carry UUIDs ONLY — no source text, file keys, URLs or vendor error
  detail ever enter the event stream or SDK logs.
- Configuration guard (`jobsUnavailable`): production requires
  `INNGEST_EVENT_KEY` (dev mode is never enabled there); local runs require an
  explicit `INNGEST_DEV=1` (or `true`) — otherwise events would be silently
  dropped, leaving Unbooks queued forever.

## Embedding gateway — `src/lib/ai/run-task.ts`

`runTask('embedding', { texts }, { userId })` → `{ embeddings, costUsd }`.

- Model read from the ACTIVE `ai_task_configs` row (`task = 'embedding'`),
  successful lookups cached max 5 minutes. NO model id literal and NO
  `EMBEDDING_MODEL` runtime shortcut in app code.
- Platform OpenRouter key only (`OPENROUTER_API_KEY`); BYOK/chat not built.
- Bounded batch: 1–16 texts (≤600 KB total). Request:
  `POST {OPENROUTER_BASE_URL}/embeddings` with `dimensions: 1536`,
  `HTTP-Referer: https://unbookin.com`, `X-Title: Unbookin`, timeout ≤ 30 s.
- Response contract (Zod + manual checks): exactly one entry per text, unique
  valid indexes, each vector 1536 finite numbers, reordered to input order.
  Violations, HTTP failures and transport/timeout failures are safe
  `SourceError`s (`embeddingUnavailable`; configuration problems are
  `configurationMissing`). A config-lookup DB outage is also sanitized to
  `embeddingUnavailable` — driver messages never escape `runTask`.
- Every run logs `ai_calls` metadata (tokens, cost, latency, status, safe
  error code) — never raw bodies, input text, keys or vendor messages.
  Embeddings have NO output tokens: `output_tokens` is 0 with usage (never
  the request-wide `total_tokens`) and null without. Usage metadata is
  validated before writing: token counts must be nonnegative integers, cost
  must be nonnegative, finite and within the `numeric(12,6)` range; invalid
  values are logged as null, not written. Cost absent → `null`.

## Seed / configuration — `src/db/embedding-config.ts`

`resolveEmbeddingModelFromEnv()` turns a non-empty, non-comment
`EMBEDDING_MODEL` value into the optional `ai_task_configs` embedding row
(`pnpm db:seed` upserts it; placeholder `maxOutputTokens: 1`). All other seed
data (plans, prices, interests, badges, missions) is preserved. Missing model
is a documented `configurationMissing` state, not an error.

## Environment

`.env.example` documents `INNGEST_DEV` for local runs. `INNGEST_EVENT_KEY` /
`INNGEST_SIGNING_KEY` are already listed; `EMBEDDING_MODEL` stays the founder
configuration entry point for the embedding row.

## Test coverage (vitest, `core-*.test.ts`)

- `tests/unit/sources/core-actions.test.ts` — auth before dependencies, forged
  `userId`/strict schemas, `rightsRequired` mapping, safe error mapping,
  revalidation, redirect propagation.
- `tests/unit/sources/core-store.test.ts` — sign-before-reserve, one
  transaction with users-row lock + serialized capacity check, quota/size/
  interest validation, reservation-scoped text compensation, queue-failure
  state guards.
- `tests/unit/sources/core-lifecycle.test.ts` — HEAD verification incl. exact
  presigned-size mismatch, idempotent finalize without double-send, no job
  for a cancelling source, cancel claim race (finalize winning ⇒ NO storage
  delete; claim before delete; storage-failure restore), retry only failed +
  serialized capacity with `excludeUnbookId`, deletion order and shared-source
  defence.
- `tests/unit/sources/core-progress.test.ts` — real Drizzle SQL recording:
  base-row authorization (`unbooks.id` AND `unbooks.user_id` with bound
  session identity), chunk counters, terminal-first stage/error mapping.
- `tests/unit/sources/core-route.test.ts` — 401/404/503/no-store behaviour,
  no removed `dynamic` segment config.
- `tests/unit/sources/core-events.test.ts` — DTO validation, env gating
  (no silent dev drops), receipt validation (`ids: []`/malformed ⇒
  `jobsUnavailable`), client constructor dev-mode guard
  (production+`INNGEST_DEV=true` stays production).
- `tests/unit/ai/core-run-task.test.ts` — config from DB only (no env
  shortcut), sanitized config-lookup driver errors, dimensions/index/finite
  checks, reordering, timeouts, safe codes, output tokens not double
  counted, invalid usage never written, log hygiene (no text/key), config
  caching.
- `tests/unit/db/embedding-config.test.ts` — pure helper behaviour.

Unit tests use purposeful transaction mocks (`core-fake-db.ts`) or real
Drizzle SQL recording (`core-recording-db.ts`); no real database, network or
parser modules are used.

## Gaps / follow-ups (owned by the integration task)

- Register the `ingest-source` Inngest function and `/api/inngest` serve
  route; PDF/EPUB parsing, URL fetching and chunking live there.
- Real R2/OpenRouter/Inngest connectivity is not exercised by unit tests.
- Multipart uploads, malware scanning and retention jobs stay future work.
