# Rencana orkestrasi — Unbookin

Koordinator: Claude Code (Opus 5.5). Worker: OpenCode dengan rantai model cadangan otomatis
(`_orchestration/opencode-chain.sh`; pindah ke model berikutnya bila kena kuota/limit).

| Rantai | Urutan model |
| --- | --- |
| Ringan | DeepSeek V4.1 Flash Free (OpenCode) → GLM-5.3-Flash Free (OpenCode) → Claude Sonnet 5.5 Low (9Router) → DeepSeek V4.1 Flash Free (9Router) → GLM-5.3-Flash (9Router) → GPT 6 Luna (9Router) → GLM-5.3-Flash (Z.ai) |
| Berat | DeepSeek V4.1 Flash Free (OpenCode) → GPT 6.1 Sol (9Router) |

Setiap worker bekerja di git worktree sendiri (`../UnBookin-wt/<tugas>`) dengan daftar file yang boleh diubah.
Koordinator meninjau diff, menjalankan `pnpm lint && pnpm typecheck && pnpm test`, lalu merge ke `main`.
Paralel maksimal 2 (RAM 24 GB, dipakai bersama sesi lain).

## M0 — Fondasi

| Gelombang | Tugas | Rantai | Isi | File yang dimiliki |
| --- | --- | --- | --- | --- |
| W0 | `m0-bootstrap` (koordinator) | — | Next.js 16 + Tailwind 4 + TS strict, skrip `typecheck` | selesai |
| W1 | `m0-tooling` | ringan | Prettier, Vitest, Playwright (viewport iPhone), skrip §CLAUDE.md, `.env.example` §16, next-intl + `src/messages/id.json`, Sentry & PostHog (diam bila env kosong), header keamanan | config root, `src/i18n/**`, `src/messages/**`, `src/instrumentation*`, `src/lib/analytics/**` |
| W2 | `m0-ui` | ringan | Token §12 di `globals.css`, font Plus Jakarta Sans, tema terang/gelap/sistem, shadcn dasar, `BottomNav`/`TopBar`/`Sheet`, halaman `/dev/ui` | `src/app/globals.css`, `src/components/**`, `src/app/dev/**`, `src/app/(app)/layout.tsx`, `components.json` |
| W2 | `m0-db` | berat | Drizzle + skema §6 (semua tabel, indeks, pgvector, HNSW), migrasi awal, kerangka seed | `src/db/**`, `drizzle/**`, `drizzle.config.ts`, `scripts/seed*` |
| W3 | `m0-auth` | berat | Auth.js v5: Google + magic link Resend, sesi 30 hari, `requireUser()`, role admin dari `ADMIN_EMAILS`, halaman `/masuk` | `src/lib/auth*.ts`, `src/app/(auth)/**`, `src/app/api/auth/**`, `src/proxy.ts` |

Gerbang M0: `/dev/ui` tampil benar di 375px terang & gelap, login Google berhasil, lint/typecheck/test hijau.

Milestone berikutnya (M1–M10, PRD §15) direncanakan setelah M0 lolos gerbang.
