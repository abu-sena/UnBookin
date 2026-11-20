# Rencana M9 — Originals, notifikasi, dan panel admin

Status: **keputusan #1–#4 disetujui founder 20 Nov 2026**. Belum ada kode M9 yang ditulis.

M9 mencakup PRD §8 E13 (Originals), E14 (notifikasi), dan E16 (panel admin), plus E12 AC5 (pilihan model BYOK) yang ditunda
dari M8. Milestone selesai bila **admin bisa menerbitkan Originals** dan **email terjadwal terkirim** (PRD §15).

## Hasil yang dituju

1. **Katalog Originals publik (E13-01).** `/originals` dan `/originals/[slug]` bisa dibuka tanpa login dan bisa diindeks
   mesin pencari (metadata, sitemap). Halaman menampilkan sampul, judul, penulis, minat, durasi, harga, daftar modul, dan
   modul contoh gratis.
2. **Akses Originals (E13-02).** Pro dan Pro BYOK membuka semua Originals. Pengguna Gratis membeli satuan lewat Midtrans,
   memakai jalur checkout dan webhook M8 (`payments.kind = original`), atau upgrade. Akses hanya ditentukan server.
3. **Kelola Originals (E13-03).** Admin mengunggah naskah, lalu Unbook Engine memprosesnya seperti unggahan biasa. Admin
   menyunting setiap modul di editor berformulir yang divalidasi Zod, lalu menerbitkan atau menarik kembali.
4. **Email (E14-01) lewat Resend:**
   - Unbook selesai.
   - Kartu jatuh tempo (07.00 waktu lokal, hanya bila ada ≥ 5 kartu).
   - Streak terancam (19.00 waktu lokal, bila belum aktif hari itu).
   - Ringkasan mingguan (Minggu malam).
   - Pengingat perpanjangan (7 dan 1 hari sebelum berakhir).

   Jadwal memakai cron Inngest per jam dan zona waktu dari `profiles.timezone`. Email yang sama tidak terkirim dua kali.
5. **Notifikasi in-app (E14-02).** Lonceng di bilah atas menampilkan badge jumlah belum dibaca dan daftar kejadian di atas,
   plus lencana dan naik level. Ada aksi tandai sudah dibaca.
6. **Pengaturan → Notifikasi (E14-04).** Setiap jenis email bisa dinyalakan atau dimatikan. Setiap email memuat tautan
   berhenti berlangganan satu klik (token bertanda tangan, tanpa login) dan header `List-Unsubscribe`.
7. **Panel admin `/admin` (E16)**, hanya untuk `role = admin`, dicek di server di setiap halaman dan aksi:
   - Dasbor angka utama (E16-01).
   - Kelola pengguna (E16-02): cari, lihat paket dan pemakaian, beri paket gratis sementara, nonaktifkan.
   - `ai_task_configs` dan daftar model BYOK (E16-03).
   - Originals, minat, domain, lencana, misi, dan paket (E16-04).
   - Antrean laporan hak cipta dengan "turunkan konten" (E16-05).
   - Daftar Unbook gagal (E16-06).

   Setiap aksi admin yang mengubah data dicatat di `audit_logs`.
8. **Pilihan model BYOK (E12 AC5).** Pengguna Pro BYOK memilih model dari daftar yang diizinkan admin, untuk dua kategori:
   menulis modul dan mentor. Tanpa pilihan, model bawaan `ai_task_configs` yang dipakai.

## Titik awal yang sudah tersedia

- Tabel `originals`, `original_purchases`, `notification_prefs`, `audit_logs`, `takedown_requests`, `users.role`, dan enum
  `payment_kind` (`subscription`, `original`).
- Sudah ada juga:
  - `ADMIN_EMAILS`, yang memberi role admin saat login;
  - Resend (dipakai email daftar tunggu);
  - cron Inngest (`weekly-missions`);
  - jalur Midtrans M8 (checkout, webhook, status), `resolveActivePlan`, dan ikon lonceng di bilah atas (belum berfungsi).
- Yang belum ada:
  - tabel notifikasi in-app;
  - preferensi untuk email "Unbook selesai" dan "perpanjangan";
  - status nonaktif pengguna;
  - penanda konten diturunkan;
  - tabel daftar model BYOK;
  - semua halaman M9.

## Keputusan founder

| # | Pertanyaan | Usulan |
| --- | --- | --- |
| 1 | Perubahan skema (aditif, satu migrasi `0007`) | Tambah tabel `notifications` (in-app), kolom `notification_prefs.email_unbook_ready` dan `email_renewal` (default nyala), `users.disabled_at`, `unbooks.taken_down_at`, tabel `byok_models` (daftar izin admin) dan `byok_model_prefs` (pilihan pengguna per kategori). Tidak ada kolom yang dihapus atau diubah. |
| 2 | Web push (E14-03) | Ditunda ke M10 bersama PWA. Push butuh service worker dan kunci VAPID, dan baru berguna setelah aplikasi bisa dipasang. Di M9, notifikasi berjalan lewat email dan lonceng. |
| 3 | Akses Originals yang dibeli satuan | Akses selamanya untuk Originals itu, dengan harga dari `originals.price_idr`. Pengguna Pro yang berhenti berlangganan kehilangan akses ke Originals yang tidak dibeli, tetapi progres dan XP-nya tetap tersimpan. |
| 4 | Pilihan model BYOK (E12 AC5) | Dikerjakan di M9 (daftar izin admin dan pilihan pengguna untuk dua kategori), karena panel admin dibangun sekarang. |

Usulan bawaan yang tidak mengubah bisnis:

- **"Beri paket gratis sementara"** membuat baris `subscriptions` tanpa pembayaran, dengan tanggal berakhir yang dipilih
  admin, dan mencatatnya di `audit_logs`.
- **"Nonaktifkan pengguna"** menghapus semua sesi pengguna itu dan menolak login berikutnya. Data tidak dihapus.
- **"Turunkan konten"** menyembunyikan Unbook dari pemiliknya, dengan pesan bahwa konten ditinjau. Laporan ditandai selesai
  dan aksinya tercatat di `audit_logs`. File sumber tidak dihapus otomatis.
- **Dasbor:**
  - pengguna aktif dihitung dari `xp_events` (aktivitas belajar nyata);
  - pendapatan dari `payments` yang lunas;
  - biaya AI dari `ai_calls`.
- **Email:**
  - teks bahasa Indonesia ada di `messages/id.json`;
  - template berupa HTML sederhana di kode, tanpa dependensi baru;
  - pengirim dari `EMAIL_FROM`.

  Email baru terkirim setelah founder memverifikasi domain di Resend. Sebelum itu, sistem mencatat "dilewati" tanpa error.

## Rancangan teknis

- **`lib/notify`** — satu pintu `notify(userId, event)`:
  - menulis baris `notifications`;
  - mengirim email lewat Resend bila preferensi mengizinkan;
  - idempoten per `(user, kind, dedupe_key)`, misalnya tanggal lokal untuk email harian;
  - tidak pernah mencatat isi email ke log.
- **Cron Inngest per jam** — memilih pengguna yang jam lokalnya 07.00 atau 19.00 (atau Minggu malam), lalu menghitung
  syaratnya (≥ 5 kartu, belum aktif hari itu) dengan query batch. Kejadian "Unbook selesai" dikirim dari akhir
  `generate-unbook`. Kejadian lencana dan naik level dikirim dari `lib/game`.
- **Originals:**
  - Unbook milik Original dimiliki akun admin.
  - Pembaca mengakses Original lewat `canAccessOriginal(userId, originalId)` (paket aktif atau pembelian). Modul
    contoh selalu terbuka.
  - Progres, kuis, review, dan aksi tetap per pengguna.
  - Aturan "konten unggahan hanya untuk pemiliknya" tidak berubah untuk Unbook biasa.
- **Checkout Original** memakai `createSubscriptionOrder` yang diperluas menjadi pesanan per `kind`. Webhook memanggil
  `grantOriginalPurchase` alih-alih `applyPaidPayment` untuk `kind = original`. Aturan tanda tangan, jumlah, dan idempotensi
  sama dengan M8.
- **Admin:**
  - `requireAdmin()` dipakai di layout `/admin` dan di setiap Server Action;
  - semua input divalidasi Zod;
  - semua aksi tercatat lewat `logAudit()`;
  - halaman admin berfokus desktop, tetapi tetap rapi di 375 px.
- **BYOK model:** `resolveTaskModel(userId, task)` memilih model dari `byok_model_prefs` bila paket BYOK dan model masih ada
  di `byok_models` yang aktif. Bila tidak, dipakai `ai_task_configs`. Embedding tidak berubah.

## Gelombang kerja

| Gelombang | Worker (paralel) | Isi |
| --- | --- | --- |
| 0 | koordinator | Skema dan migrasi `0007` (setelah disetujui), kontrak `notify`, `requireAdmin`, `logAudit`, `canAccessOriginal` |
| 1 | `m9-notify-core`, `m9-originals-core`, `m9-admin-core` | Pengirim email + token berhenti langganan + cron; akses Originals + checkout Original + webhook; query dasbor + aksi admin + BYOK model resolver |
| 2 | `m9-originals-ui`, `m9-admin-ui`, `m9-notify-ui` | Katalog publik + detail + pembelian; halaman `/admin/*` + editor modul; lonceng + Pengaturan → Notifikasi + pilihan model BYOK |
| 3 | `m9-e2e` | Playwright 375 px terang/gelap (Resend dan Midtrans palsu) + `docs/M9-SETUP.md` |

## Verifikasi dan aktivasi

- Gates `pnpm lint && pnpm typecheck && pnpm test` dan `pnpm build` hijau di setiap gelombang; E2E lengkap di akhir.
- Unit test untuk jadwal email (zona waktu, ambang 5 kartu, tanpa kiriman ganda), token berhenti langganan, akses Originals,
  dan setiap aksi admin (penolakan non-admin, catatan audit).
- Aktivasi oleh founder:
  - verifikasi domain email di Resend dan isi `EMAIL_FROM`;
  - pastikan `ADMIN_EMAILS` berisi email founder;
  - unggah Original pertama lewat `/admin`.
