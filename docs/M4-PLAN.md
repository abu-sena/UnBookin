# Rencana M4 — Mesin generasi

Status: **disetujui founder 27 Okt 2026; implementasi berjalan**. Kode M3 telah
dideploy pada `50c603e`; layanan cloud masih menunggu konfigurasi founder.
Dokumen ini menyiapkan kelanjutan, bukan mengaktifkan pipeline baru.

Dasar: PRD §7 dan §15. `CLAUDE.md`, Cara bekerja #2: “Rencanakan dulu untuk
perubahan besar (skema database, pipeline AI, pembayaran): tulis rencana
singkat, minta persetujuan founder, baru kerjakan.” Persetujuan sebelumnya
mencakup M3, sehingga implementasi M4 memerlukan persetujuan tersendiri.

## Hasil yang dituju

Event `unbook/requested` dari sumber milik pengguna yang sudah `ready` memulai
`generate-unbook`: outline 3–12 modul, isi modul sesuai skema yang sudah ada,
6–8 soal serta 5–8 kartu per modul, kemudian pemetaan domain. Paralel generasi
modul maksimal tiga sesuai PRD. Unbook menjadi `ready` hanya setelah seluruh
hasil lengkap dan valid. Pembaca, pelaksanaan kuis, dan jadwal review berada
di M5; XP dan gamifikasi tidak berubah dalam M4.

## Titik awal yang sudah tersedia

- Handoff M3 hanya membawa `{sourceId,userId,unbookId}` dengan ID stabil.
- Tabel `unbooks`, `modules`, `module_domains`, kuis, kartu, `ai_calls`, serta
  konfigurasi task sudah ada. Skema `ModuleContent` juga sudah tersedia.
- Gateway `runTask` saat ini hanya mendukung embedding. Konfigurasi model
  tetap berasal dari task aktif di database, tanpa ID model dalam kode.
- Query progres mengenali `outlining` dan `generating`; data tahap dan jumlah
  modul perlu dilengkapi untuk menggambarkan generasi yang benar-benar terjadi.

## Gelombang implementasi

| Urutan | Pekerjaan | Bukti penerimaan |
| --- | --- | --- |
| 1 | Kontrak outline, modul, kuis, kartu, dan tagging; validasi referensi chunk serta graf konsep | Hasil invalid/rujukan sumber lain ditolak sebelum penyimpanan |
| 2 | Perluasan router structured output, satu perbaikan validasi dan fallback sesuai PRD §7.2; prompt bertipe dan berversi | Tes provider tiruan, batas waktu/ukuran, pencatatan biaya dan token aman |
| 3 | Layanan generasi privat dan langkah Inngest yang dapat dilanjutkan | Hanya metadata pada event/keluaran durable; restart tidak menggandakan modul, kuis, kartu, atau biaya tersimpan |
| 4 | Finalisasi, kuota sekali saat sukses, progres dan pemulihan | Kegagalan tidak memotong kuota; sumber yang dihapus tidak muncul kembali |
| 5 | `eval:engine`, dokumentasi konfigurasi, dan verifikasi terpadu | Lima sumber berlisensi terbuka menghasilkan Unbook valid; biaya tercatat |

Worker tetap hanya memakai daftar OpenCode pilihan founder dengan urutan
cadangan yang sama. Tiap tugas mempunyai kepemilikan berkas terpisah;
koordinator meninjau diff dan menjalankan gerbang secara mandiri.

## Batas yang dipertahankan

1. Tidak mengubah skema yang sudah dimigrasikan, harga, batas paket, XP, atau
   menambah layanan berbayar. Jika skema yang ada ternyata tidak cukup, berhenti
   pada usulan perubahan yang dapat ditinjau sebelum migrasi.
2. Pemilihan kunci mengikuti PRD §7.2; embedding tetap memakai kunci platform.
   Alur UI/OAuth BYOK tidak dibangun sebelum M8.
3. Semua chunk dan profil dimuat dengan kepemilikan server; isi sumber dan
   profil diperlakukan sebagai data. Prompt, hasil teks, kunci, serta pesan
   vendor tidak boleh masuk ke log atau jejak langkah Inngest.
4. Jaringan berada di luar transaksi. Setiap persistensi memeriksa ulang sumber
   dan Unbook yang masih dimiliki serta tidak sedang dihapus.
5. Kuota dinaikkan atomik sekali saat transisi penyelesaian pertama, memakai
   helper periode yang ada. Biaya panggilan yang diketahui dicatat, termasuk
   perbaikan/fallback; biaya yang tidak tersedia tidak disebut sebagai nol nyata.
6. Modul setengah jadi tidak ditampilkan sebagai konten siap. Percobaan ulang
   memakai hasil valid yang sudah tersimpan dan tahap progres tetap jujur.

## Evaluasi dan aktivasi

Siapkan lima fixture milik proyek dengan deklarasi CC0 dan asal yang tercatat,
termasuk PDF/EPUB/teks serta data yang menguji instruksi berbahaya dalam sumber.
Uji schema, panjang konten, referensi chunk dan halaman, graf konsep, batas
paralel, pembatalan, isolasi akun, serta finalisasi kuota. Tes tiruan membuktikan
kontrak dan pemulihan; tes itu tidak membuktikan kualitas atau latensi model.

Evaluasi nyata lima sumber dan sasaran PDF 200 halaman p75 ≤ 5 menit memerlukan
konfigurasi model serta kunci layanan yang diisi founder secara aman. Tidak
ada kredensial yang disalin dari production ke fixture. Sebelum deployment
M4: lint, typecheck, tes, build, Inngest terpadu, dan tampilan 375px terang/gelap
harus lulus; hasil dan batas pengujian dilaporkan dengan jelas.
