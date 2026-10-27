# Konfigurasi unggah dan ingest M3

Panduan ini menyiapkan layanan untuk unggah PDF/EPUB, tautan, dan teks.
Kode M3 mencakup lembar unggah, `/api/inngest`, layar progres, percobaan ulang,
serta konfirmasi penghapusan dari pustaka. Pengujian lokal lengkap sudah lulus;
layanan produksi perlu diaktifkan dengan konfigurasi di bawah. Kunci R2,
Inngest, dan OpenRouter belum tersedia pada deployment saat panduan ini ditulis.

Kunci tetap di `.env.local` atau pengaturan environment deployment. Jangan
memasukkannya ke chat, Git, atau variabel `NEXT_PUBLIC_*`.

## 1. Lingkungan lokal

Gunakan Node.js 24 dan pnpm 12 sesuai [README](../README.md). Dari folder proyek:

```powershell
pnpm install --frozen-lockfile
if (-not (Test-Path -LiteralPath '.env.local')) {
  Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
}
```

Isi `DATABASE_URL`, konfigurasi Auth.js, dan layanan di bawah. Untuk database
lokal **baru**, jalankan Docker, migrasi, dan seed mengikuti README. Jangan
menggunakan database production untuk fixture atau pengujian. Database aplikasi
yang sudah ada tidak memerlukan perubahan skema khusus untuk pekerjaan M3 ini.

## 2. Bucket R2 privat

Buat bucket privat di Cloudflare R2 dan token **Object Read & Write** yang
dibatasi ke bucket tersebut. Operasi server memerlukan baca, tulis, HEAD, dan
hapus objek. Jangan mengaktifkan akses publik bucket.

| Variabel | Nilai yang diisi |
| --- | --- |
| `S3_ENDPOINT` | Endpoint API S3 akun R2, tanpa nama bucket |
| `S3_REGION` | `auto` |
| `S3_BUCKET` | Nama bucket privat |
| `S3_ACCESS_KEY_ID` | Access Key ID token bucket |
| `S3_SECRET_ACCESS_KEY` | Secret Access Key token bucket |

Atur CORS bucket untuk origin aplikasi yang benar. Contoh berikut perlu
disesuaikan jika port lokal atau domain berbeda; tambahkan origin preview
secara spesifik bila diperlukan.

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://unbookin.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

Browser mengunggah langsung dengan URL bertanda tangan yang berlaku lima
menit. `Content-Type` harus sesuai respons server. Browser mengisi
`Content-Length` dari file; JavaScript tidak boleh mengatur header tersebut
secara manual. Penghapusan dilakukan server, sehingga tidak memerlukan izin
CORS `DELETE` pada browser. Detail kontrak ada di [M3-STORAGE](M3-STORAGE.md).

## 3. Model embedding

Isi `OPENROUTER_API_KEY` dengan kunci platform dan biarkan
`OPENROUTER_BASE_URL=https://openrouter.ai/api/v1` untuk layanan biasa.
Pilih model embedding yang mendukung keluaran **1.536 dimensi**.

`EMBEDDING_MODEL` hanya membantu seed mengisi tabel `ai_task_configs`.
Runtime selalu membaca baris aktif dengan `task='embedding'` dari tabel itu;
mengubah environment saja tidak mengganti model yang dipakai runtime.
Konfigurasi yang berhasil dibaca dapat tersimpan di cache hingga lima menit.

Untuk **database lokal baru**, isi `EMBEDDING_MODEL` sebelum `pnpm db:seed`.
Seed penuh juga memperbarui paket dan harga, jadi jangan menjalankannya hanya
untuk mengganti model pada database yang sudah digunakan.

Untuk database yang sudah ada, ubah hanya baris embedding melalui SQL Editor.
Ganti `<ID_MODEL_EMBEDDING>` dengan pilihan Anda sebelum menjalankan SQL ini:

```sql
INSERT INTO ai_task_configs
  (task, model, temperature, max_output_tokens, is_active)
VALUES
  ('embedding', '<ID_MODEL_EMBEDDING>', 0, 1, true)
ON CONFLICT (task) DO UPDATE SET
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  max_output_tokens = EXCLUDED.max_output_tokens,
  is_active = true,
  updated_at = now();
```

Ini tidak mengubah tabel paket, harga, kuota, atau skema database. Embedding
memakai kunci platform; kunci BYOK pengguna tidak dipakai untuk tahap ini.

## 4. Inngest lokal

Isi `INNGEST_DEV=1` hanya untuk pengembangan, lalu jalankan dua terminal:

```powershell
# Terminal pertama
pnpm dev
```

```powershell
# Terminal kedua
pnpm dlx inngest-cli@1.49.0 dev --host 127.0.0.1 --port 8288 --no-discovery --sdk-url http://localhost:3000/api/inngest
```

Buka `http://127.0.0.1:8288` dan pastikan aplikasi `unbookin` beserta fungsi
`ingest-source` terdaftar. Jika port aplikasi berbeda, ubah `--sdk-url`.
Respons `404` dari `/api/inngest` berarti route belum tersedia atau URL salah;
jangan menganggap ingest sudah berjalan hanya karena event diterima.
Gunakan jumlah queue worker bawaan CLI; pada pengujian Windows versi ini,
menurunkannya menjadi empat membuat pekerjaan terus mengantre.

## 5. Inngest production

Di pengaturan environment deployment, isi `INNGEST_EVENT_KEY` dan
`INNGEST_SIGNING_KEY` dari environment Inngest yang sesuai. Kosongkan/hapus
`INNGEST_DEV` dan setiap pengaturan alamat Dev Server lokal.

Sesudah konfigurasi dan deployment siap, daftarkan/sinkronkan URL
`https://unbookin.vercel.app/api/inngest` di Inngest (atau domain aplikasi yang
digunakan). Callback harus dapat dijangkau
Inngest dan tetap memverifikasi tanda tangan SDK. Jangan menambahkan bypass
signature atau mengandalkan sesi login pengguna untuk callback background.

Event membawa ID sumber, pengguna, dan Unbook. Isi bacaan, URL unggah, kunci
objek, dan vektor tidak boleh masuk ke event maupun keluaran langkah durable.
Langkah ekstraksi dan embedding harus muat dalam batas durasi fungsi hosting;
embedding diproses dalam batch maksimal 16 chunk dengan timeout permintaan
30 detik. Periksa batas deployment sebelum memakai file besar di production.

## 6. Verifikasi setelah integrasi selesai

1. Masuk dan selesaikan onboarding. Buka Pustaka, tekan **Unbook**, lalu coba
   PDF/EPUB, tautan artikel publik, dan teks milik sendiri/berlisensi sesuai.
2. Pastikan tombol kirim belum aktif sebelum konfirmasi hak akses dicentang.
   Periksa batas ukuran/halaman dari paket, bukan angka yang ditebak di UI.
3. Unggah PDF 200 halaman menggunakan paket yang mengizinkannya. Pastikan
   semua chunk memiliki referensi halaman dan embedding 1.536 dimensi.
4. Batalkan unggahan saat berlangsung. Reservasi dan file sementara harus
   dibersihkan, atau UI memberi pemulihan yang jelas bila penyimpanan gagal.
5. Uji kegagalan embedding lalu coba ulang. Chunk/vektor yang berhasil harus
   dipakai kembali, tanpa duplikasi dan tanpa memotong kuota saat ingest.
6. Akun lain harus menerima `404` saat meminta progres sumber tersebut.
   Permintaan tanpa sesi harus menerima `401`; respons progres privat/no-store.
7. Hapus bacaan melalui konfirmasi. File, chunk, Unbook pribadi, dan data
   turunannya harus hilang. Kegagalan penyimpanan harus mempertahankan referensi
   untuk percobaan penghapusan berikutnya.

Sumber yang selesai ingest berstatus `ready`, sedangkan Unbook berada pada
tahap `ingested` dan meneruskan `unbook/requested`. Pembuatan modul belajar
merupakan tahap pengembangan berikutnya; sumber tersimpan tidak berarti
modul, kuis, atau kartu belajar sudah dibuat.

## 7. Bantuan saat konfigurasi gagal

| Gejala | Yang diperiksa |
| --- | --- |
| Penyimpanan tidak tersedia | Endpoint akun, nama bucket, token, dan izin objek |
| PUT gagal hanya dari browser | CORS origin, tipe file, dan masa berlaku URL |
| Antrean tidak tersedia | Dev Server dan flag lokal, atau kedua Event Key dan Signing Key production |
| Event ada tetapi callback gagal | URL route, Signing Key, dan log Inngest yang sudah disanitasi |
| Model belum dikonfigurasi | Baris aktif `ai_task_configs.task='embedding'` |
| Embedding ditolak | Kunci platform, ID model, dukungan 1.536 dimensi, dan batas layanan |
| PDF tidak memiliki teks | Versi ini belum mendukung OCR; gunakan PDF dengan lapisan teks |

Tes lokal memakai parser dan PostgreSQL nyata serta HTTP tiruan untuk S3 dan
embedding. Hasil itu tidak membuktikan CORS/tanda tangan bucket R2 nyata,
konektivitas cloud Inngest, kualitas embedding, atau biaya OpenRouter nyata.
Pemeriksaan layanan tersebut dilakukan sesudah konfigurasi diisi, tanpa
menaruh rahasia di laporan. Jika penyedia sudah memproses permintaan embedding
tetapi commit database gagal, permintaan ke penyedia dapat terulang; deduplikasi
penyimpanan chunk tidak menjamin tagihan eksternal persis satu kali.
