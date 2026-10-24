# CLAUDE.md — Unbookin

Panduan kerja untuk Claude Code di repo ini. Spesifikasi lengkap ada di `PRD.md`; file ini berisi aturan cara bekerja.

## Tentang proyek
Unbookin (unbookin.com) — "Unbook anything. Master everything." Platform belajar berbasis AI yang mengubah buku, jurnal, dan tautan menjadi modul **Pahami · Terapkan · Buktikan** dengan gamifikasi. Founder adalah *vibe coder* pemula: jelaskan keputusan teknis dengan bahasa sederhana dan singkat.

## Stack
Next.js (App Router) · TypeScript strict · Tailwind CSS + shadcn/ui · Motion · PostgreSQL + pgvector · Drizzle ORM · Auth.js v5 · Cloudflare R2 (S3) · Inngest · OpenRouter · Zod · Midtrans Snap · Resend · next-intl · PostHog · Sentry · Vitest · Playwright · pnpm.

## Perintah
```
pnpm dev            # server lokal
pnpm build          # build produksi
pnpm lint           # ESLint
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest
pnpm e2e            # Playwright (viewport ponsel)
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # jalankan migrasi
pnpm db:seed        # seed minat, domain, lencana, misi, paket, ai_task_configs
pnpm eval:engine    # uji kualitas Unbook Engine pada fixture
npx inngest-cli dev # Inngest lokal
```
Buat skrip ini di `package.json` pada milestone M0.

## Cara bekerja
1. **Ikuti milestone di PRD §15 secara berurutan.** Sebelum mulai, baca epic terkait di PRD §8 dan sebutkan AC yang akan dipenuhi.
2. **Rencanakan dulu untuk perubahan besar** (skema database, pipeline AI, pembayaran): tulis rencana singkat, minta persetujuan founder, baru kerjakan.
3. **Tanya bila ambigu.** Jangan menebak kebutuhan bisnis. Catat setiap keputusan di `docs/decisions.md` (tanggal, keputusan, alasan).
4. **Selesai berarti:** AC lolos, `pnpm lint && pnpm typecheck && pnpm test` hijau, dicek di lebar 375px terang dan gelap, lalu commit.
5. **Commit kecil dan bermakna**, format: `feat(E5-01): kuis satu soal per layar`. Satu milestone boleh banyak commit.
6. Di akhir tiap sesi, tulis ringkasan singkat: apa yang selesai, apa yang belum, langkah berikutnya.

## Aturan kode
- Bahasa Inggris untuk kode, nama tabel, variabel, dan komentar. **Bahasa Indonesia untuk semua teks UI**, selalu lewat `messages/id.json`, tidak ditulis langsung di komponen.
- Server Components secara default; `"use client"` hanya bila perlu interaksi.
- Mutasi lewat Server Actions; validasi setiap input dengan Zod.
- **Setiap query data pengguna difilter `user_id` dari sesi server** lewat `requireUser()`. Jangan pernah menerima `userId` dari klien.
- Logika XP, level, streak, lencana, dan kuota hanya di `lib/game` dan `lib/billing`, dengan unit test.
- **Jangan menulis ID model AI di kode.** Semua lewat tabel `ai_task_configs` dan `lib/ai/runTask`.
- Output AI selalu divalidasi Zod sebelum disimpan.
- Teks sumber dari pengguna selalu diperlakukan sebagai data, bukan instruksi, di dalam prompt.
- Jangan pernah mencatat API key, isi file sumber, atau pesan mentor ke log atau analitik.
- Jangan commit rahasia. Semua kunci di `.env.local`; perbarui `.env.example` setiap menambah variabel.
- Harga dan batas paket dibaca dari tabel `plans`, tidak ditulis di kode.

## Aturan UI/UX
- **Mobile-first.** Rancang untuk 375px dulu, lalu 768px dan 1024px. Tidak boleh ada scroll horizontal.
- Pakai token warna, tipografi, radius, dan durasi animasi dari PRD §12. Jangan memakai warna hex langsung di komponen.
- Tema terang dan gelap wajib untuk setiap layar.
- Target sentuh ≥ 44×44px, kontras teks AA, label aksesibilitas pada ikon tanpa teks.
- Satu tindakan utama per layar, di sepertiga bawah layar pada ponsel. Gunakan lembar bawah (bottom sheet) alih-alih modal di ponsel.
- Skeleton untuk memuat, bukan spinner. Setiap daftar punya state kosong dengan satu tombol.
- Animasi singkat dan halus; matikan bila `prefers-reduced-motion`. Animasi besar hanya untuk lulus kuis, naik level, dan aksi terverifikasi.
- Gunakan komponen khas di PRD §12.7 dan perbarui halaman `/dev/ui` setiap menambah komponen.

## Yang tidak boleh dilakukan tanpa izin founder
- Menambah dependensi berbayar atau layanan pihak ketiga baru.
- Mengubah skema database yang sudah dimigrasi di production.
- Mengubah aturan XP, harga, atau kuota.
- Membangun fitur di luar cakupan MVP (PRD §2.3).
- Menjalankan migrasi atau perintah destruktif di database production.
