# Keputusan

| Tanggal | Keputusan | Alasan |
| --- | --- | --- |
| 2026-10-24 | Kerangka awal memakai Next.js 16.4 + React 19.3 + Tailwind 4 (create-next-app terbaru), pnpm 12. | PRD §5.1: versi stabil terbaru. |
| 2026-10-24 | Skrip `typecheck` = `next typegen && tsc --noEmit`. | Next 16 membuat tipe global rute (`LayoutProps`, `PageProps`) lewat typegen; tanpa itu `tsc` gagal. |
| 2026-10-24 | Pengembangan dijalankan oleh worker OpenCode lewat orkestrator dengan rantai model cadangan (lihat `docs/ORCHESTRATION-PLAN.md`). | Instruksi founder. |
