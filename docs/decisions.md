# Keputusan

| Tanggal | Keputusan | Alasan |
| --- | --- | --- |
| 2026-10-24 | Kerangka awal memakai Next.js 16.4 + React 19.3 + Tailwind 4 (create-next-app terbaru), pnpm 12. | PRD §5.1: versi stabil terbaru. |
| 2026-10-24 | Skrip `typecheck` = `next typegen && tsc --noEmit`. | Next 16 membuat tipe global rute (`LayoutProps`, `PageProps`) lewat typegen; tanpa itu `tsc` gagal. |
| 2026-10-24 | Pengembangan dijalankan oleh worker OpenCode lewat orkestrator dengan rantai model cadangan (lihat `docs/ORCHESTRATION-PLAN.md`). | Instruksi founder. |
| 2026-10-24 | Skema database M0 dibuat lengkap sesuai PRD §6 dalam satu migrasi awal. | Disetujui founder; belum ada production. |
| 2026-10-24 | Database pengembangan: Postgres + pgvector via Docker lokal (`docker-compose.yml`). | Pilihan founder; gratis dan offline. |
| 2026-10-24 | Rantai worker "berat" ditambah GLM-5.3-Flash (9Router, lalu Z.ai) di akhir. | Founder: jangan menunggu reset kuota; review koordinator diperketat. |
| 2026-10-24 | Kredensial Google OAuth diisi founder di `.env.local` setelah kode Auth siap. | Founder belum punya kredensial. |
| 2026-10-24 | FK `user_id` di semua tabel data pengguna memakai `ON DELETE CASCADE` (hapus akun E15-03), kecuali `ai_calls` dan `audit_logs` yang memakai `SET NULL`. | Riwayat biaya AI dan jejak audit harus tetap ada setelah akun dihapus; keduanya tidak berisi konten pengguna. |
| 2026-10-24 | `docker-compose.yml` memakai `name: unbookin` agar semua worktree memakai satu database dev yang sama. | Tanpa itu nama proyek diambil dari nama folder. |
| 2026-10-24 | **Terbuka:** `payments` saat ini ikut terhapus bersama akun. Perlu keputusan founder apakah catatan transaksi wajib disimpan (pajak) dengan `user_id` dikosongkan. | Ditunda ke M8 (Monetisasi). |
| 2026-10-24 | `src/proxy.ts` melakukan cek optimistis (ada/tidaknya cookie sesi) untuk rute area login; validasi sebenarnya tetap di `requireUser()` pada layout `(app)`. | Memberi redirect 307 yang benar ke `/masuk` beserta `callbackUrl`; pola resmi Next 16. |
| 2026-10-24 | Callback `session` Auth.js membangun objek sesi secara eksplisit (id, name, email, image, role). | Tanpa itu `/api/auth/session` membocorkan `sessionToken` ke browser. |
