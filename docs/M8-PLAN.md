# Rencana M8 — Langganan, pembayaran, dan BYOK

Status: **keputusan #1–#4 disetujui founder 19 Nov 2026**. Belum ada kode M8 yang ditulis.

M8 mencakup PRD §8 E11 (langganan dan pembayaran) dan E12 (BYOK OpenRouter), plus Alur D (upgrade). Milestone selesai bila
**pembayaran sandbox Midtrans mengaktifkan paket** dan **BYOK OAuth berhasil** (PRD §15).

## Hasil yang dituju

1. **Halaman harga di aplikasi (E11-01)** dari tabel `plans`, dengan label hemat yang dihitung otomatis.
2. **Checkout Midtrans Snap (E11-02 AC1):** pilih paket → buat baris `payments` (pending, `midtrans_order_id` unik) → Snap
   (popup di desktop, redirect di ponsel) → kembali ke aplikasi dengan status yang jelas.
3. **Webhook `/api/webhooks/midtrans` (AC2):** verifikasi signature, idempoten per `order_id`, lalu mengaktifkan atau
   memperpanjang `subscriptions`. Status yang gagal, kedaluwarsa, atau dibatalkan tidak mengaktifkan apa pun.
4. **Masa berlaku per periode (AC3):** tanpa auto-debit. Pengingat perpanjangan 7 dan 1 hari sebelum berakhir. Setelah
   berakhir, akun turun ke Gratis tanpa menghapus data.
5. **Pengaturan → Langganan (AC4):** paket aktif, tanggal berakhir, tombol perpanjang, dan riwayat pembayaran.
6. **Penegakan kuota (E11-03):** satu fungsi `assertQuota(userId, kind)` untuk unggah, mentor, dan Originals. Setiap pesan
   kuota habis membawa tombol upgrade.
7. **Paywall (Alur D):** lembar bawah berisi perbandingan paket singkat, lalu Snap, lalu kembali ke aksi yang tadi tertunda.
8. **BYOK (E12):** "Hubungkan OpenRouter" lewat OAuth PKCE S256 dan callback `/api/byok/callback`, atau tempel kunci manual.
   Kunci dienkripsi AES-256-GCM dengan `BYOK_ENCRYPTION_KEY`; hanya `last4` yang sampai ke klien. Ada uji koneksi
   otomatis, status "Terhubung · ••••abcd", dan putuskan koneksi untuk menghapus kunci.
9. **Router AI memakai kunci BYOK** untuk pelanggan paket BYOK yang kuncinya valid. Kalau kunci gagal (kredit habis,
   dicabut), proses berhenti dengan pesan jelas dan **tidak** diam-diam memakai kunci platform (AC6). Embedding tetap
   memakai kunci platform.

## Titik awal yang sudah tersedia

- Tabel `plans`, `price_variants`, `subscriptions`, `payments`, `byok_keys`, `usage_counters`, dan `ai_calls.byok` sudah ada.
- `getSourceAllowance`, `mentor-quota.ts` (resolusi paket aktif berdasarkan `current_period_end`), `pricing.ts`
  (`getDisplayedPlans` per varian harga), dan `resolveTaskKey(userId)` (titik sambung BYOK di router).
- Yang belum ada: modul `lib/crypto`, klien Midtrans, webhook, OAuth, halaman Langganan, Model AI, paywall, dan
  `assertQuota`.

## Keputusan founder

| # | Pertanyaan | Usulan |
| --- | --- | --- |
| 1 | Harga mana yang ditagih saat checkout. Uji harga di daftar tunggu memakai varian A (harga PRD) dan B (lebih murah). | Akhiri uji harga di checkout. Semua pengguna membayar `plans.price_idr` (varian A), dan halaman harga di aplikasi menampilkan harga yang sama dengan yang ditagih. Founder bisa mengubah harga kapan saja lewat tabel `plans`. |
| 2 | Berganti paket di tengah periode | Paket yang sama: periode baru disambung dari tanggal berakhir. Paket berbeda: paket baru berlaku sejak dibayar, sisa periode lama hangus dan tidak dikembalikan. Tidak ada prorata di MVP. |
| 3 | Pilihan model untuk pengguna BYOK (E12 AC5) | Ditunda ke M9 bersama panel admin (E16-03). Di M8, pengguna BYOK memakai model yang sama dengan `ai_task_configs`, tetapi tagihannya ke kunci mereka sendiri. |
| 4 | Rotasi kunci induk BYOK (PRD §11 "kolom versi") | Tambah kolom aditif `byok_keys.key_version` (integer, default 1), supaya `BYOK_ENCRYPTION_KEY` bisa diganti tanpa memutus kunci pengguna. Ini satu-satunya perubahan skema di M8. |

Usulan bawaan yang tidak mengubah bisnis:

- **Pengingat perpanjangan** tampil sebagai banner di aplikasi dan di Pengaturan → Langganan. Email pengingat menyusul di M9
  (notifikasi), karena domain email Resend belum disiapkan.
- **Status Midtrans:** `settlement` dan `capture` dengan `fraud_status=accept` dianggap lunas; `pending` menunggu;
  `deny`, `cancel`, `expire`, dan `failure` gagal. Jumlah yang diterima harus sama dengan `payments.amount_idr`; kalau
  berbeda, pembayaran ditandai bermasalah dan paket tidak diaktifkan.
- **Pengguna BYOK tanpa kunci terhubung:** setiap aksi AI diblokir dengan ajakan "Hubungkan OpenRouter", tanpa
  memakai kunci platform. Batas wajar 50 Unbook per bulan tetap berlaku (PRD §7.5).

## Rancangan teknis

- **`lib/crypto`:** AES-256-GCM dengan IV acak 12 byte, `key_version` untuk rotasi, dan `BYOK_ENCRYPTION_KEY` (32 byte
  base64) divalidasi saat start. Kunci polos tidak pernah keluar dari server, dan tidak pernah masuk log atau analitik.
- **Midtrans:** satu klien server (`lib/billing/midtrans.ts`) untuk membuat transaksi Snap (`MIDTRANS_SERVER_KEY`,
  `MIDTRANS_IS_PRODUCTION=false`). Snap JS dimuat dari domain resmi Midtrans hanya di halaman pembayaran. Webhook
  memverifikasi `sha512(order_id + status_code + gross_amount + server_key)` dengan perbandingan waktu-konstan, dan
  memproses tiap notifikasi dalam satu transaksi dengan kunci per `order_id`.
- **Aktivasi paket** hanya dari webhook (atau cek status server-ke-server), tidak pernah dari redirect browser.
- **OAuth OpenRouter:** `code_verifier` acak disimpan di cookie httpOnly yang terikat sesi dan berumur pendek, dan `state`
  dicek. Callback menukar `code` lewat server, lalu kunci langsung dienkripsi dan disimpan.
- **Router AI:** `resolveTaskKey` memilih kunci BYOK untuk paket BYOK, dan mencatat `ai_calls.byok = true`. Bila gagal
  karena kunci (401/402/403), pesan khusus "kunci BYOK bermasalah", tanpa fallback ke kunci platform.

## Gelombang implementasi

Worker OpenCode, maksimal 2 paralel, kepemilikan berkas terpisah. Setiap gelombang ditinjau, digabung, lalu gates dijalankan.

| Gelombang | Tugas | Isi |
| --- | --- | --- |
| 1 | `m8-billing-core` | Migrasi `key_version` (bila disetujui), `lib/crypto`, aturan aktivasi dan perpanjangan paket (logika murni + uji DB nyata), `assertQuota`, klien Midtrans, pembuatan order. |
| 1 | `m8-byok-core` | OAuth PKCE (mulai + callback), simpan/uji/putuskan kunci, kunci manual, pemilihan kunci di router dan streaming mentor, tanpa fallback ke kunci platform. |
| 2 | `m8-webhook` | `/api/webhooks/midtrans`: signature, idempoten, pencocokan jumlah, aktivasi paket dalam transaksi, uji konkurensi notifikasi ganda. |
| 2 | `m8-ui` | Halaman harga di aplikasi, Pengaturan → Langganan dan Model AI, paywall lembar bawah, banner perpanjangan, tombol upgrade di setiap pesan kuota habis, kembali ke aksi tertunda. |
| 3 | `m8-e2e` | Midtrans palsu loopback (Snap + notifikasi bertanda tangan) dan OpenRouter OAuth palsu. Playwright 375px terang/gelap: upgrade dari kuota habis sampai paket aktif, notifikasi ganda, signature salah, BYOK hubung–uji–putus. `docs/M8-SETUP.md`. |

## Batas yang dipertahankan

- Harga dan batas paket hanya dibaca dari tabel `plans`; harga dan kuota tidak diubah.
- Tidak ada kunci, server key, atau data kartu di repo, log, analitik, atau fixture. Founder yang membuat akun Midtrans
  sandbox dan mengisi semua kunci.
- Data kartu tidak pernah melewati server Unbookin; semuanya di Snap Midtrans.
- Originals (pembelian satuan) baru di M9; tipe `original` di `payments` belum dipakai.
- Mobile-first 375px, terang dan gelap, target sentuh ≥ 44px, lembar bawah di ponsel.

## Verifikasi dan aktivasi

- Gates `pnpm lint && pnpm typecheck && pnpm test` dan `pnpm build` hijau di setiap gelombang; E2E lengkap di akhir.
- E2E memakai Midtrans dan OpenRouter palsu di database uji lokal; tidak ada panggilan jaringan sungguhan.
- Uji sandbox sungguhan (kartu uji Midtrans dan OAuth OpenRouter asli) dilakukan bersama founder setelah kunci sandbox
  diisi. Akun Midtrans produksi (perlu badan usaha, PRD §17 no. 3) di luar M8.
- Deploy dengan push ke `main`; migrasi `key_version` berjalan otomatis saat build Vercel.
