# M3 — Ingest sumber privat

`src/lib/sources/ingest-store.ts` menjalankan ingest di dalam callback durable
Inngest. `src/inngest/ingest-source.ts` mendaftarkan `ingest-source` untuk event
`source/uploaded`; `/api/inngest` menyediakan handler GET, POST, dan PUT dari
SDK. Payload event hanya `{sourceId,userId,unbookId}` yang divalidasi ketat.

## Alur dan kontrak

| Langkah | Hasil yang boleh keluar dari callback |
| --- | --- |
| `extractAndPersistSource(ids)` | `{active,totalChunks,alreadyIngested}` |
| `embedSourceBatch(ids,{startIdx,limit})` | `{active,embeddedChunks,totalChunks}` |
| `finishSourceIngest(ids)` | `{active,ingested}` |
| `canSendIngestHandoff(ids)` | boolean |
| `failSourceIngest(ids,code)` | void; kode kesalahan dalam allowlist |

Isi bacaan, vektor, URL, kunci objek, dan detail kesalahan vendor tetap di dalam
layanan privat. Setiap batas publik membuat `SourceError` baru dengan pesan
berupa kode aman, tanpa menyalin pesan atau `cause` asli. Callback durable juga
menyaring kesalahan sebelum SDK dapat menyimpannya. Logging argumen Server
Function Next.js dimatikan agar teks yang ditempel tidak tercetak di terminal.

Ekstraksi menggunakan parser PDF/EPUB nyata dan pengambil URL yang membatasi
alamat publik, redirect, waktu, serta ukuran. Batas halaman dihitung sebelum
embedding. PDF tanpa teks menghasilkan `noText`; tidak ada OCR otomatis.
Chunk menyimpan referensi halaman dan bab. Penanda internal `__section:N`
mempertahankan batas bagian yang tidak memiliki judul bab; penanda ini tidak
menjadi judul produk.

## Keamanan dan pemulihan

Semua transaksi memeriksa sumber dan Unbook yang dimiliki pengguna yang sama.
Urutan kunci adalah sumber dahulu, lalu Unbook. Jaringan penyimpanan,
pengambilan URL, parsing, dan panggilan embedding berada di luar transaksi.
Status pembatalan/penghapusan, baris yang hilang, dan status terminal
menghentikan penulisan; operasi tidak menghidupkan kembali sumber yang dihapus.

Tidak ada constraint unik `(source_id,idx)` baru. Kunci sumber menserialkan
persistensi chunk. Percobaan ulang memakai chunk yang lengkap dan vektor yang
sudah tersimpan. Batch embedding maksimal 16; model dibaca dari konfigurasi
task aktif di database dan hasil harus berisi 1.536 nilai terbatas per vektor.
Biaya yang diketahui ditambahkan sekali per batch yang baru disimpan. Kuota
Unbook tidak dipotong oleh ingest, percobaan ulang, atau penghapusan.

Fungsi menggunakan `retries:2` (maksimal tiga percobaan untuk kesalahan
sementara), konkurensi satu per sumber, dan pembatalan `source/deleted` yang
mencocokkan ID sumber serta pengguna. Kesalahan input atau sumber yang
permanen tidak diulang otomatis. Percobaan ulang pengguna mengirim ID event
baru. Handoff menggunakan ID stabil agar replay tidak menggandakan permintaan.

## Batas milestone

Ingest selesai berarti sumber `ready`, Unbook tetap `queued`, tahap `ingested`,
dan progres 100. Fungsi mengirim `unbook/requested` sesudah memeriksa kepemilikan
lagi. M3 tidak membuat modul, menandai Unbook selesai, atau memberi notifikasi
modul siap; hal tersebut mengikuti pipeline M4. Layar menampilkan bahwa bacaan
sudah tersimpan dan modul belajar belum tersedia.

Konfigurasi R2, Inngest, dan model embedding dijelaskan pada
[M3-SETUP.md](M3-SETUP.md). Tes layanan HTTP sintetis memverifikasi alur aplikasi;
tes tersebut tidak membuktikan kredensial cloud, penagihan, atau kualitas model
produksi. Catatan verifikasi akhir ditambahkan setelah seluruh gerbang lulus.

### Pemeriksaan pipeline lokal — 27 Oktober 2026

Gerbang integrasi memakai PostgreSQL dan Inngest Dev Server nyata, parser
PDF/EPUB aplikasi, serta HTTP sintetis untuk S3 dan embedding. Hasil yang
sudah diverifikasi:

- PDF sintetis 200 halaman menjadi 8 chunk dengan vektor 1.536 dimensi;
  replay tidak menambah panggilan embedding atau chunk duplikat.
- EPUB menghasilkan 4 chunk; PDF pindai ditolak `noText`; paket Free menolak
  PDF 200 halaman sebelum embedding.
- Kegagalan setelah batch pertama mempertahankan 16 vektor. Percobaan ulang
  menuntaskan 39 chunk dengan memakai kembali vektor tersebut.
- API progres memberi 401 tanpa sesi, 200 kepada pemilik, dan 404 kepada akun
  lain; seluruh respons privat dan tidak disimpan cache.
- Penghapusan membersihkan baris serta objek penyimpanan; kuota terpakai tetap
  nol. Query saat unduhan diperlambat membuktikan tahap `reading` dan kunci
  sumber tidak ditahan selama jaringan menunggu.
- Pemeriksaan 8 run ingest dan 52 keluaran langkah durable tidak menemukan
  isi bacaan, URL sumber, kunci objek, maupun vektor dalam keluaran/kesalahan.

Pada CLI lokal v1.49.0, konfigurasi empat queue worker menerima event tetapi
membiarkannya mengantre. Pengujian berhasil setelah memakai jumlah worker
bawaan CLI. Ini pengaturan infrastruktur pengujian; konkurensi aplikasi tetap
satu pekerjaan per sumber. Hasil ini belum menguji kredensial cloud, kualitas
model nyata, atau penagihan produksi.
