# M6 — selesai, 3 November 2026

M6 selesai dan siap diaktifkan: Jurnal (daftar/status, perpanjang/lewati, laporan AI dan satu revisi), mesin game transaksional (ledger XP idempoten, level, streak/freeze, pembagian XP domain, lencana, misi mingguan, rekonsiliasi data M5, fungsi Inngest mingguan), serta UI game (halaman Progres, pohon keahlian, detail domain, streak di bilah atas, misi di Beranda, perayaan naik level).

Verifikasi pada kode gabungan: lint dan typecheck lulus; tes unit lulus; build production lulus. Playwright 375px terang/gelap: 17 lulus, tanpa tes yang dilewati (regresi M5, Alur C, Progres, Beranda, detail domain, perayaan level).

Syarat uji E2E lokal: database uji `unbookin_m3_test_20261027` harus sudah dimigrasi dan di-seed (`pnpm db:migrate`, `pnpm db:seed` dengan `DATABASE_URL` database uji), karena tes membaca katalog lencana dan misi. Jangan pernah menjalankannya memakai `.env.local` atau database production.

Yang belum teruji di production: penilaian laporan dengan model nyata, dan katalog lencana serta template misi di database production. Keduanya perlu dicek founder saat aktivasi; panduannya ada di [M6-SETUP.md](M6-SETUP.md). Harga, kuota, dan skema tidak diubah.
