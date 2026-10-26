# Panduan deploy ke production (Vercel + Neon + Resend)

Panduan ini untuk founder. Semua akun dan kunci dibuat dan diisi sendiri. **Jangan pernah menempel kunci atau
password ke chat**; kalau sampai bocor, buat kunci baru dan hapus yang lama.

Yang bisa dipakai setelah deploy (sampai M2): landing page + daftar tunggu (uji harga, rujukan, email
konfirmasi), masuk dengan Google atau tautan email, onboarding, profil, dan pengaturan. Unggah bacaan dan modul
belajar belum ada (mulai M3).

## Yang perlu disiapkan

| Akun | Untuk apa | Catatan biaya |
| --- | --- | --- |
| GitHub | Menyimpan kode; Vercel mengambil kode dari sini | Repo private gratis |
| Vercel | Menjalankan aplikasi | Paket Hobby hanya untuk penggunaan non-komersial. Sebelum menerima pembayaran (M8), pindah ke paket Pro. |
| Neon | Database Postgres online (region Singapura) | Ada paket gratis; cek batasnya di halaman harga Neon |
| Google Cloud | Tombol "Masuk dengan Google" | Gratis |
| Resend | Mengirim email tautan masuk dan konfirmasi daftar tunggu | Ada paket gratis |
| Domain `unbookin.com` | Alamat situs dan alamat pengirim email | Akses ke pengaturan DNS di tempat domain dibeli |

Urutan yang disarankan: 1 → 8. Kalau domain belum siap, bisa mulai dengan alamat `nama-proyek.vercel.app` dulu
(lihat langkah 7).

---

## 1. Simpan kode di GitHub

1. Repository: `https://github.com/abu-sena/UnBookin` (sebaiknya **Private**).
2. Di terminal, dari folder proyek:

   ```
   git remote add origin https://github.com/abu-sena/UnBookin.git
   git push -u origin main
   ```

3. Pastikan `.env.local` **tidak** ikut terunggah. File ini sudah diabaikan oleh `.gitignore`; cek di halaman
   repo GitHub bahwa file itu tidak ada.

## 2. Database di Neon

> **Yang dipakai sekarang (26 Okt 2026):** database `unbookin-db` dibuat lewat **Vercel → unbookin → Storage →
> Neon** (region Singapura `sin1`, paket Free, prefix `DATABASE`). Vercel otomatis mengisi `DATABASE_URL`
> (pooled) dan `DATABASE_URL_UNPOOLED` (direct), jadi langkah 2.1–2.2 di bawah tidak perlu. Alamat direct untuk
> migrasi ada di Vercel → Storage → `unbookin-db` → tab **.env.local** → tombol **Show secret**, baris
> `DATABASE_URL_UNPOOLED`. Lanjutkan dari langkah 2.3 dengan alamat itu.

1. Di neon.tech buat project baru: region **AWS Asia Pacific (Singapore)**, Postgres versi 17.
2. Di halaman **Connection Details** ambil dua alamat:
   - **Pooled connection** (alamat host mengandung `-pooler`) → untuk Vercel (`DATABASE_URL`).
   - **Direct connection** (tanpa `-pooler`) → hanya untuk menjalankan migrasi dari laptop.
3. Buat tabel dan isi data awal dari laptop. Di PowerShell, dari folder proyek:

   ```
   $env:DATABASE_URL="ALAMAT-DIRECT-DARI-NEON"
   pnpm db:migrate
   pnpm db:seed
   Remove-Item Env:DATABASE_URL
   ```

   `db:migrate` membuat semua tabel (termasuk ekstensi `vector`). `db:seed` mengisi minat, domain, paket,
   harga varian, lencana, dan misi; aman dijalankan ulang.
4. Cek di **SQL Editor** Neon: `select count(*) from interests;` harus menghasilkan `4`.

> **Sejak 26 Okt 2026 (izin founder):** build production di Vercel menjalankan migrasi otomatis
> (`scripts/vercel-build.mjs`, memakai `DATABASE_URL_UNPOOLED`) sebelum `next build`. Build preview tidak
> menyentuh database. Seed hanya berjalan bila env `RUN_SEED=1` ada; isi sekali, deploy, lalu hapus lagi.
> Kalau migrasi gagal, build dihentikan sehingga versi lama tetap berjalan. Langkah 3 manual di atas tidak
> lagi wajib, tapi tetap bisa dipakai.

## 3. Buat `AUTH_SECRET` baru

Jangan memakai nilai dari `.env.local` laptop. Buat yang baru:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Simpan hasilnya untuk langkah 6.

## 4. Login Google

1. Buka console.cloud.google.com → buat project `Unbookin`.
2. **APIs & Services → OAuth consent screen**: tipe *External*, isi nama aplikasi "Unbookin" dan email kontak.
   Selama status *Testing*, tambahkan email yang boleh masuk di **Test users**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipe *Web application*:
   - **Authorized JavaScript origins**: `https://unbookin.com` dan `http://localhost:3000`
   - **Authorized redirect URIs**: `https://unbookin.com/api/auth/callback/google` dan
     `http://localhost:3000/api/auth/callback/google`
   - Kalau memakai alamat `.vercel.app` dulu, tambahkan juga alamat itu dengan pola yang sama.
4. Salin **Client ID** dan **Client secret** untuk langkah 6. Untuk mencoba di laptop, isi juga keduanya di
   `.env.local` (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`).

## 5. Email lewat Resend

1. Di resend.com → **Domains → Add domain** → `unbookin.com`.
2. Tambahkan catatan DNS yang ditampilkan Resend di tempat domain dibeli, lalu tunggu status **Verified**.
3. **API Keys → Create API key** dengan izin *Sending access*. Salin untuk langkah 6.
4. `EMAIL_FROM` memakai alamat di domain itu, misalnya `Unbookin <halo@unbookin.com>`.

Sebelum domain terverifikasi, Resend hanya bisa mengirim ke email pemilik akun Resend. Pendaftar daftar tunggu
tetap tersimpan, tetapi email konfirmasi dan tautan masuk tidak sampai ke orang lain.

## 6. Proyek di Vercel

1. Di vercel.com → **Add New → Project** → pilih repo `abu-sena/UnBookin` dari GitHub. Framework terdeteksi otomatis
   (Next.js). Pengaturan build sudah ada di `vercel.json` (region Singapura `sin1`, perintah pnpm).
2. Sebelum menekan **Deploy**, buka **Environment Variables** dan isi untuk lingkungan *Production*:

   | Nama | Isi |
   | --- | --- |
   | `DATABASE_URL` | Alamat **pooled** dari Neon (langkah 2) |
   | `AUTH_SECRET` | Hasil langkah 3 |
   | `AUTH_GOOGLE_ID` | Client ID (langkah 4) |
   | `AUTH_GOOGLE_SECRET` | Client secret (langkah 4) |
   | `RESEND_API_KEY` | API key Resend (langkah 5) |
   | `EMAIL_FROM` | `Unbookin <halo@unbookin.com>` |
   | `NEXT_PUBLIC_APP_URL` | `https://unbookin.com` (atau alamat `.vercel.app`, lihat langkah 7) |
   | `ADMIN_EMAILS` | Email founder, pisahkan dengan koma kalau lebih dari satu |
   | `ENABLE_EXPERIMENTAL_COREPACK` | `1` (agar Vercel memakai pnpm 12 sesuai `package.json`) |

   **Jangan** isi `AUTH_URL` (di Vercel alamatnya dideteksi otomatis; nilai `localhost` akan merusak login)
   dan **jangan** isi `NEXT_PUBLIC_ENABLE_DEV_UI` (halaman `/dev/ui` hanya untuk pengembangan).

   Opsional sekarang: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` (laporan error), `NEXT_PUBLIC_POSTHOG_KEY`,
   `NEXT_PUBLIC_POSTHOG_HOST` (analitik). Variabel lain di `.env.example` (S3, OpenRouter, Inngest, Midtrans,
   BYOK) baru dibutuhkan di M3–M8.
3. Tekan **Deploy** dan tunggu sampai selesai (sekitar 2–4 menit).
4. Cek **Settings → Functions**: region harus **Singapore (sin1)**, dekat dengan database Neon.

## 7. Domain

1. Vercel → **Settings → Domains** → tambahkan `unbookin.com` (dan `www.unbookin.com` sebagai pengalihan).
2. Ikuti catatan DNS yang diminta Vercel di tempat domain dibeli. Sertifikat HTTPS dibuat otomatis.
3. Kalau sementara memakai alamat `.vercel.app`: isi `NEXT_PUBLIC_APP_URL` dengan alamat itu dan tambahkan
   alamat itu di Google (langkah 4). Setelah domain aktif, ganti `NEXT_PUBLIC_APP_URL` ke
   `https://unbookin.com` lalu **Redeploy**. Variabel berawalan `NEXT_PUBLIC_` dibaca saat build, jadi
   perubahan baru berlaku setelah deploy ulang.

## 8. Uji setelah deploy

- [ ] Buka `/`: hero, cara kerja, contoh modul, harga (angka muncul), FAQ tampil di ponsel.
- [ ] Daftar tunggu dengan email sendiri → muncul "Kamu di antrean ke-…" dan tautan rujukan; email konfirmasi
      masuk ke inbox.
- [ ] Daftar lagi dengan email yang sama → muncul pesan "sudah terdaftar".
- [ ] `/masuk` → **Masuk dengan Google** → onboarding 5 langkah → Beranda.
- [ ] Keluar, lalu coba **Kirim tautan masuk** ke email sendiri → klik tautan di email → kembali masuk.
- [ ] Di SQL Editor Neon: `select email, role from users;` → email founder berperan `admin`.
- [ ] `/dev/ui` menampilkan halaman "tidak ditemukan".
- [ ] `/robots.txt` dan `/sitemap.xml` terbuka.
- [ ] Bagikan tautan situs di WhatsApp → muncul gambar pratinjau dan judul.

## Kalau ada masalah

| Gejala | Penyebab paling mungkin | Perbaikan |
| --- | --- | --- |
| Build gagal saat `pnpm install` dengan pesan versi pnpm | `ENABLE_EXPERIMENTAL_COREPACK` belum diisi | Isi `1` di Environment Variables, lalu Redeploy |
| Halaman error, log berisi `DATABASE_URL is required` | Variabel belum diisi untuk lingkungan *Production* | Isi, lalu Redeploy |
| Google menampilkan `redirect_uri_mismatch` | Alamat redirect di Google belum sama persis | Samakan dengan langkah 4 (termasuk `https://` dan tanpa garis miring di akhir) |
| Tautan masuk lewat email tidak pernah datang | Domain Resend belum *Verified* atau `EMAIL_FROM` bukan alamat domain itu | Selesaikan langkah 5 |
| Setelah login kembali ke halaman masuk terus | `AUTH_URL` terisi atau `AUTH_SECRET` kosong | Hapus `AUTH_URL`, isi `AUTH_SECRET`, Redeploy |
| Harga atau minat tidak muncul | Seed belum dijalankan ke Neon | Ulangi langkah 2.3 |
| Tautan rujukan atau gambar pratinjau masih memakai alamat lama | `NEXT_PUBLIC_APP_URL` diubah tanpa deploy ulang | Redeploy |
