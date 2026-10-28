# M6 — checkpoint rilis bertahap, 28 Oktober 2026

M6 belum selesai seluruhnya. Kandidat rilis ini mencakup Jurnal (daftar/status, perpanjang/lewati, laporan AI dan satu revisi) serta mesin game transaksional: ledger XP idempoten, level, streak/freeze, pembagian XP domain, lencana, misi mingguan, rekonsiliasi data M5, dan fungsi Inngest mingguan.

Verifikasi koordinator pada kode gabungan: lint dan typecheck lulus; 991 tes unit lulus, dua tes DB opsional dilewati pada run umum. Uji integrasi game dengan database lokal juga dijalankan tersendiri dan lulus. Build production lulus. Playwright 375px terang/gelap: 12 lulus (regresi M5 dan Alur C), tiga tes Progres/perayaan masih dilewati. Fixture hanya memakai database lokal, konfigurasi AI sementara dipulihkan setelah pengujian.

UI game di cabang `codex/m6-rules`, commit `3c99ad4`, mencakup Progres, pohon keahlian, streak, misi, dan perayaan level. Bagian ini belum digabung ke rilis karena pemeriksaan akhir browser belum selesai. Tes lanjutannya ada di cabang `codex/m6-actions`; periksa commit terbaru dan hasil worker sebelum melanjutkan. Pertahankan kedua worktree sampai penggabungan dan verifikasi selesai.

Langkah berikutnya: review UI tersebut, gabungkan UI dan tes lanjutannya, selesaikan tiga pemeriksaan browser tanpa skip, jalankan ulang gates, lalu deploy increment berikutnya. Jangan menyebut M6 selesai sebelum langkah itu lulus.

Production masih memerlukan model task AI serta kunci OpenRouter/Inngest dari founder. Panduan konfigurasi ada di [M6-SETUP.md](M6-SETUP.md). Harga, kuota, skema production, dan kunci layanan tidak diubah dalam sesi ini.
