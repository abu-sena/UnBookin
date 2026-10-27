# Rencana M5 — Belajar

Status: **keputusan #1–#5 disetujui founder 27 Okt 2026**; #6 memakai usulan bawaan. Belum ada kode M5 yang ditulis.

M5 mencakup PRD §8 E4 (pembaca modul), E5 (kuis), dan E6 (review terjadwal). Milestone dianggap selesai bila
**Alur A berjalan sampai lulus kuis** dan **review harian berfungsi** (PRD §15).

## Hasil yang dituju

1. **Halaman Unbook (E4-01).** Jalur modul vertikal (`PathNode`: terkunci, tersedia, sedang, selesai), judul,
   big idea, progres total, tombol "Lanjutkan". Selama generasi berjalan, halaman ini tetap menampilkan layar
   progres yang sudah ada.
2. **Halaman modul (E4-02, AC1–AC8).**
   - Tiga tab Pahami · Terapkan · Buktikan yang bisa digeser.
   - Lapisan Sederhana · Praktisi · Ahli, dengan lapisan terdalam yang dibuka dicatat.
   - Peta konsep interaktif (zoom dan geser) dan chip "hlm. X" yang membuka kutipan pendek di lembar bawah.
   - Checklist alat yang tersimpan dan tombol "Jadikan aksi saya" (aksi baru, tenggat +7 hari).
   - Modul ditandai dibaca (+20 XP sekali), plus ukuran huruf dan posisi baca terakhir.
3. **Kuis (E5-01, AC1–AC6).**
   - Satu soal per layar dengan umpan balik langsung.
   - Jawaban isian singkat dinilai AI (task baru `grade_short_answer`, rubrik 1–4).
   - Lulus ≥ 80% → perayaan, +30 XP, dan +10 XP bila nilai 100%.
   - Tidak lulus → layar "Hampir!", "Pelajari ulang", dan "Coba lagi" dengan soal versi baru (maks 3 versi).
4. **Review (E6-01, AC1–AC5).**
   - Kartu masuk antrean saat modul dibaca (kotak 0, jatuh tempo besok).
   - Kartu bisa dibalik, dengan tombol Lupa · Ragu · Ingat.
   - Interval 1/3/7/14/30/60 hari.
   - Maks 20 kartu per sesi; +10 XP sekali per hari.
   - Angka kartu jatuh tempo tampil di tab Review.
5. **Ujung Alur A.** Beranda menampilkan aksi aktif, modul berikutnya, dan jumlah review besok.

## Titik awal yang sudah tersedia

- Tabel `module_progress`, `quiz_attempts`, `card_states`, `actions`, `xp_events`, dan `user_stats` sudah ada
  sejak M0. Konten modul, kuis 6–8 soal, dan 5–8 kartu dibuat oleh M4.
- `lib/ai/structured.ts` (router AI), prompt kuis M4, dan `resolveTimeZone` (zona waktu profil) siap dipakai ulang.
- Halaman Review masih berupa state kosong; `/unbook/[unbookId]` masih hanya menampilkan layar progres.

## Keputusan founder

| # | Pertanyaan | Usulan |
| --- | --- | --- |
| 1 | XP di M5 padahal mesin game (level, streak, lencana) baru di M6 | M5 hanya mencatat `xp_events` (idempoten) dan menambah `user_stats.total_xp` lewat `lib/game/xp.ts` dengan unit test. Level, streak, lencana (termasuk "Langkah Pertama") di M6. Nilai XP persis seperti PRD. |
| 2 | Checklist alat "tersimpan" belum punya kolom | Tambah kolom aditif `module_progress.checklist jsonb` (nullable). Migrasi kecil, aman untuk production. |
| 3 | AI penilai isian singkat gagal atau belum dikonfigurasi | Tampilkan jawaban model dan rubrik, lalu pengguna menilai sendiri "Sudah sesuai / Belum". Ditandai `selfGraded` di `answers`. Kuis tidak macet. |
| 4 | Ukuran huruf dan posisi baca terakhir | Disimpan di perangkat (`localStorage`), tanpa perubahan skema. Tema terang/gelap sudah ada. |
| 5 | Peta konsep | Pustaka gratis `@dagrejs/dagre` (MIT) untuk tata letak, dirender sebagai SVG dengan pinch-zoom dan geser buatan sendiri, dimuat malas agar JS awal rute tetap ≤ 200 KB. |
| 6 | Soal versi baru saat "Coba lagi" | Dibuat di latar belakang lewat fungsi Inngest `regenerate-quiz` (memakai task `quiz` yang sama). Tidak memotong kuota Unbook. Bila belum siap, pengguna mengulang versi yang ada. |

Kolom baru (#2) mengubah skema, jadi butuh izin; nilai XP, kuota, dan harga tidak diubah.

## Gelombang implementasi

Pengerjaan oleh worker OpenCode (rantai berat, DeepSix di depan), maksimal 2 paralel, dengan berkas yang tidak
saling tumpang tindih. Setiap gelombang ditinjau, digabung, lalu gates dijalankan.

| Gelombang | Tugas | Isi |
| --- | --- | --- |
| 1 | `m5-core` | Migrasi kolom `checklist`. Logika murni dengan unit test: penjadwal kotak review (`lib/learning/leitner.ts`), penilaian dan aturan lulus kuis, `lib/game/xp.ts` (idempoten). Query dan Server Actions yang selalu memakai `requireUser()`: tandai dibaca (+ antrean kartu), lapisan terdalam, checklist, buat aksi, simpan jawaban kuis, nilai kartu review. |
| 1 | `m5-ui-kit` | Komponen §12.7: `PathNode`, `LayerToggle`, `ConceptMap`, `SourceRef` + lembar bawah kutipan, `ActionCard`, `FlipCard`, `XPToast`; semuanya ditambahkan ke `/dev/ui`. |
| 2 | `m5-reader` | Halaman Unbook (jalur modul) dan halaman modul tiga tab, mode baca, tanda dibaca. |
| 2 | `m5-quiz` | Halaman kuis, umpan balik, task `grade_short_answer` (prompt, skema Zod, validator, cadangan penilaian mandiri), layar lulus/"Hampir!", fungsi `regenerate-quiz` (maks 3 versi). |
| 3 | `m5-review` | Halaman Review (sesi 20 kartu, balik kartu, tiga tombol, ringkasan, +10 XP harian), angka jatuh tempo di navigasi bawah, kartu "Hari ini" di Beranda. |
| 3 | `m5-e2e` | Skrip seed khusus DB uji lokal (menolak host Neon/Vercel) yang membuat Unbook siap memakai penyedia palsu M4. Uji Playwright 375px: Alur A dari halaman Unbook sampai lulus kuis, lalu review keesokan harinya. |

## Batas yang dipertahankan

- Semua teks UI lewat `messages/id.json`; tidak ada ID model di kode (task baru diisi di `ai_task_configs`).
- Jawaban AI selalu divalidasi Zod; isi jawaban pengguna dan teks sumber tidak masuk log atau analitik.
- Setiap query data pengguna difilter `user_id` dari sesi; kepemilikan modul dicek lewat Unbook pemiliknya.
- Kuota Unbook tidak berubah; kuis versi baru dan penilaian isian tidak memotong kuota.
- Mobile-first 375px, terang dan gelap, target sentuh ≥ 44px, animasi mati saat `prefers-reduced-motion`,
  lembar bawah (bukan modal) di ponsel, skeleton untuk memuat.

## Verifikasi dan aktivasi

- Gates `pnpm lint && pnpm typecheck && pnpm test` dan `pnpm build` hijau di setiap gelombang.
- Cek browser 375px terang/gelap untuk halaman Unbook, modul (ketiga tab), kuis (lulus dan "Hampir!"), dan Review.
- E2E Alur A di DB uji lokal dengan penyedia palsu. Di production, alur ini baru bisa diuji setelah founder
  mengisi model `ai_task_configs` (termasuk `grade_short_answer`) dan kunci OpenRouter serta Inngest.
- Deploy dengan push ke `main`; migrasi kolom `checklist` berjalan otomatis saat build Vercel.
