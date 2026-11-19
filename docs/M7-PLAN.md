# Rencana M7 — Mentor AI

Status: **kode selesai 19 Nov 2026** (keputusan #1–#4 disetujui founder 3 Nov 2026). E2E 375 px terang/gelap lulus dengan penyedia palsu; mutu jawaban model nyata menunggu konfigurasi founder (`docs/M7-SETUP.md`).

M7 mencakup PRD §8 E10-01 (AC1–AC6). Milestone selesai bila **jawaban bersitasi** dan **kuota pesan bekerja** (PRD §15).

## Hasil yang dituju

1. **Tombol "Tanya Mentor"** di halaman Unbook dan modul membuka lembar bawah layar penuh di ponsel (dialog di desktop). Panel kanan desktop dari §12 bersifat opsional dan tidak dibuat di M7.
2. **Jawaban dari sumber (RAG).** Pertanyaan di-embed, lalu 8 chunk teratas diambil dari sumber Unbook itu saja, memadukan pgvector cosine dan full-text. Jawaban memuat sitasi "hlm. X" yang bisa diketuk dan membuka kutipan pendek.
3. **Jujur soal batas sumber.** Bila jawaban tidak ada di sumber, mentor mengatakannya. Pengetahuan umum boleh ditambahkan, tetapi tampil dalam blok berlabel "Di luar sumber".
4. **Persona per minat** dari `lib/ai/personas/*.md`, plus satu pertanyaan reflektif di akhir jawaban bila relevan.
5. **Streaming** token demi token, tombol hentikan, dan 3 saran pertanyaan di awal percakapan.
6. **Kuota pesan** sesuai paket (Gratis 20, Pro 300, BYOK tanpa batas). Sisa kuota selalu terlihat.

## Titik awal yang sudah tersedia

- **Tidak perlu perubahan skema.** Tabel `mentor_threads`, `mentor_messages` (termasuk `citations`, token), `usage_counters.mentor_messages_used`, batas paket `mentorMessagesPerMonth`, indeks HNSW dan GIN pada `source_chunks` sudah ada sejak M0.
- `lib/ai/run-task.ts` (embedding dengan kunci platform), `lib/ai/structured.ts` (`resolveTaskKey` tempat BYOK masuk di M8, pencatatan `ai_calls`), `getSourceExcerpt` dan `SourceRef` (kutipan), `getLocalMonthPeriod` (periode lokal), `components/layout/sheet.tsx`.
- Yang belum ada: streaming AI, pencarian chunk, logika kuota mentor, batas laju, persona, dan seluruh UI chat.

## Keputusan founder

| # | Pertanyaan | Usulan |
| --- | --- | --- |
| 1 | Kapan satu pesan memotong kuota | Dipesan secara atomik sebelum memanggil AI, dikembalikan bila gagal sebelum ada jawaban. Bila pengguna menekan "hentikan" setelah jawaban mulai tampil, pesan tetap terhitung karena biaya AI sudah terpakai. |
| 2 | Nama persona mentor (PRD §17 no. 4) | Sementara memakai nama peran yang netral (mis. "Mentor Kepemimpinan"). Isinya berkas Markdown, jadi mudah diganti founder kapan saja. Persona Studi Islam memakai nada santun dan tidak mengeluarkan fatwa. |
| 3 | Jumlah percakapan per Unbook | Satu percakapan berkelanjutan per pengguna per Unbook, dengan riwayat tersimpan. Paling sederhana di ponsel; banyak percakapan bisa ditambah kemudian tanpa ubah skema. |
| 4 | Saat kuota habis | Pesan tenang berisi tanggal kuota terisi lagi dan tautan ke harga. Paywall lembar bawah penuh dan pembayaran dibangun di M8. |

Usulan bawaan yang tidak mengubah bisnis:

- **Saran pertanyaan** disusun dari judul modul dan konsep yang sudah ada, tanpa panggilan AI, jadi instan dan tanpa biaya.
- **Batas laju** 30 pesan per menit (PRD §11) dihitung dari `mentor_messages`, tanpa layanan baru.
- **Riwayat** yang dikirim ke AI dibatasi 6 giliran terakhir agar biaya terkendali.

## Rancangan teknis

- **Rute** `POST /api/mentor/[threadId]` (PRD §14) mengalirkan Server-Sent Events: `delta`, `done` (sitasi, sisa kuota), `error` (kode aman). Karena bukan Server Action, rute wajib memeriksa sesi dan header `Origin` sendiri.
- **Urutan satu pesan:** cek sesi dan kepemilikan → Zod (maks 2.000 karakter) → batas laju → pesan kuota → simpan pesan pengguna → embed + cari chunk → stream → simpan jawaban, sitasi, token.
- **Router streaming** `streamChatTask` memakai `ai_task_configs` (task `mentor_chat`) dan `resolveTaskKey`. Model cadangan hanya dipakai bila gagal sebelum token pertama. Satu baris `ai_calls` per panggilan. Batas waktu dalam `maxDuration = 300`.
- **Pencarian hibrida:** gabungan peringkat cosine dan full-text (`simple`) dengan Reciprocal Rank Fusion, selalu difilter `source_id`. Bila embedding gagal, tetap berjalan dengan full-text saja dan tidak memotong kuota karena alasan itu.
- **Sitasi:** model menulis penanda `[[1]]` yang merujuk nomor chunk. Server memetakannya ke chunk id dan halaman, membuang nomor yang tidak diberikan, lalu memvalidasi dengan Zod sebelum disimpan. Pengguna tidak pernah melihat penanda mentah, juga saat streaming.
- **Blok di luar sumber** ditandai penanda khusus dalam protokol jawaban dan dirender sebagai blok berlabel.
- **Keamanan prompt:** teks sumber, riwayat, dan pertanyaan diperlakukan sebagai data (`wrapSource`, `DATA_NOT_INSTRUCTIONS`). Kutipan langsung tetap pendek (§7.3).
- **Persona** dibaca dari berkas `.md` berdasarkan daftar slug minat yang tetap, dengan `outputFileTracingIncludes` agar ikut terkemas di Vercel; dibuktikan lewat build.

## Gelombang implementasi

Worker OpenCode, maksimal 2 paralel, kepemilikan berkas terpisah. Setiap gelombang ditinjau, digabung, lalu gates dijalankan.

| Gelombang | Tugas | Isi |
| --- | --- | --- |
| 1 | `m7-ai` | `streamChatTask`, pencarian hibrida, pengurai sitasi dan blok di luar sumber (tahan penanda terpotong antar-token), prompt berversi `mentor_chat@1`, persona, unit test. |
| 1 | `m7-data` | Thread per Unbook, simpan pesan, pesan/kembalikan kuota secara atomik, batas laju, sisa kuota, riwayat, saran pertanyaan, unit test dan uji DB nyata (dua permintaan bersamaan pada sisa 1 kuota). |
| 2 | `m7-route` | Rute SSE, pemeriksaan sesi dan `Origin`, urutan satu pesan, hentikan menyimpan jawaban parsial, pencatatan analitik tanpa isi pesan. |
| 2 | `m7-ui` | Lembar chat, gelembung pesan, render streaming, chip sitasi, blok di luar sumber, tombol hentikan, saran pertanyaan, sisa kuota, state kosong dan error, tombol "Tanya Mentor", `/dev/ui`. |
| 3 | `m7-e2e` | Penyedia palsu loopback yang streaming. Playwright 375px terang/gelap: jawaban bersitasi, ketuk sitasi, di luar sumber, hentikan, kuota habis, pengguna lain ditolak. `docs/M7-SETUP.md`. |

## Batas yang dipertahankan

- Tidak ada ID model di kode; founder mengisi `mentor_chat` di `ai_task_configs`.
- Isi pesan dan teks sumber tidak masuk log atau analitik.
- Identitas selalu dari sesi; thread dan chunk selalu difilter pemilik dan sumber Unbook.
- Harga, batas paket, dan aturan XP tidak berubah; mengobrol dengan mentor tidak memberi XP.
- Pemilihan kunci BYOK dan paywall penuh tetap di M8. Originals (M9) tidak punya mentor sampai M9.
- Mobile-first 375px, terang dan gelap, target sentuh ≥ 44px, skeleton, `prefers-reduced-motion`.

## Verifikasi dan aktivasi

- Gates `pnpm lint && pnpm typecheck && pnpm test` dan `pnpm build` hijau di setiap gelombang.
- E2E di database uji lokal dengan penyedia palsu; tidak memakai `.env.local` atau production.
- Penyedia palsu hanya membuktikan alur. Mutu jawaban dan kepatuhan sitasi model sungguhan baru bisa dinilai setelah founder mengisi `mentor_chat`, model embedding, dan kunci OpenRouter. Setelah itu dijalankan pemeriksaan kecil: pertanyaan yang ada di sumber, yang tidak ada, dan upaya injeksi.
- Deploy dengan push ke `main`. Tidak ada migrasi.
