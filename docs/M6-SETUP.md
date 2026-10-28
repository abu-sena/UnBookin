# Aktivasi penerapan dan game M6

Status sesi: Jurnal dan mesin game siap diverifikasi untuk deployment bertahap. UI Progres/pohon keahlian dan perayaan level berada di cabang kerja sampai pemeriksaan akhirnya selesai; M6 belum dinyatakan selesai seluruhnya. Langkah yang menyebut UI Progres di bawah berlaku setelah bagian tersebut dirilis.

M6 menggunakan tabel yang sudah ada. Nilai XP dan syarat Dreyfus mengikuti PRD. Katalog tiga minat, 18 domain, 12 lencana dan template misi berasal dari seed awal; jangan menjalankan seed penuh pada database production hanya untuk mengaktifkan M6 karena seed itu juga memperbarui paket dan harga.

## Layanan AI untuk laporan

Pilih model untuk task `action_feedback` di `ai_task_configs`, sama seperti pengaturan task M4/M5. Model harus mendukung respons JSON terstruktur. Runtime membaca baris aktif dari database; ID model tidak ditanam dalam kode. Isi `OPENROUTER_API_KEY` di environment server Vercel, lalu redeploy bila environment berubah. Jangan gunakan variabel `NEXT_PUBLIC_*` untuk rahasia.

Laporan mengirim judul/ringkasan modul, konteks Praktisi dan isi laporan ke penyedia AI. Tautan bukti tidak diunduh server. Respons harus berisi `qualityScore` (bilangan bulat 1–4) dan `feedback` (teks). Skor 3–4 memverifikasi aksi; skor 1–2 memberi satu kesempatan revisi. Jika layanan belum dikonfigurasi atau gagal, laporan tidak mendapat XP/status terverifikasi dan kesempatan revisi tetap tersedia. Pengguna dapat mencoba lagi dengan isian yang tetap berada di formulir.

Pemilihan model dan pengisian kunci production dilakukan founder. Jangan menyalin kunci ke chat, Git, log, atau fixture pengujian. Konfigurasi generasi dan kuis tetap mengikuti panduan M4/M5.

Setelah memilih model, contoh berikut dapat dijalankan founder melalui SQL Editor database yang dituju. Ganti placeholder dengan ID model pilihan; contoh ini hanya menyentuh konfigurasi task laporan, tanpa mengubah paket atau harga.

```sql
INSERT INTO ai_task_configs
  (task, model, fallback_model, temperature, max_output_tokens, is_active)
VALUES
  ('action_feedback', '<ID_MODEL_PILIHAN>', NULL, 0.2, 1000, true)
ON CONFLICT (task) DO UPDATE SET
  model = EXCLUDED.model,
  fallback_model = EXCLUDED.fallback_model,
  temperature = EXCLUDED.temperature,
  max_output_tokens = EXCLUDED.max_output_tokens,
  is_active = true,
  updated_at = now();
```

Konfigurasi yang berhasil dibaca dapat berada dalam cache sampai lima menit. Biarkan `fallback_model` kosong bila belum memilih model cadangan.

## Inngest dan minggu lokal

Daftarkan integrasi Inngest pada endpoint production `/api/inngest` dengan kunci event dan signing yang benar. Fungsi `weekly-missions` dijadwalkan tiap jam untuk memeriksa Senin pukul 00.00 pada zona waktu profil. Perhitungan saat pengguna membuka statistik juga merekonsiliasi minggu berjalan, sehingga keterlambatan cron tidak menggandakan misi atau hadiah.

Jangan mengaktifkan mode dev Inngest di production. Kunci yang belum tersedia bukan alasan untuk menonaktifkan verifikasi tanda tangan. Tanggal hari aktif, minggu misi, dan freeze memakai zona waktu profil pengguna.

## Pemeriksaan setelah aktivasi

1. Gunakan akun uji milik sendiri dan Unbook yang sudah siap. Buka modul, pilih "Jadikan aksi saya", lalu buka Jurnal dari Beranda atau Progres.
2. Kirim laporan spesifik dengan minimal 80 karakter pada tindakan dan hasil yang jelas. Isi refleksi bila ada. Pastikan skor, umpan balik, dan status muncul; nilai ≥3 memberi 50 XP dan tambahan 40 XP bila refleksi diisi.
3. Muat ulang halaman. XP aksi/refleksi, hadiah misi, dan lencana harus tetap tercatat satu kali. Buka Progres untuk melihat pembagian XP domain serta syarat level berikutnya.
4. Periksa aksi lewat tenggat: pengguna bisa memperpanjang 7 hari atau melewati tanpa penalti. Laporan bernilai rendah bisa direvisi satu kali; kegagalan penyedia AI tidak menghabiskan kesempatan itu.

Pengujian otomatis memakai database lokal yang namanya mengandung `test` dan penyedia AI palsu. Fixture tidak boleh dijalankan pada Neon/Vercel atau database production. Hasil pengujian dan deployment akhir dicatat terpisah pada catatan penyelesaian M6.
