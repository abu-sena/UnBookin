# Rencana M6 — Penerapan dan game

Dasar: M5 selesai pada `c1321aa`; PRD E7, E8, E9. Implementasi memakai tabel yang sudah ada, router AI terstruktur yang sudah ada, dan nilai XP persis PRD. Tidak ada perubahan harga, kuota, skema, atau model AI production.

| Gelombang | Pekerjaan | Pemeriksaan |
| --- | --- | --- |
| 1 | Aturan murni level, Dreyfus, streak/freeze, lencana, pembagian XP, misi; layanan jurnal dan penilaian laporan `action_feedback` | Unit test ambang, zona waktu, idempotensi, kepemilikan, kegagalan AI, batas satu revisi |
| 2 | Integrasi transaksi XP dan rekonsiliasi statistik, misi mingguan, reward Unbook pertama; Jurnal dan formulir laporan | DB uji lokal, konkurensi, replay; UI 375px terang/gelap |
| 3 | Beranda, streak di bilah atas, perayaan level, pohon keahlian dan detail domain; fungsi mingguan Inngest | Pengujian Alur C dan regresi Alur A/review |
| 4 | Review, semua gates, build dan deployment | CI dan deployment pada commit yang sama; panduan aktivasi layanan nyata |

Worker tetap OpenCode sesuai urutan yang dipilih founder. Maksimal dua worker bersamaan: RAM 24 GB, tersedia sekitar 12 GB, 12 logical CPU; sisakan ruang untuk OS, browser, dan build. Koordinator menulis brief, memeriksa hasil, menjalankan gates dan menggabungkan perubahan.

## Kontrak dan batas

- Aksi aktif diurutkan tenggat, dapat diperpanjang 7 hari atau dilewati tanpa penalti.
- Laporan: tindakan minimal 80 karakter, hasil, refleksi opsional, bukti berupa tautan opsional. AI menilai 1–4; hanya nilai ≥3 boleh terverifikasi. Gangguan AI tidak dianggap lulus dan tidak menghabiskan kesempatan revisi. Nilai rendah dapat direvisi satu kali.
- Reward aksi 50 XP dan refleksi 40 XP hanya sekali per aksi. Modul 20, kuis 30 (+10 sempurna), review harian 10, Unbook pertama 50, misi sesuai template 30–60; ledger idempoten dan statistik diperbarui dalam transaksi yang sama.
- Level mulai 1 dan dibatasi 30; ambang kumulatif memakai `round(50 × n^1.6)`. Domain memakai ambang dan syarat tambahan Dreyfus di PRD; bobot confidence dinormalisasi agar XP tidak berlipat.
- Hari aktif dan minggu mengikuti zona waktu profil. Freeze diberikan tiap Senin, maksimal dua; hari yang terlewat dapat memakai satu freeze. Rekonsiliasi malas saat dibuka melengkapi cron agar akun tetap benar bila Inngest belum diaktifkan.
- Tiga misi per minggu: satu belajar, satu review, satu penerapan; hadiah sekali per minggu/misi. Dua belas lencana dan katalog minat/domain yang sudah di-seed dipakai ulang; tidak menjalankan seed harga/paket di production.
- Semua identitas pengguna dari sesi, semua query milik pengguna difilter pemilik, teks laporan tidak masuk log/analytics. Panggilan AI di luar transaksi DB.
- Antarmuka berbahasa Indonesia lewat `messages/id.json`, target sentuh minimal 44px, skeleton, reduced-motion dan lembar bawah pada ponsel.
- Pemilihan model task `action_feedback`, OpenRouter dan kunci Inngest di production tetap tugas konfigurasi founder. Tidak ada penilaian mandiri yang memberi status terverifikasi untuk laporan aksi.
