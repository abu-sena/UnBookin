# Aktivasi Langganan dan BYOK M8

Status: kode M8 sudah ada di `main`. Yang tersisa hanya konfigurasi layanan oleh founder. M8 menambah satu migrasi kecil (`0006`, kolom `byok_keys.key_version`), dan migrasi itu berjalan otomatis saat build Vercel.

M8 menghadirkan:
- **Langganan berbayar lewat Midtrans Snap.** Pemilih paket Gratis, Pro, dan Pro BYOK (bulanan atau tahunan) ada di Pengaturan → Langganan dan di paywall, yang muncul setiap kali kuota habis. Riwayat pembayaran juga ada di sana.
- **Banner perpanjangan** di Beranda dan Langganan saat paket tinggal 7 hari atau kurang.
- **BYOK (Bring Your Own Key).** Pengguna paket Pro BYOK menghubungkan kunci OpenRouter miliknya, lewat OAuth atau dengan menempel kunci, di Pengaturan → Model AI. Panggilan AI mereka lalu memakai kunci itu.

Paket hanya aktif lewat notifikasi Midtrans yang tanda tangannya sah, atau lewat pengecekan status server-ke-server. Halaman kembali di browser tidak pernah mengaktifkan paket. Harga dibaca dari tabel `plans`, yang sudah diisi oleh `pnpm db:seed`.

## 1. Midtrans sandbox

1. Masuk ke dashboard Midtrans **Sandbox**, lalu buka *Settings → Access Keys*. Salin **Server Key** dan **Client Key**.
2. Di Vercel (*Project → Settings → Environment Variables*, lingkungan Production), isi:

   | Nama | Nilai |
   | --- | --- |
   | `MIDTRANS_SERVER_KEY` | Server Key sandbox (rahasia, jangan dibagikan) |
   | `MIDTRANS_CLIENT_KEY` | Client Key sandbox |
   | `MIDTRANS_IS_PRODUCTION` | `false` (biarkan `false` sampai akun produksi siap) |

   `MIDTRANS_SNAP_URL` dan `MIDTRANS_API_URL` **dikosongkan**. Keduanya hanya dipakai oleh tes.
3. Di dashboard Midtrans, buka *Settings → Payment → Notification URL*, lalu isi:
   - **Payment Notification URL:** `https://unbookin.com/api/webhooks/midtrans`
   - **Finish Redirect URL:** `https://unbookin.com/settings/langganan`

   Aplikasi juga mengirim alamat kembali per pesanan, jadi Finish URL ini hanya cadangan.
4. Redeploy. Sampai Client Key terisi, tombol bayar menampilkan pesan tenang "pembayaran belum tersedia", bukan error.

Akun Midtrans produksi memerlukan badan usaha (PRD §17 no. 3) dan berada di luar M8. Saat siap, ganti kedua kunci dengan kunci produksi dan set `MIDTRANS_IS_PRODUCTION=true`.

## 2. Kunci enkripsi BYOK

Kunci OpenRouter milik pengguna disimpan terenkripsi (AES-256-GCM). Aplikasi butuh satu kunci induk acak berukuran 32 byte.

Buat kunci induk di komputer sendiri dengan perintah berikut. Hasilnya satu baris teks base64:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Tempel hasilnya ke Vercel sebagai `BYOK_ENCRYPTION_KEY`. Isi juga `BYOK_ENCRYPTION_KEY_VERSION` dengan `1`.

> **Penting:** simpan salinan kunci ini di pengelola kata sandi. Kalau kunci hilang atau diganti tanpa prosedur rotasi, semua kunci BYOK yang tersimpan tidak bisa dibuka lagi, dan pengguna harus menghubungkan ulang.

**Rotasi (bila suatu saat perlu):**
1. Pindahkan kunci lama ke `BYOK_ENCRYPTION_KEY_PREVIOUS`.
2. Isi `BYOK_ENCRYPTION_KEY` dengan kunci baru.
3. Naikkan `BYOK_ENCRYPTION_KEY_VERSION`, misalnya ke `2`.

Baris lama tetap terbaca lewat kunci sebelumnya, sedangkan kunci yang disimpan setelahnya memakai versi baru.

## 3. OpenRouter OAuth

Tidak ada pendaftaran aplikasi yang perlu dilakukan. Tombol "Hubungkan OpenRouter" membawa pengguna ke `https://openrouter.ai/auth` dengan alamat kembali `https://unbookin.com/api/byok/callback`, memakai PKCE. Pastikan `NEXT_PUBLIC_APP_URL` di Vercel bernilai `https://unbookin.com`, karena alamat kembali dibentuk dari nilai ini.

`OPENROUTER_AUTH_URL` **dikosongkan**; variabel itu hanya untuk tes. Pengguna BYOK memakai model dari `ai_task_configs` yang sama dengan pengguna lain. Pilihan model sendiri untuk BYOK ditunda ke M9.

Embedding tetap memakai kunci platform (`OPENROUTER_API_KEY`), jadi kunci itu tetap wajib diisi.

## 4. Cek manual di sandbox (setelah semua terisi)

1. Masuk dengan akun uji. Buka Pengaturan → Langganan, lalu pilih **Pro Bulanan**.
2. Di Snap sandbox, pilih Virtual Account (misalnya BCA), lalu bayar lewat simulator Midtrans (*Sandbox → Simulator*) dengan nomor VA yang ditampilkan.
3. Kembali ke Unbookin. Halaman Langganan berubah dari "menunggu" menjadi "aktif" dalam satu menit, dengan tanggal berakhir yang benar.
4. Di dashboard Midtrans, cek riwayat notifikasi. Respons `200` berarti webhook diterima.
5. Coba juga pesanan yang dibiarkan kedaluwarsa. Paket tidak boleh aktif.
6. Untuk BYOK: pindahkan akun uji ke paket Pro BYOK, buka Pengaturan → Model AI, lalu klik **Hubungkan OpenRouter**. Setujui di OpenRouter, lalu pastikan kartu menampilkan "Terhubung · ••••xxxx".
7. Tanya Mentor sekali. Di OpenRouter, pemakaian tercatat di akun pengguna itu, bukan akun platform.
8. Klik **Putuskan**. Tanya Mentor sekarang meminta pengguna menghubungkan kunci, dan kuota pesan tidak berkurang.

## Yang dibuktikan tes otomatis, dan yang tidak

Tes E2E (`tests/e2e/zz-m8-billing.spec.ts`) memakai Midtrans dan OpenRouter **palsu** di database uji lokal, pada lebar 375 px, dalam tema terang dan gelap. Tes membuktikan:
- alur upgrade dari kuota habis sampai paket aktif;
- notifikasi ganda tidak menggandakan periode, dan `expire` setelah lunas tidak menurunkan paket;
- tanda tangan salah ditolak, dan jumlah berbeda tidak mengaktifkan paket;
- banner perpanjangan muncul tepat waktu;
- BYOK bisa dihubungkan, diuji, dipakai mentor, lalu diputus;
- pesanan orang lain tidak bocor.

Tes **tidak** membuktikan:
- tampilan dan perilaku Snap asli;
- format notifikasi Midtrans sungguhan untuk setiap metode bayar;
- pengiriman ulang notifikasi oleh Midtrans saat server sibuk;
- layar persetujuan OAuth OpenRouter yang asli.

Bagian-bagian itu dicek dengan daftar manual di atas.
