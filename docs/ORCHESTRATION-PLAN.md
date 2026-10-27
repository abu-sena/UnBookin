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
- Worktree `codex/m3-library` dipertahankan karena aplikasi menolaknya untuk
  diarsipkan sebagai checkout utama chat. Direktori data sesi worker di
  `../UnBookin-wt/_orchestration/data/` juga dipertahankan: penghapusan ditolak
  pemeriksaan otomatis dengan alasan `blocked by policy`. Koordinator tidak
  menyalin berkas autentikasi ke direktori ini. Server sementara worktree sudah
  dihentikan; pratinjau memakai checkout asal pada `http://localhost:3000/dev/ui`.

## Pipeline M3 — 27 Oktober 2026

Founder telah menyetujui rencana unggah dan ingest. Pekerjaan dilanjutkan oleh
worker OpenCode secara berurutan dengan fallback pekerjaan ringan yang tercatat
di atas. Worktree aktif `codex/m3-library` dipakai kembali; setiap tugas memiliki
direktori data sesi dan kepemilikan berkas tersendiri. RAM tersedia sekitar 10 GB
dari 24 GB saat pemeriksaan, sehingga `MAX_PARALLEL=1` tetap berlaku.

| Urutan | Tugas | Kepemilikan utama | Gerbang |
| --- | --- | --- | --- |
| 1 | Penyimpanan R2, validasi input dan hak akses, pembacaan paket/kuota | `lib/storage`, `lib/billing/source-quota`, kontrak `lib/sources`, dependensi dan `.env.example` | Tes kunci objek, signed URL, pembatasan stream, paket dan batas bulan |
| 2 | Ekstraksi PDF/EPUB/URL/teks, chunk dan referensi halaman | `lib/ingest/extract`, `chunk`, `safe-url`, fixture ingest | PDF sintetis 200 halaman, urutan EPUB, SSRF/redirect/DNS, batas ukuran dan halaman |
| 3 | Server Actions, embedding OpenRouter, Inngest, progres/coba ulang/penghapusan | `lib/sources` backend, `lib/ai`, `inngest`, route API terkait | Otorisasi pemilik, idempotensi, tidak memotong kuota saat ingest, output embedding valid |
| 4 | Lembar unggah, bilah progres dan pembatalan, layar proses, integrasi pustaka | komponen unggah dan navigasi, rute sumber/proses, pesan dan showcase | Alur unggah, error/ulang/hapus, 375px terang/gelap, pemeriksaan lengkap |

Semua file sumber tetap privat. Event/hasil langkah Inngest hanya membawa ID dan
metadata, bukan isi bacaan. Model embedding dibaca dari `ai_task_configs`, bukan
ID model yang ditulis di kode; kunci platform digunakan untuk embedding. Sumber
yang selesai ingest meneruskan event `unbook/requested` ke M4, tanpa mengaku bahwa
modul belajar sudah selesai dibuat.

Kredensial R2/Inngest/OpenRouter dan model embedding belum terisi di lingkungan
lokal saat pemeriksaan; Docker juga belum berjalan. Tes parser nyata dan tes
integrasi tiruan tetap dijalankan. Gerbang ingest dengan layanan nyata harus
dilaporkan terpisah dan tidak dianggap lulus hanya berdasarkan mock.

Founder memilih untuk melanjutkan kode dan panduan konfigurasi dahulu. Docker
lokal kemudian dijalankan; database uji terpisah `unbookin_m3_test_20261027`
dibuat di container dev dan dimigrasikan tanpa mengubah database aplikasi.
Fondasi `1b1f327` lolos pemeriksaan ulang lint/typecheck dan 42 tes terarah;
pemeriksaan tambahan dengan SQL nyata membuktikan isolasi reservasi, batas
bulan, paket aktif, pengecualian retry, dan pgvector 1.536 dimensi.

Model gratis OpenCode/DeepSeek via 9Router kemudian mencapai limit, dan Sonnet
Low melaporkan reset sekitar 28 jam. Alias GLM Z.ai yang tersedia dikoreksi ke
`9router/glm/glm-5.3-flash`; model ini diuji dapat merespons. Worker berikutnya
memakai konfigurasi proses sementara untuk reasoning rendah dan output 16k,
tanpa mengubah konfigurasi global pengguna. Model GLM Free via 9Router tidak
tersedia dalam katalog layanan yang diperiksa.

Dengan sekitar 8 GB RAM masih tersedia, parser dan backend core yang tidak
berbagi kepemilikan dijalankan dalam dua worktree terpisah. `MAX_PARALLEL=2`
untuk gelombang ini (masing-masing tes dibatasi dua worker); integrasi Inngest
dan UI tetap menunggu kontrak keduanya lolos. Worktree backend memakai junction
dependensi yang sudah terpasang dengan versi lockfile identik, tanpa instalasi
atau perubahan paket selama worker berjalan.

### Gerbang fondasi gabungan

Commit parser `dc5bcbf` serta backend `1e823dc` dan perbaikan `1a12a8b`
digabung pada `5fc7341`. Pemeriksaan koordinator: 51 berkas/372 tes lulus,
lint, typegen, dan typecheck lulus. PDF sintetis 200 halaman diekstrak menjadi
chunk dengan referensi hingga halaman 200; EPUB dan PDF tanpa teks juga diuji
dengan parser nyata. Uji SQL ulang membuktikan 4 reservasi bersamaan hanya
menerima 2 pada paket Free, tanpa memotong kuota. Query progres diuji dengan
dua pengguna PostgreSQL nyata: akun lain tidak menerima judul/status pemilik.

Integrasi Inngest dan UI kini berjalan di dua worktree dengan kepemilikan
terpisah. Review parser meminta pemetaan bab/fallback dan pembagian teks
Unicode panjang dilengkapi sebelum gerbang ingest akhir. Semua layanan
embedding dan penyimpanan uji memakai HTTP tiruan lokal; Inngest Dev Server
dan PostgreSQL lokal berjalan nyata. Kredensial production tetap tidak dipakai.

Pemanggilan pnpm otomatis oleh worker sempat menghapus node_modules.
Koordinator menghentikan worker, memulihkan dependensi dari lockfile tanpa
mengubah paket, lalu melanjutkannya. Seluruh worker berikutnya wajib memakai
binary lokal langsung; pengelolaan dependensi hanya dilakukan koordinator.

### Pembaruan eksekusi M3 (27 Oktober 2026)

Untuk kelanjutan ini, daftar ringan dari founder berlaku tepat sesuai urutan:
DeepSeek Free OpenCode → GLM Free OpenCode → Sonnet Low 9Router → DeepSeek Free
9Router → GLM Free 9Router → GLM Z.ai. Alias yang tersedia untuk pilihan
terakhir adalah `9router/glm/glm-5.3-flash`. Cadangan worker Codex secara
 eksplisit ditolak founder. Pengecekan ulang pada sore hari masih menunjukkan
empat pilihan awal dibatasi kuota dan pilihan kelima tidak tersedia.

Tugas besar dipecah menjadi tugas kecil: layanan ingest privat, perbaikan
fixture lifecycle, kartu dan polling progres, halaman status, konfirmasi
hapus, serta integrasi pustaka. Koordinator menguji hasil secara mandiri.
Pipeline lokal memakai PostgreSQL dan Inngest nyata dengan penyimpanan serta
embedding HTTP sintetis; kredensial cloud tidak digunakan untuk fixture.

Drive C hampir penuh sempat menggagalkan alokasi memori dan merusak cache
 dependensi. Cache build dipindahkan secara dapat dipulihkan ke drive D.
Dependensi dipasang ulang dari lockfile tanpa perubahan versi; satu paket
Sentry yang masih kosong dipulihkan dari tarball resmi dengan SHA-512 yang
sama dengan lockfile. Tidak ada proteksi keamanan yang dimatikan. Sementara
server pengujian aktif, jumlah worker dibatasi sesuai memori virtual tersedia.

Founder mengizinkan deployment sebelum berhenti dan meminta batas berhenti
pada sisa kuota Codex 10%. Konfigurasi produksi yang dibaca hanya nama
variabelnya: kunci R2, Inngest, dan OpenRouter belum tersedia. Deployment
kode tetap dilaksanakan setelah pemeriksaan; aktivasi ingest produksi
memerlukan konfigurasi pada `docs/M3-SETUP.md`.
