# Rencana orkestrasi — Unbookin

Koordinator: Claude Code (Opus 5.5). Worker: OpenCode dengan rantai model cadangan otomatis
(`_orchestration/opencode-chain.sh`; pindah ke model berikutnya bila kena kuota/limit).

| Rantai | Urutan model |
| --- | --- |
| Ringan | DeepSeek V4.1 Flash Free (OpenCode) → GLM-5.3-Flash Free (OpenCode) → Claude Sonnet 5.5 Low (9Router) → DeepSeek V4.1 Flash Free (9Router) → GLM-5.3-Flash (9Router) → GPT 6 Luna (9Router) → GLM-5.3-Flash (Z.ai) |
| Berat | DeepSeek V4.1 Flash Free (OpenCode) → GPT 6.1 Sol (9Router) → GLM-5.3-Flash (9Router) → GLM-5.3-Flash (Z.ai) |

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

## Kelanjutan M3 — 26 Oktober 2026

M1 landing/daftar tunggu dan M2 onboarding/profil dasar telah digabung ke `main`.
M3 dikerjakan bertahap; keberadaan skema awal tidak berarti ingest sudah berfungsi.

Pekerjaan ringan memakai OpenCode dengan urutan fallback yang ditetapkan founder pada sesi ini:

1. DeepSeek V4.1 Flash Free (OpenCode Free).
2. GLM-5.3-Flash Free (OpenCode Free).
3. Claude Sonnet 5.5 Low (9Router).
4. DeepSeek V4.1 Flash Free (9Router).
5. GLM-5.3-Flash Free (9Router).
6. GLM-5.3-Flash (Z Ai).

Fallback berjalan saat kuota/rate limit; model yang tidak terdaftar pada konfigurasi
OpenCode dilaporkan tidak tersedia, tanpa menggantinya dengan model di luar daftar.
Setiap worker memakai worktree dan `XDG_DATA_HOME` tersendiri. Mesin memiliki RAM
sekitar 24 GB, tersedia sekitar 11 GB saat pemeriksaan, dan 12 prosesor logis.
Karena mesin dipakai bersama sesi lain, `MAX_PARALLEL=1`.

| Urutan | Tugas | Kepemilikan | Gerbang |
| --- | --- | --- | --- |
| 1 | E2-03 AC1–AC2: pustaka pribadi, pencarian judul, filter minat/status, progres baca modul | `src/lib/library/**`, `src/components/library/**`, rute `/library`, `tests/unit/library/**`; penambahan terarah pada pesan dan `/dev/ui` | Pemeriksaan isolasi pengguna, lint/typecheck/test, pratinjau 375px terang/gelap |
| 2 | E2-01, E2-02, E2-03 AC3: unggah, penyimpanan, ingest, status/coba ulang, penghapusan lengkap | Ditentukan setelah kontrak pipeline disetujui | Memerlukan persetujuan rencana pipeline sesuai `CLAUDE.md` dan konfigurasi R2/Inngest/OpenRouter untuk verifikasi integrasi nyata |

Tahap 1 tidak mengubah skema, harga, aturan kuota, atau data production. Progres
baca dihitung dari `module_progress.status = read`, bukan `unbooks.progress_pct`
yang digunakan pipeline. M3 baru selesai setelah seluruh AC E2 dan gerbang ingest
PDF 200 halaman dengan embedding terbukti; pustaka saja belum memenuhi gerbang itu.

### Hasil sesi

- E2-03 AC1–AC2 digabung ke `main` lokal melalui `b1f543b`; worker menghasilkan
  `a6378c6` dan perbaikan aksesibilitas `8f343cd`.
- Kedua tugas selesai dengan DeepSeek V4.1 Flash Free (OpenCode); fallback belum
  diperlukan. Model GLM Free melalui 9Router dan GLM melalui Z Ai belum terdaftar
  pada konfigurasi OpenCode yang diperiksa, sehingga tidak boleh diklaim siap.
- Koordinator memeriksa scope dan diff, lalu menjalankan ulang `pnpm lint`,
  `pnpm typecheck`, dan `pnpm test` pada hasil gabungan: 35 berkas, 150 tes lulus.
  Build produksi Next.js juga lulus pada worktree dengan kode hasil gabungan yang sama.
- Pratinjau komponen di `/dev/ui` diperiksa dengan browser pada 375px, tema terang
  dan gelap: tidak ada overflow horizontal atau error JavaScript. Kontras semua
  label status yang ditampilkan memenuhi AA setelah perbaikan. Bilah progres
  sekarang meneruskan nilainya ke Radix agar pembaca layar menerima `aria-valuenow`.
- Pengujian query menggunakan SQL Drizzle yang direkam, belum database nyata
  dengan sesi login. Belum ada deploy preview atau push production pada sesi ini.
- Berikutnya: E2-01, E2-02, dan E2-03 AC3. Rencana pipeline masih menunggu
  persetujuan sesuai `CLAUDE.md`; kredensial R2, Inngest, dan OpenRouter lokal
  belum terisi untuk pengujian integrasi nyata. Jangan menandai M3 selesai.
