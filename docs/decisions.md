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
